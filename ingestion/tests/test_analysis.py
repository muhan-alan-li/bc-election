import io
import json
import os
from pathlib import Path
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch
from election.analysis.provider import ChatProvider, ModelError
from election.analysis.service import prepare, validate_interpretation, run, summarize, project_analysis, load_env, cache_key
from election.storage import atomic_json, read_json

class FakeProvider:
    identity = {'endpoint': 'https://model.example/chat/completions', 'model': 'fixture', 'max_output_tokens': 2500, 'extra_body': {}}
    max_output_tokens = 2500
    def __init__(self): self.calls = 0
    def complete(self, messages):
        self.calls += 1
        return answer(json.loads(messages[-1]['content'])), {'usage': {'prompt_tokens': 100, 'completion_tokens': 50}, 'resolved_model': 'fixture'}

def answer(payload, **overrides):
    result = {'decision_id': payload['decision_id'], 'decision_type': 'policy', 'summary': 'Vote on stronger tenant protections.',
        'interpretations': [{'issue_id': 'tenant-protections', 'yea_effect': 'supports', 'nay_effect': 'unclear', 'evidence_strength': 'clear',
        'explanation': 'Yea approves stronger protections; rejection leaves alternatives unresolved.',
        'citations': [{'evidence_id': 'transcript', 'quote': 'This bill strengthens legal protections for residential tenants.'}]}],
        'limitations': ['Does not establish personal motivation.']}
    result.update(overrides); return result

