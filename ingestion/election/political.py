"""Topic-organized political evidence. Extraction never approves attribution or alignment."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag

from .parsers import name_key
from .pipeline import safe_id, portable
from .storage import SourceStore, atomic_json, now, read_json
from .workflow import source_ref, stable_id

TOPICS = {
    'housing': ('housing', 'tenancy', 'tenant', 'rent', 'homeless', 'mortgage', 'zoning'),
    'healthcare': ('health', 'hospital', 'medical', 'doctor', 'nurse', 'mental health', 'addiction'),
    'education': ('education', 'school', 'student', 'teacher', 'child care', 'childcare', 'university'),
    'economy-taxation': ('tax', 'taxation', 'budget', 'finance', 'economic', 'economy', 'jobs', 'labour', 'labor', 'worker', 'business', 'supply act'),
    'environment-energy': ('climate', 'environment', 'energy', 'electricity', 'emission', 'forest', 'forestry', 'mining', 'pipeline', 'conservation'),
    'public-safety-justice': ('crime', 'police', 'justice', 'court', 'bail', 'public safety', 'protection', 'victim'),
    'transportation': ('transit', 'transport', 'transportation', 'road', 'highway', 'ferry', 'ferries', 'motor vehicle'),
    'indigenous-relations': ('indigenous', 'first nations', 'reconciliation', 'aboriginal', 'treaty'),
    'government-democracy': ('election', 'electoral', 'democracy', 'democratic', 'transparency', 'accountability', 'local government', 'municipal'),
    'social-policy-rights': ('disability', 'disabled', 'poverty', 'income assistance', 'human rights', 'gender', 'equality', 'seniors', 'veterans'),
}
TRANSCRIPT_PARSER_VERSION = 2


def categorize(text):
    matches = {topic: sorted({term for term in terms if re.search(r'(?<!\w)' + re.escape(term) + r'(?:s|es)?(?!\w)', text, re.I)})
               for topic, terms in TOPICS.items()}
    matches = {topic: terms for topic, terms in matches.items() if terms}
    return {'topics': sorted(matches) or ['uncategorized'], 'topic_status': 'suggested',
            'topic_method': 'keyword-v1', 'topic_evidence': matches}


class Transcript(HTMLParser):
    """Preserve paragraph/table boundaries and IDs used by member-index locators."""
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.blocks, self.current, self.depth = [], None, 0
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.current is None and tag in {'p', 'table'}:
            css = attrs.get('class', '')
            css = {'speaker-begins': 'SpeakerBegins', 'speaker-continues': 'SpeakerContinues',
                   'subject-heading': 'Subject-Heading', 'timeline': 'Time-Stamp',
                   'styleline-time': 'Time-Line', 'division-table': 'DivisionTable'}.get(css, css)
            self.current = {'tag': tag, 'id': attrs.get('id'), 'class': css, 'text': '', 'speaker': ''}
            self.depth = 1
            self.in_speaker = False
        elif self.current is not None:
            if tag == self.current['tag']:
                self.depth += 1
            if tag == 'span' and ('Speaker-Name' in attrs.get('class', '') or attrs.get('class') == 'attribution'):
                self.in_speaker = True
            if attrs.get('id') and not self.current['id']:
                self.current['id'] = attrs['id']
            if tag in {'br', 'td', 'th', 'tr'}:
                self.current['text'] += ' '

    def handle_data(self, text):
        if self.current is not None:
            self.current['text'] += text
            if self.in_speaker:
                self.current['speaker'] += text

    def handle_endtag(self, tag):
        if self.current is None:
            return
        if tag == 'span':
            self.in_speaker = False
        if tag == self.current['tag']:
            self.depth -= 1
            if not self.depth:
                for key in ('text', 'speaker'):
                    self.current[key] = ' '.join(self.current[key].split())
                self.current['speaker'] = self.current['speaker'].rstrip(': ')
                self.blocks.append(self.current)
                self.current = None


def division_context(blocks, locator):
    positions = [i for i, block in enumerate(blocks) if block['id'] == locator]
    if len(positions) > 1:
        timestamps = [i for i in positions if blocks[i]['class'] == 'Time-Stamp']
        if len(timestamps) == 1 and all('Time-' in blocks[i]['class'] for i in positions):
            positions = timestamps
    if len(positions) != 1:
        return {'status': 'locator_ambiguous' if positions else 'locator_not_found', 'question': None, 'outcome': None}
    pos = positions[0]
    # A timestamp can contain multiple divisions. Never pick one arbitrarily.
    end = next((i for i in range(pos + 1, len(blocks)) if 'Time-' in blocks[i]['class']
                or ('Subject-Heading' in blocks[i]['class'] and blocks[i]['id'])), len(blocks))
    start = max(0, pos - 12)
    previous_time = next((i for i in range(pos - 1, start - 1, -1) if 'Time-' in blocks[i]['class']), None)
    if previous_time is not None:
        start = previous_time
    headings = [i for i in range(start, pos + 1) if 'Subject-Heading' in blocks[i]['class']]
    if headings:
        start = headings[-1]
    nearby = blocks[start:end]
    tables = [b for b in nearby if 'division' in b['class'].casefold() or re.search(r'YEAS\s*[—–-]', b['text'], re.I)]
    outcomes = [b['text'] for b in nearby if re.search(r'(?:motion|amendment|bill|clause|question).*?(?:carried|approved|negatived|defeated)', b['text'], re.I)
                and not b['speaker'] and 'Speaker' not in b['class']]
    question_lines = [b['text'] for b in nearby if re.search(r'\b(?:the question is|question on|i move|moved that|be read|be adopted)\b', b['text'], re.I)]
    excerpt = '\n'.join(b['text'] for b in nearby if b['tag'] != 'table')
    unique = len(outcomes) == 1 and (len(tables) == 1 or (not tables and 'division' in outcomes[0].casefold()))
    return {'status': 'extracted_needs_review' if unique else 'ambiguous_needs_review',
            'question': question_lines[-1] if unique and question_lines else None,
            'outcome': outcomes[0] if unique else None,
            'tally': tables[0]['text'] if unique and tables else None, 'excerpt': excerpt,
            'locator': locator, 'review_status': 'unreviewed'}


def platform_passages(platform):
    """Verbatim policy/commitment leads, including adjacent list items; no paraphrases."""
    results, seen = [], set()
    for doc in platform.get('documents', []):
        for page in doc.get('pages', []):
            lines = page['text'].splitlines()
            for i, line in enumerate(lines):
                text = ' '.join(line.split())
                if not 35 <= len(text) <= 1800 or text.casefold() in seen:
                    continue
                topics = categorize(text)
                commitment = bool(re.search(r'\b(?:we will|i will|we would|i would|we commit|i commit|pledge to|promise to|our plan|our platform|we propose|we must|we need to)\b', text, re.I))
                if not commitment and topics['topics'] == ['uncategorized']:
                    continue
                if re.search(r'\b(?:privacy|cookies|donate|all rights reserved|sign up|email address)\b', text, re.I):
                    continue
                seen.add(text.casefold())
                results.append({'id': stable_id('policy-passage', platform['id'], doc['id'], str(page['page']), str(i + 1)),
                    'platform_id': platform['id'], 'scope': 'candidate_source' if platform['kind'] == 'candidate_platform' else 'party_source',
                    'authorship_status': 'not_established',
                    'record_type': 'commitment_lead' if commitment else 'policy_passage', 'text': text,
                    'context': '\n'.join(lines[max(0, i-1):i+2]),
                    'document_id': doc['id'], 'source': doc['source'],
                    'locator': {'page': page['page'], 'line': i + 1}, 'date': None,
                    'date_status': 'not_established', 'review_status': 'unreviewed', **topics})
    return results


def speaker_key(name):
    return name_key(re.sub(r'\b(?:Hon\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s*', '', name, flags=re.I))


def collect_transcripts(root, election_id, *, offline=False, refresh=False, workers=4, raw_root=None):
    root = Path(root)
    paths = sorted((root / 'normalized' / safe_id(election_id) / 'candidate-records').glob('candidacy*.json'))
    if not paths:
        raise ValueError('Collect candidate records before collecting political evidence')
    urls = sorted({urldefrag(v['transcript_url'])[0] for p in paths for v in read_json(p)['vote_index_entries']})
    target = root / 'normalized/political' / election_id / 'transcripts'
    def job(url):
        path = target / (stable_id('transcript', url) + '.json')
        previous = read_json(path)
        if previous and not refresh and previous.get('blocks') and previous.get('parser_version') == TRANSCRIPT_PARSER_VERSION:
            return {'url': url, 'status': 'reused'}
        store = SourceStore(root, offline=offline, refresh=refresh, raw_root=raw_root)
        try:
            data, meta = store.get(url)
            blocks = Transcript(data.decode('utf-8-sig', errors='replace')).blocks
            if not blocks or not any('Speaker' in b['class'] or 'Time-' in b['class'] for b in blocks):
                raise ValueError('Response is not a supported Assembly transcript')
            output = {'schema_version': 1, 'url': url, 'generated_at': now(), 'blocks': blocks,
                      'parser_version': TRANSCRIPT_PARSER_VERSION,
                      'source': source_ref(meta, 'Assembly debate transcript', 'Legislative Assembly of BC')}
            atomic_json(path, output)
            path.with_suffix('.attempt.json').unlink(missing_ok=True)
            return {'url': url, 'status': 'collected'}
        except (ValueError, OSError) as error:
            result = {'url': url, 'status': 'failed', 'error': str(error), 'generated_at': now()}
            atomic_json(path.with_suffix('.attempt.json'), result)
            return result
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(job, url) for url in urls]
        for future in as_completed(futures):
            results.append(future.result())
            if len(results) % 20 == 0:
                print(f'Transcripts: {len(results)}/{len(urls)}', flush=True)
    audit = {'generated_at': now(), 'election_id': election_id, 'expected_transcripts': len(urls),
             'results': sorted(results, key=lambda x: x['url'])}
    atomic_json(root / 'normalized/political' / election_id / 'transcript-audit.json', audit)
    return audit


def build_profiles(root, election_id):
    """Offline, repeatable assembly. Public projection excludes unreviewed identities."""
    root, election_id = Path(root), safe_id(election_id)
    records = [read_json(p) for p in sorted((root / 'normalized' / election_id / 'candidate-records').glob('candidacy*.json'))]
    if not records:
        raise ValueError('No candidate records found')
    registry = read_json(root / 'curated/identities.json')
    expected = {c['id'] for c in registry.get('candidacies', []) if c['election_id'] == election_id}
    actual = {r['candidacy_id'] for r in records}
    if expected and expected != actual:
        raise ValueError(f'Candidate evidence does not cover the registered roster: {len(expected - actual)} missing, {len(actual - expected)} unexpected')
    if len(actual) != len(records) or any(r.get('election_id', election_id) != election_id for r in records):
        raise ValueError('Duplicate candidacy or wrong election in candidate evidence')
    people = {p['id']: p for p in registry['people']}
    platforms = [read_json(p) for p in sorted((root / 'normalized/platforms' / election_id).glob('*/*.json')) if not p.name.endswith('.attempt.json')]
    candidate_platforms = {(p['district_code'], p['ballot_name']): p for p in platforms if p['kind'] == 'candidate_platform'}
    party_platforms = {p['id']: p for p in platforms if p['kind'] == 'party_platform'}
    transcripts = {p['url']: p for path in sorted((root / 'normalized/political' / election_id / 'transcripts').glob('*.json'))
                   if not path.name.endswith('.attempt.json') and (p := read_json(path)).get('blocks')}
    passage_map = {p['id']: platform_passages(p) for p in platforms}
    reviewed_claims = read_json(root / 'curated/platform-commitments.json', {})
    from .pipeline import validate_platform
    for platform in platforms:
        validate_platform({**platform, 'commitments': reviewed_claims.get(platform['id'], [])})
    # Match shortened Hansard speaker labels against explicit member-index leads.
    owners = {}
    for record in records:
        person = people[record['person_id']]
        labels = set(person.get('legislative_aliases', [])) | set(record.get('voting_aliases', []))
        for label in labels:
            clean = re.sub(r'\b(?:Hon\.|K\.C\.)\s*', '', label)
            if ',' in clean:
                surname, given = clean.split(',', 1)
                variants = [given.strip() + ' ' + surname.strip(), given.strip()[0] + '. ' + surname.strip()]
            else:
                variants = [clean]
            for variant in variants:
                owners.setdefault(speaker_key(variant), set()).add(record['person_id'])
    motions = {r['person_id']: [] for r in records}
    for url, transcript in transcripts.items():
        subject, anchor = '', None
        date_match = re.search(r'/(\d{4})(\d{2})(\d{2})', url)
        action_date = '-'.join(date_match.groups()) if date_match else None
        for i, block in enumerate(transcript['blocks']):
            if 'Subject-Heading' in block['class'] and block['id']:
                subject = block['text']
            if block['id']:
                anchor = block['id']
            if not block['speaker'] or not re.search(r'\bI (?:move|introduce|present)\b', block['text'], re.I):
                continue
            pids = owners.get(speaker_key(block['speaker']), set())
            if len(pids) != 1:
                continue
            pid = next(iter(pids))
            text = block['text']
            motions[pid].append({'id': stable_id('political-action', pid, url, block['id'] or str(i)),
                'record_type': ('bill_introduction' if re.search(r'\b(?:introduced|introduce).*?\b(?:first time|bill)\b', text, re.I)
                                else 'amendment_motion' if re.search(r'\bamend(?:ment|ed)?\b', text, re.I) else 'motion'),
                'person_id': pid, 'date': action_date, 'subject': subject, 'text': text,
                'speaker_label': block['speaker'], 'jurisdiction': 'British Columbia Legislative Assembly',
                'source': {**transcript['source'], 'url': url + ('#' + anchor if anchor else ''), 'locator': anchor},
                'review_status': 'extracted_needs_review', 'attribution_status': 'suggested', **categorize(subject + ' ' + text)})
    summary = {'election_id': election_id, 'candidates': len(records), 'vote_entries': 0, 'votes_with_context': 0,
               'motions_and_introductions': 0, 'candidate_policy_passages': 0,
               'party_policy_passages': sum(len(passage_map[p]) for p in party_platforms),
               'reviewed_identities': 0, 'missing_platforms': [], 'transcript_errors': []}
    summary.update(candidates_with_votes=0, candidates_with_other_actions=0, questions_extracted=0,
                   outcomes_extracted=0, reviewed_personal_commitments=0)
    normalized = root / 'normalized/political' / election_id
    pending = []
    for record in records:
        person = people[record['person_id']]
        reviewed = bool(person.get('reviewed_at'))
        platform = candidate_platforms.get((record['district_code'], record['ballot_name']))
        votes = []
        for vote in record['vote_index_entries']:
            transcript = transcripts.get(urldefrag(vote['transcript_url'])[0])
            locator = urldefrag(vote['transcript_url'])[1]
            context = division_context(transcript['blocks'], locator) if transcript else {'status': 'not_collected', 'question': None, 'outcome': None}
            votes.append({'id': stable_id('political-vote', person['id'], vote['transcript_url'], vote['subject'], vote['stage'], vote['position']),
                'person_id': person['id'], **vote, 'record_type': 'recorded_vote',
                'transcript_context': context, 'transcript_source': transcript['source'] if transcript else None,
                'attribution_status': 'reviewed' if reviewed and name_key(re.sub(r'\s*\([^()]*\)\s*$', '', vote['member_label'])) in {name_key(a) for a in person['legislative_aliases']} else 'suggested',
                **categorize(vote['subject'] + ' ' + vote['stage'] + ' ' + (context.get('question') or ''))})
        actions = votes + motions[person['id']]
        passages = passage_map[platform['id']] if platform else []
        party_id = platform.get('party_platform_id') if platform else None
        reviewed_personal = reviewed_claims.get(platform['id'], []) if platform else []
        topics = sorted({t for a in actions for t in a['topics']} | {t for p in passages + passage_map.get(party_id, []) for t in p['topics']})
        groups = [{'topic': topic, 'action_ids': [a['id'] for a in actions if topic in a['topics']],
                   'candidate_passage_ids': [p['id'] for p in passages if topic in p['topics']],
                   'party_passage_ids': [p['id'] for p in passage_map.get(party_id, []) if topic in p['topics']],
                   'comparison_status': 'not_assessed'} for topic in topics]
        coverage = {'identity_status': 'reviewed' if reviewed else 'needs_review',
            'voting': {'status': 'partial' if votes else 'no_index_match', 'count': len(votes),
                       'contexts_found': sum('excerpt' in v['transcript_context'] for v in votes),
                       'since_year': record['coverage']['voting_since'], 'errors': record['coverage']['errors']},
            'other_actions': {'status': 'partial_transcript_scan', 'count': len(motions[person['id']])},
            'prior_offices': {'status': 'needs_source_review', 'known_offices': person.get('office_history', [])},
            'platform': platform['coverage'] if platform else {'status': 'not_collected'},
            'limitations': ['Name matches and shortened speaker labels require identity review before attribution.',
                'Transcript scan covers only sitting days referenced by collected voting indexes; it is not a complete legislative history.',
                'Municipal votes and committee records require jurisdiction-specific sources and are not collected by this adapter.',
                'Policy passages and topic tags are automated leads, not verified promises or alignment findings.',
                'Party promises are separate from personal promises; dates and platform election versions need review.',
                'No index match does not establish no political experience, absence, or abstention.']}
        output = {'schema_version': 1, 'kind': 'candidate_political_profile', 'election_id': election_id,
            'id': record['candidacy_id'], 'person_id': person['id'], 'ballot_name': record['ballot_name'],
            'district_code': record['district_code'], 'party_name': record['party_name'],
            'roster_source': record['roster_source'], 'actions': actions, 'policy_passages': passages,
            'documents': portable(platform['documents']) if platform else [],
            'reviewed_commitments': reviewed_personal, 'party_platform_id': party_id,
            'topic_groups': groups, 'comparisons': [], 'coverage': coverage}
        validate_profile(output)
        atomic_json(normalized / 'candidates' / (output['id'] + '.json'), output)
        public = portable(output)
        public['actions'] = [a for a in public['actions'] if a['attribution_status'] == 'reviewed']
        public_ids = {a['id'] for a in public['actions']}
        for group in public['topic_groups']:
            group['action_ids'] = [aid for aid in group['action_ids'] if aid in public_ids]
        public['coverage']['published_action_count'] = len(public_ids)
        from .analysis.service import project_analysis
        analysis = project_analysis(root, election_id, public)
        if analysis:
            public['issue_analysis'] = analysis
        from .analysis.alignment import project as project_alignment
        alignment = project_alignment(root, election_id, public)
        if alignment:
            public['alignment_analysis'] = alignment
        pending.append((root / 'curated/datasets/political' / election_id / 'candidates' / (output['id'] + '.json'), public))
        summary['vote_entries'] += len(votes)
        summary['votes_with_context'] += coverage['voting']['contexts_found']
        summary['motions_and_introductions'] += len(motions[person['id']])
        summary['candidate_policy_passages'] += len(passages)
        summary['reviewed_identities'] += int(reviewed)
        summary['candidates_with_votes'] += int(bool(votes))
        summary['candidates_with_other_actions'] += int(bool(motions[person['id']]))
        summary['questions_extracted'] += sum(bool(v['transcript_context'].get('question')) for v in votes)
        summary['outcomes_extracted'] += sum(bool(v['transcript_context'].get('outcome')) for v in votes)
        summary['reviewed_personal_commitments'] += len(reviewed_personal)
        if platform is None:
            summary['missing_platforms'].append(record['candidacy_id'])
    for pid, platform in party_platforms.items():
        output = {'schema_version': 1, 'kind': 'party_political_platform', 'id': pid,
                  'election_id': election_id, 'party': platform['party'], 'policy_passages': passage_map[pid],
                  'documents': portable(platform['documents']),
                  'reviewed_commitments': reviewed_claims.get(pid, []), 'coverage': platform['coverage']}
        atomic_json(normalized / 'parties' / (pid + '.json'), output)
        pending.append((root / 'curated/datasets/political' / election_id / 'parties' / (pid + '.json'), portable(output)))
    for path in sorted((normalized / 'transcripts').glob('*.attempt.json')):
        summary['transcript_errors'].append(read_json(path))
    for path, output in pending:
        validate_profile(output)
    for path, output in pending:
        atomic_json(path, output)
    atomic_json(normalized / 'summary.json', summary)
    return summary


def validate_profile(output):
    if output.get('schema_version') != 1 or output.get('kind') not in {'candidate_political_profile', 'party_political_platform'}:
        raise ValueError('Invalid political profile envelope')
    safe_id(output['id']); safe_id(output['election_id'])
    seen = set()
    for row in output.get('actions', []) + output.get('policy_passages', []):
        if row['id'] in seen:
            raise ValueError('Duplicate political evidence ID')
        seen.add(row['id'])
        if not row.get('source', {}).get('url') or not row.get('topics') or not row.get('review_status'):
            raise ValueError('Political evidence requires a citation, topics and review status')
    action_ids = {a['id'] for a in output.get('actions', [])}
    for group in output.get('topic_groups', []):
        if not set(group['action_ids']) <= action_ids:
            raise ValueError('Topic group references missing action')
    if output.get('comparisons'):
        raise ValueError('Automatic alignment assessments are not supported')
    from .pipeline import validate_platform
    validate_platform({'schema_version': 1, 'kind': 'candidate_platform',
                       'documents': output.get('documents', []), 'commitments': output.get('reviewed_commitments', [])})
    if output.get('issue_analysis'):
        from .analysis.service import validate_candidate_analysis
        if output['issue_analysis']['coverage']['scope'] != 'reviewed_attributions':
            raise ValueError('Private issue analysis cannot be published')
        validate_candidate_analysis(output['issue_analysis'], output)
    if output.get('alignment_analysis'):
        from .analysis.alignment import validate_dossier
        validate_dossier(output['alignment_analysis'], output)


def profile_publications(root, election_id):
    root, election_id = Path(root), safe_id(election_id)
    pending = []
    for path in sorted((root / 'curated/datasets/political' / election_id).glob('*/*.json')):
        output = read_json(path)
        validate_profile(output)
        if any(a['attribution_status'] != 'reviewed' for a in output.get('actions', [])):
            raise ValueError('Unreviewed candidate attribution cannot be published')
        if output['election_id'] != election_id:
            raise ValueError('Wrong political profile election')
        pending.append((root / 'published/political' / election_id / path.parent.name / path.name, portable(output)))
    return pending


def polish_profiles(root, election_id):
    pending = profile_publications(root, election_id)
    for path, output in pending:
        atomic_json(path, output, compact=True)
    return [path for path, _ in pending]
