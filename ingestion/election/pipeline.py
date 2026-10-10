"""Offline review assembly and client projection. No source downloads here."""

from copy import deepcopy
from datetime import date
from pathlib import Path
import re

from .parsers import member_name, name_key
from .storage import atomic_json, read_json
from .workflow import stable_id, validate


def safe_id(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError(f'Unsafe dataset ID: {value}')
    return value


def portable(value):
    """Retain citations and hashes, removing local cache paths and page bodies."""
    if isinstance(value, dict):
        return {key: portable(item) for key, item in value.items()
                if key not in {'blob', 'pages', 'tasks', 'identity_leads'}}
    if isinstance(value, list):
        return [portable(item) for item in value]
    return value


def curate_district(data, root):
    """Apply explicit reviewed identities; name-match suggestions never approve themselves."""
    data = deepcopy(data)
    registry = read_json(Path(root) / 'curated/identities.json')
    people = {person['id']: person for person in registry['people']}
    data['people'] = [deepcopy(people[person['id']]) for person in data['people']]
    source_map = {source['id']: source for source in data['sources']}
    for person in data['people']:
        pid = person['id']
        candidate = next(row for row in data['candidacies'] if row['person_id'] == pid)
        coverage = next(row for row in data['coverage'] if row['person_id'] == pid)
        evidence_path = (Path(root) / 'normalized' / safe_id(data['election']['id']) /
                         'candidate-records' / f"{safe_id(candidate['id'])}.json")
        evidence = read_json(evidence_path)
        reviewed = bool(person.get('reviewed_at'))
        coverage['identity_status'] = 'reviewed' if reviewed else 'needs_review'
        if evidence:
            if (evidence['person_id'] != pid or evidence['candidacy_id'] != candidate['id']
                    or evidence['election_id'] != data['election']['id']
                    or evidence['district_code'] != data['district']['official_code']):
                raise ValueError('Candidate evidence belongs to a different identity or election')
            source_map.update({source['id']: source for source in evidence['sources']})
            data['generated_at'] = max(data['generated_at'], evidence['generated_at'])
        vote_keys = {name_key(alias) for alias in person['legislative_aliases']} if reviewed else set()
        doc_keys = {name_key(alias) for alias in person['disclosure_aliases']} if reviewed else set()
        for field in ('votes', 'disclosures'):
            alias_keys = vote_keys if field == 'votes' else doc_keys
            data[field] = [row for row in data[field] if row['person_id'] != pid] + (
                [row for row in data[field] if row['person_id'] == pid and
                 name_key(member_name(row['member_label']) if field == 'votes' else row['member_name']) in alias_keys]
                if reviewed else [])
        if not reviewed:
            coverage['voting'].update(status='not_reviewed', count=0)
            coverage['interests'].update(status='not_reviewed', count=0, reviewed_entry_count=0)
            continue
        if evidence:
            new_votes = [deepcopy(row) for row in evidence['vote_index_entries']
                         if name_key(member_name(row['member_label'])) in vote_keys]
            new_docs = [deepcopy(row) for row in evidence['disclosure_documents']
                        if name_key(row['member_name']) in doc_keys]
            for vote in new_votes:
                vote['person_id'] = pid
                vote['id'] = stable_id('vote', pid, vote['transcript_url'], vote['subject'], vote['stage'])
            for doc in new_docs:
                doc['person_id'] = pid
                doc['id'] = stable_id('disclosure', pid, doc['url'])
            for field, new in [('votes', new_votes), ('disclosures', new_docs)]:
                # Retain previously attributed evidence, including uncovered sessions.
                combined = {row['id']: row for row in data[field]}
                combined.update({row['id']: row for row in new})
                data[field] = list(combined.values())
            # Keep collection failures visible without interpreting missing evidence.
            coverage['voting']['errors'] = evidence['coverage']['errors']
            coverage['interests']['errors'] = evidence['coverage']['errors']
        vote_count = sum(row['person_id'] == pid for row in data['votes'])
        doc_count = sum(row['person_id'] == pid for row in data['disclosures'])
        coverage['voting'].update(status='partial' if vote_count else 'not_reviewed', count=vote_count)
        coverage['interests'].update(status='documents_found' if doc_count else 'not_reviewed', count=doc_count)
    person_ids = {p['id'] for p in data['people'] if p.get('reviewed_at')}
    data['interests'] = [row for row in read_json(Path(root) / 'curated/interests.json', [])
                         if row['person_id'] in person_ids]
    for coverage in data['coverage']:
        count = sum(row['person_id'] == coverage['person_id'] for row in data['interests'])
        coverage['interests']['reviewed_entry_count'] = count
        if count:
            coverage['interests']['status'] = 'partial_review'
    data = portable(data)
    referenced = set()
    def references(value):
        if isinstance(value, dict):
            if 'source_id' in value:
                referenced.add(value['source_id'])
            for item in value.values():
                references(item)
        elif isinstance(value, list):
            for item in value:
                references(item)
    references({key: value for key, value in data.items() if key != 'sources'})
    data['sources'] = [portable(source_map[key]) for key in sorted(referenced)]
    validate(data)
    return data


DISTRICT_FIELDS = ('schema_version', 'generated_at', 'election', 'district', 'people',
                   'parties', 'candidacies', 'votes', 'disclosures', 'interests', 'coverage')


def polish_district(data):
    validate(data)
    output = {key: portable(data[key]) for key in DISTRICT_FIELDS}
    def select(row, fields):
        return {key: row[key] for key in fields if key in row}
    output['people'] = [select(row, ('id', 'name', 'reviewed_at', 'office_history')) for row in output['people']]
    output['disclosures'] = [select(row, ('id', 'person_id', 'member_name', 'url', 'title',
                            'document_type', 'source', 'index_source')) for row in output['disclosures']]
    output['coverage'] = [
        {'person_id': row['person_id'], 'identity_status': row['identity_status'],
         'voting': select(row['voting'], ('status', 'since_year', 'count', 'limitation', 'errors')),
         'interests': select(row['interests'], ('status', 'count', 'reviewed_entry_count', 'limitation', 'errors'))}
        for row in output['coverage']]
    # Source records are already cited inline. The browser never reads the source catalog.
    validate(output, client=True)
    return output


def curate_platform(data, root):
    output = portable(data)
    reviews = read_json(Path(root) / 'curated/platform-commitments.json', {})
    output['commitments'] = reviews.get(data['id'], [])
    validate_platform(output)
    output['parsing_status'] = 'reviewed' if output['commitments'] else 'not_run'
    return output


def validate_platform(output):
    if output.get('schema_version') != 1 or output.get('kind') not in {'candidate_platform', 'party_platform'}:
        raise ValueError('Invalid platform envelope')
    sources = {doc['id']: doc for doc in output['documents']}
    seen = set()
    for claim in output['commitments']:
        if not claim.get('id') or claim['id'] in seen:
            raise ValueError('Missing or duplicate commitment ID')
        seen.add(claim['id'])
        if not claim.get('text') or not claim.get('reviewed_at') or claim.get('document_id') not in sources:
            raise ValueError('Commitment requires text, review date, and collected document reference')
        date.fromisoformat(claim['reviewed_at'])
        if not claim.get('locator'):
            raise ValueError('Commitment requires a source page or section locator')


def curate(root, election_id, district=None):
    root, election_id = Path(root), safe_id(election_id)
    paths = sorted((root / 'normalized' / election_id).glob('*.json'))
    if district:
        paths = [p for p in paths if p.stem == safe_id(district)]
        if not paths:
            raise ValueError(f'No normalized district: {district}')
    results = []
    for path in paths:
        output = curate_district(read_json(path), root)
        target = root / 'curated/datasets' / election_id / path.name
        atomic_json(target, output)
        results.append(target)
    if not district:
        for path in sorted((root / 'normalized/platforms' / election_id).glob('*/*.json')):
            if path.name.endswith('.attempt.json'):
                continue
            output = curate_platform(read_json(path), root)
            target = root / 'curated/datasets/platforms' / election_id / path.parent.name / path.name
            atomic_json(target, output)
            results.append(target)
    if not results:
        raise ValueError('No normalized datasets found')
    if not district and list((root / 'normalized' / election_id / 'candidate-records').glob('candidacy*.json')):
        from .political import build_profiles
        build_profiles(root, election_id)
    return results


def migrate_evidence(root, election_id):
    """Copy legacy platform research out of client storage without overwriting newer evidence."""
    root, election_id = Path(root), safe_id(election_id)
    results = []
    for path in sorted((root / 'published/platforms' / election_id).glob('*/*.json')):
        data = read_json(path)
        if not any('pages' in doc for doc in data.get('documents', [])):
            continue
        target = root / 'normalized/platforms' / election_id / path.parent.name / path.name
        previous = read_json(target)
        if previous is None or data['generated_at'] > previous['generated_at']:
            atomic_json(target, data)
            results.append(target)
    return results


def polish(root, election_id, district=None):
    """Validate the entire selection before replacing any client file."""
    root, election_id = Path(root), safe_id(election_id)
    pending = []
    for path in sorted((root / 'curated/datasets' / election_id).glob('*.json')):
        if district and path.stem != safe_id(district):
            continue
        data = read_json(path)
        if data['election']['id'] != election_id or data['district']['official_code'] != path.stem:
            raise ValueError('Curated file has wrong election or district')
        pending.append((root / 'published' / election_id / path.name, polish_district(data)))
    if not district:
        for path in sorted((root / 'curated/datasets/platforms' / election_id).glob('*/*.json')):
            data = read_json(path)
            if data['election_id'] != election_id:
                raise ValueError('Curated platform has wrong election')
            # Revalidate reviews before polishing; only explicit reviewed claims survive.
            validate_platform(data)
            pending.append((root / 'published/platforms' / election_id / path.parent.name / path.name, portable(data)))
    if not district:
        from .political import profile_publications
        pending.extend(profile_publications(root, election_id))
    if not pending:
        raise ValueError('No curated datasets found')
    for path, output in pending:
        atomic_json(path, output, compact=True)
    return [path for path, _ in pending]