class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = {'election': {'id': 'test'}, 'political_analysis': {'requests_per_minute': 120}}
    def profile(self, name='Alex', person='p', position='yea', reviewed=True, bills=1, stages=('2R',)):
        actions = []
        for bill in range(1, bills + 1):
            for stage in stages:
                actions.append({'id': f'{name}-b{bill}-{stage}', 'person_id': person, 'record_type': 'recorded_vote',
                    'subject': f'Tenancy Act (Bill {bill})', 'stage': stage, 'position': position, 'date': f'2026-01-0{bill}',
                    'transcript_url': f'https://leg.example/Debates/session/2026010{bill}-Hansard.html#{stage}',
                    'source': {'url': 'https://leg.example/index'}, 'transcript_source': {'url': f'https://leg.example/Debates/session/2026010{bill}-Hansard.html', 'sha256': f'hash-{bill}'},
                    'transcript_context': {'status': 'extracted_needs_review', 'excerpt': 'This bill strengthens legal protections for residential tenants.'},
                    'attribution_status': 'reviewed' if reviewed else 'suggested'})
        p = {'id': name, 'person_id': person, 'ballot_name': name, 'district_code': 'SYN', 'election_id': 'test', 'actions': actions}
        atomic_json(self.root / 'normalized/political/test/candidates' / (name + '.json'), p); return p
    def test_shared_decisions_cache_and_attribution_gate(self):
        self.profile(); self.profile('Blair', 'b', 'nay', False); provider = FakeProvider()
        with patch('election.analysis.service.time.sleep'): audit = run(self.root, self.config, provider=provider, max_calls=10)
        self.assertEqual(provider.calls, 1); self.assertEqual(audit['estimate']['decisions'], 1)
        self.assertEqual(audit['prompt_tokens'], 100)
        private = read_json(self.root / 'normalized/analysis/test/candidates/Blair.json')
        self.assertEqual(private['issue_findings'][0]['counts']['unclear'], 1)
        self.assertEqual(read_json(self.root / 'curated/datasets/analysis/test/candidates/Blair.json')['issue_findings'], [])
        before = (self.root / 'curated/datasets/analysis/test/candidates/Alex.json').read_bytes()
        with patch.object(provider, 'complete', side_effect=AssertionError('Network call')): repeat = run(self.root, self.config, provider=provider, offline=True)
        self.assertEqual(repeat['cache_hits'], 1)
        self.assertEqual(before, (self.root / 'curated/datasets/analysis/test/candidates/Alex.json').read_bytes())
    def test_readings_collapsed_and_minimum_distinct_events(self):
        self.profile(stages=('1R','2R','3R'))
        with patch('election.analysis.service.time.sleep'): run(self.root, self.config, provider=FakeProvider(), max_calls=10)
        finding = read_json(self.root / 'curated/datasets/analysis/test/candidates/Alex.json')['issue_findings'][0]
        self.assertEqual(finding['counts']['supports'], 1); self.assertEqual(finding['status'], 'insufficient_evidence')
        self.profile(bills=3, stages=('2R','3R'))
        with patch('election.analysis.service.time.sleep'): run(self.root, self.config, provider=FakeProvider(), max_calls=10)
        finding = read_json(self.root / 'curated/datasets/analysis/test/candidates/Alex.json')['issue_findings'][0]
        self.assertEqual(finding['counts']['supports'], 3); self.assertEqual(finding['status'], 'evidence_suggests_support')
    def test_reject_hallucinated_quotes_ids_and_issues(self):
        self.profile(); _, jobs, _ = prepare(self.root, 'test'); job = next(iter(jobs.values()))
        validate_interpretation(answer(job['payload']), job)
        bad = answer(job['payload']); bad['interpretations'][0]['citations'][0]['quote'] = 'A quotation that was never supplied.'
        with self.assertRaisesRegex(ValueError, 'not present'): validate_interpretation(bad, job)
        bad = answer(job['payload']); bad['interpretations'][0]['issue_id'] = 'invented'
        with self.assertRaisesRegex(ValueError, 'Unknown'): validate_interpretation(bad, job)
        with self.assertRaisesRegex(ValueError, 'wrong decision'): validate_interpretation(answer(job['payload'], decision_id='other'), job)
    def test_call_limit_and_invalidating_changed_sources_or_identity(self):
        profile = self.profile(bills=3)
        with patch('election.analysis.service.time.sleep'): audit = run(self.root, self.config, provider=FakeProvider(), max_calls=1)
        self.assertEqual(audit['model_calls'], 1)
        self.assertEqual(project_analysis(self.root, 'test', profile)['coverage']['pending_actions'], 2)
        profile['actions'][0]['attribution_status'] = 'suggested'; self.assertIsNone(project_analysis(self.root, 'test', profile))
        profile = self.profile(bills=3); profile['actions'][0]['transcript_context']['excerpt'] += ' Updated version.'
        self.assertIsNone(project_analysis(self.root, 'test', profile))
        atomic_json(self.root / 'normalized/political/test/candidates/Alex.json', profile)
        with patch('election.analysis.service.time.sleep'): rerun = run(self.root, self.config, provider=FakeProvider(), max_calls=10)
        self.assertGreater(rerun['model_calls'], 0)
    def test_omnibus_excluded_from_directional_counts(self):
        p = self.profile(bills=3); _, jobs, refs = prepare(self.root, 'test'); provider = FakeProvider()
        results = {jid: {'interpretation': answer(job['payload'], decision_type='omnibus'), 'provider': provider.identity, 'cache_key': cache_key(job, provider)} for jid, job in jobs.items()}
        finding = summarize([p], jobs, refs, results, reviewed_only=True)[0]['issue_findings'][0]
        self.assertEqual(finding['counts']['supports'], 0); self.assertEqual(finding['counts']['unclear'], 3)
    def test_env_is_literal_and_existing_values_win(self):
        path = self.root / '.env'; path.write_text('TEST_KEY="example-value"\nUNTRUSTED=$(do-not-run)\n')
        with patch.dict(os.environ, {'TEST_KEY': 'existing'}, clear=True):
            load_env(path); self.assertEqual(os.environ['TEST_KEY'], 'existing'); self.assertEqual(os.environ['UNTRUSTED'], '$(do-not-run)')
    def test_review_rejection_excludes_output_without_retrying(self):
        profile = self.profile(); provider = FakeProvider()
        run(self.root, self.config, provider=provider, max_calls=1)
        _, jobs, _ = prepare(self.root, 'test')
        key = cache_key(next(iter(jobs.values())), provider)
        atomic_json(self.root / 'normalized/analysis/test/reviews' / (key + '.json'),
                    {'cache_key': key, 'status': 'rejected', 'reason': 'Policy direction not supported.'})
        audit = run(self.root, self.config, provider=provider, max_calls=1)
        self.assertEqual(audit['model_calls'], 0)
        self.assertEqual(audit['estimate']['review_rejected_decisions'], 1)
        output = project_analysis(self.root, 'test', profile)
        self.assertEqual(output['issue_findings'], [])
        self.assertEqual(output['coverage']['pending_actions'], 1)
    def test_concurrent_workers_respect_call_limit_and_account_usage(self):
        profile = self.profile(bills=5)
        barrier = Barrier(3)
        class ParallelProvider(FakeProvider):
            def complete(self, messages):
                barrier.wait(timeout=2)
                return super().complete(messages)
        config = {**self.config, 'political_analysis': {'workers': 3, 'requests_per_minute': 120}}
        with patch('election.analysis.service.time.sleep'):
            audit = run(self.root, config, provider=ParallelProvider(), max_calls=3)
        self.assertEqual(audit['model_calls'], 3)
        self.assertEqual(audit['prompt_tokens'], 300)
        self.assertEqual(audit['completion_tokens'], 150)
        self.assertEqual(audit['errors'], [])
        self.assertEqual(project_analysis(self.root, 'test', profile)['coverage']['pending_actions'], 2)
    def test_invalid_model_json_does_not_stop_remaining_decisions(self):
        self.profile(bills=3)
        class BadFirstProvider(FakeProvider):
            def complete(self, messages):
                if self.calls == 0:
                    self.calls += 1
                    raise ModelError('Model returned invalid JSON', {'prompt_tokens': 10, 'completion_tokens': 5}, endpoint_failure=False)
                return super().complete(messages)
        with patch('election.analysis.service.time.sleep'):
            audit = run(self.root, self.config, provider=BadFirstProvider(), max_calls=3)
        self.assertEqual(audit['model_calls'], 3)
        self.assertEqual(audit['available_decisions'], 2)
        self.assertEqual(audit['prompt_tokens'], 210)
        self.assertEqual(len(audit['errors']), 1)
    def test_endpoint_failure_stops_queued_work(self):
        self.profile(bills=3)
        class UnavailableProvider(FakeProvider):
            def complete(self, messages):
                raise ModelError('Model endpoint could not be reached')
        audit = run(self.root, self.config, provider=UnavailableProvider(), max_calls=3)
        self.assertEqual(audit['model_calls'], 1)
        self.assertEqual(audit['available_decisions'], 0)
        self.assertEqual(len(audit['errors']), 1)
    def test_transport_json_and_truncation(self):
        p = ChatProvider(base_url='https://api.deepseek.com/v1', model='deepseek-flash', api_key_env='TEST_KEY', extra_body={'thinking': {'type': 'disabled'}})
        response = {'choices': [{'finish_reason':'stop','message':{'content':'{"valid":true}'}}], 'usage': {'prompt_tokens':10,'completion_tokens':5}}
        with patch.dict(os.environ, {'TEST_KEY':'test-only'}), patch('election.analysis.provider.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as mocked:
            result, _ = p.complete([{'role':'user','content':'Return JSON'}]); payload=json.loads(mocked.call_args[0][0].data)
            self.assertEqual(result, {'valid':True}); self.assertEqual(payload['thinking'], {'type':'disabled'}); self.assertEqual(payload['response_format'], {'type':'json_object'})
        response['choices'][0]['finish_reason']='length'
        with patch.dict(os.environ, {'TEST_KEY':'test-only'}), patch('election.analysis.provider.urlopen', return_value=io.BytesIO(json.dumps(response).encode())):
            with self.assertRaisesRegex(ModelError,'incomplete'): p.complete([])

if __name__ == '__main__': unittest.main()
