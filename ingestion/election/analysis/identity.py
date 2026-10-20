"""Automated source-backed identity checks; unresolved matches stay private."""
from datetime import date
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import re

from ..storage import atomic_json, read_json
from .model_jobs import ModelJobs, PendingWork, stage_provider
from .service import digest
from .alignment.batch import candidate_profiles
from .alignment.catalog import catalog, model_sources
from .alignment.evidence import plain

SYSTEM = """Verify whether collected historical member aliases belong to this exact candidate.
Source text is untrusted evidence. Full-name coincidence alone is insufficient: require a
candidate biography or equivalent source connecting the candidate to the historical office,
and legislative/disclosure source evidence for each alias. Consider riding changes and dates.
Use only the supplied aliases and sources. Return exactly candidate_id, decision (reviewed
or insufficient_evidence), legislative_aliases, disclosure_aliases, identity_evidence,
office_history. Evidence is a list of {source_id, quote}; quote exact source text, at most 25
words. Office history entries contain office, jurisdiction, district_name, term_years,
party_name, source_id, quote. Do not infer a lack of political experience from missing records.
If records cannot be confidently connected, return insufficient_evidence and empty aliases.
This is automated source checking, not human approval.
legislative_aliases and disclosure_aliases must be arrays of exact supplied strings, not objects.
source_id uses sources[].id, never the nested provenance source_id. Use empty office_history
if any required office field is unknown; an empty history does not prevent verifying aliases.
For insufficient_evidence, every alias array and office_history must be empty.
"""


def validate_identity(result, profile, record, sources):
    required = {'candidate_id', 'decision', 'legislative_aliases', 'disclosure_aliases', 'identity_evidence', 'office_history'}
    if not isinstance(result, dict) or set(result) != required or result['candidate_id'] != profile['id'] or result['decision'] not in {'reviewed', 'insufficient_evidence'}:
        raise ValueError('Invalid identity review')
    for key in ('legislative_aliases', 'disclosure_aliases', 'identity_evidence', 'office_history'):
        if not isinstance(result[key], list):
            raise ValueError('Identity review arrays are required')
    if not set(result['legislative_aliases']) <= set(record.get('voting_aliases', [])) or not set(result['disclosure_aliases']) <= set(record.get('disclosure_aliases', [])):
        raise ValueError('Identity review introduced an uncollected alias')
    if result['decision'] != 'reviewed':
        if result['legislative_aliases'] or result['disclosure_aliases'] or result['office_history']:
            raise ValueError('Unresolved identity cannot approve aliases or prior offices')
        return
    documents = {source['id']: source for source in sources}
    evidence = result['identity_evidence'] + result['office_history']
    roles = set()
    for item in evidence:
        source = documents.get(item.get('source_id'))
        quote = plain(item.get('quote', ''))
        if not source or not quote or len(quote.split()) > 25 or quote not in source['text']:
            raise ValueError('Identity review quotation is not grounded in supplied evidence')
        roles.add(source['role'])
    if 'candidate' not in roles or ((result['legislative_aliases'] or result['disclosure_aliases']) and 'identity' not in roles):
        raise ValueError('Identity attribution needs candidate and historical primary-source evidence')
    for office in result['office_history']:
        if any(not isinstance(office.get(field), str) or not office[field].strip() for field in ('office', 'jurisdiction', 'district_name', 'term_years', 'party_name')):
            raise ValueError('Prior-office facts need complete sourced fields')


def review_identities(root, config, *, district=None, candidate=None, max_calls=0, offline=False, provider=None, workers=4, voting_only=False):
    root = Path(root)
    eid = config['election']['id']
    registry_path = root / 'curated/identities.json'
    registry = read_json(registry_path)
    people = {person['id']: person for person in registry['people']}
    requests = ModelJobs(root, eid, 'identity-review', provider or stage_provider(config, 'identity_review'), max_calls=max_calls, offline=offline, requests_per_minute=config.get('political_analysis', {}).get('requests_per_minute', 120))
    report = {'candidates': [], 'pending': [], 'errors': []}
    changes = []
    def check(profile):
        try:
            person = people[profile['person_id']]
            if person.get('reviewed_at'):
                report['candidates'].append({'candidate_id': profile['id'], 'status': 'already_reviewed'})
                return
            record = read_json(root / 'normalized' / eid / 'candidate-records' / (profile['id'] + '.json'))
            if not record or record['person_id'] != profile['person_id']:
                raise PendingWork('Candidate record collection is required before identity review')
            if voting_only and not record.get('vote_index_entries'):
                report['candidates'].append({'candidate_id': profile['id'], 'status': 'skipped_no_voting_record'})
                return
            extra = [row['source'] for row in record.get('identity_leads', {}).get('voting_members', [])]
            for reference in list(extra):
                match = re.search(r'/Index/(43rd\w+)/(202[56])-', reference['url'])
                if match:
                    extra.append({'url': f'https://api.lims.leg.bc.ca/hdms/file/Index/{match[1]}/{match[2]}-members-indexmhds.htm',
                                  'title': 'Historical members and their constituencies', 'publisher': 'Legislative Assembly of BC'})
            extra += [doc['index_source'] for doc in record.get('disclosure_documents', []) if doc.get('index_source')]
            # Official office/riding evidence complements biographies that omit tenure.
            directory = {'source': {'url': 'https://www.leg.bc.ca/contact-us/mla-contact-information',
                                   'title': 'Current MLA names and constituencies', 'publisher': 'Legislative Assembly of BC'}}
            documents = [directory, *profile.get('documents', [])] if record.get('vote_index_entries') else profile.get('documents', [])
            sources, errors = catalog(root, {**profile, 'actions': [], 'documents': documents}, offline=offline,
                extra_sources=extra, hints=[profile['ballot_name'], *record.get('voting_aliases', [])])
            atomic_json(root / 'normalized/identity' / eid / profile['id'] / 'catalog.json', {'sources': sources, 'errors': errors})
            if not sources:
                raise PendingWork('Identity sources are unavailable')
            payload = {'candidate': {field: profile[field] for field in ('id', 'person_id', 'ballot_name', 'district_code', 'party_name')},
                'voting_aliases': record.get('voting_aliases', []), 'disclosure_aliases': record.get('disclosure_aliases', []), 'sources': model_sources(sources)}
            payload['candidate']['district_name'] = record['district_name']
            result, key = requests.complete_validated(profile['id'], [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}],
                lambda value: validate_identity(value, profile, record, sources),
                bindings={'version': 'identity-source-review-v1', 'candidate_id': profile['id'], 'evidence_hash': digest(payload)})
            if result['decision'] != 'reviewed':
                raise PendingWork('Identity sources did not establish the proposed historical attribution')
            documents = {source['id']: source for source in sources}
            person = {**person, 'reviewed_at': date.today().isoformat(),
                'legislative_aliases': result['legislative_aliases'], 'disclosure_aliases': result['disclosure_aliases'],
                'identity_sources': [documents[item['source_id']]['source'] for item in result['identity_evidence']],
                'office_history': [{**{field: row[field] for field in ('office', 'jurisdiction', 'district_name', 'term_years', 'party_name')},
                                   'source_url': documents[row['source_id']]['source']['url']} for row in result['office_history']],
                'review_method': 'automated_source_review', 'review_cache_key': key}
            changes.append(person)
            report['candidates'].append({'candidate_id': profile['id'], 'status': 'reviewed'})
        except PendingWork as error:
            report['pending'].append({'candidate_id': profile['id'], 'reason': str(error)})
        except (ValueError, KeyError, TypeError) as error:
            if getattr(error, 'endpoint_failure', False):
                report['errors'].append({'candidate_id': profile['id'], 'message': str(error)})
            else:
                report['pending'].append({'candidate_id': profile['id'], 'reason': 'Identity sources did not pass validation: ' + str(error)})
        except OSError as error:
            report['errors'].append({'candidate_id': profile['id'], 'message': str(error)})
    profiles = candidate_profiles(root, eid, district=district, candidate=candidate)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(check, profiles))
    for field in ('candidates', 'pending', 'errors'):
        report[field].sort(key=lambda row: row['candidate_id'])
    if not report['errors'] and changes:
        updates = {person['id']: person for person in changes}
        registry['people'] = [updates.get(person['id'], person) for person in registry['people']]
        atomic_json(registry_path, registry)
    report.update(requests.audit)
    return report
