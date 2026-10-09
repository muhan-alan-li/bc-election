"""Collect source records for every candidate; leave identity leads unreviewed.

Does not change curated identities, reviewed interests, or website publications.
"""

import argparse
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from election.parsers import Links, member_name, name_key, natural_name
from election.storage import SourceStore, atomic_json, now, read_json
from election.workflow import (
    collect_disclosure_catalog, collect_votes, disclosure_document,
    document_html, load_roster, source_ref, stable_id, voting_indexes,
)


def main():
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=base / 'config.json')
    parser.add_argument('--storage', type=Path, default=base / 'storage')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--offline', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    parser.add_argument('--ephemeral-raw', action='store_true')
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    if args.ephemeral_raw and args.offline:
        parser.error('--ephemeral-raw cannot be combined with --offline')
    if args.ephemeral_raw:
        with tempfile.TemporaryDirectory() as folder:
            return run(read_json(args.config), args.storage, offline=args.offline,
                       refresh=args.refresh, workers=args.workers, raw_root=folder)
    return run(read_json(args.config), args.storage, offline=args.offline,
               refresh=args.refresh, workers=args.workers)


def run(config, root, *, offline=False, refresh=False, workers=4, raw_root=None):
    root = Path(root)
    def new_store():
        return SourceStore(root, offline=offline, refresh=refresh, raw_root=raw_root)
    store = new_store()
    districts, rows, roster_meta = load_roster(store, config)
    indexes, archive_meta = voting_indexes(store, config)
    members = []
    for url in indexes:
        body, meta = document_html(store, url)
        members.extend({**link, 'source': source_ref(meta, 'Voting records by member',
                       'Legislative Assembly of BC')}
                       for link in Links(body, meta['url']).links if '#mh' in link['url'])
    documents, checks, catalog_errors = collect_disclosure_catalog(store, config['disclosure_urls'])
    registry = read_json(root / 'curated' / 'identities.json')
    mappings = {(x['district_code'], x['ballot_name']): x for x in registry['candidacies']
                if x['election_id'] == config['election']['id']}
    people = {x['id']: x for x in registry['people']}
    output_dir = root / 'normalized' / config['election']['id'] / 'candidate-records'
    shared_sources = dict(store.used)

    def collect(row):
        local = new_store()
        mapping = mappings[(row['district_code'], row['name'])]
        person = people[mapping['person_id']]
        reviewed = bool(person['reviewed_at'])
        leads = [x for x in members if natural_name(x['text']) == name_key(row['name'])]
        disclosure_leads = sorted({x['member_name'] for x in documents
                                  if natural_name(x['member_name']) == name_key(row['name'])})
        vote_aliases = person['legislative_aliases'] if reviewed else sorted({member_name(x['text']) for x in leads})
        disclosure_aliases = person['disclosure_aliases'] if reviewed else disclosure_leads
        votes, vote_checks, errors = [], [], []
        if vote_aliases:
            for index in indexes:
                try:
                    entries, checked, issues = collect_votes(local, [index], vote_aliases)
                    votes.extend(entries)
                    vote_checks.extend(checked)
                    errors.extend(issues)
                except ValueError as error:
                    errors.append({'url': index, 'error': str(error)})
            votes = list({(v['transcript_url'], v['subject'], v['stage'], v['position']): v for v in votes}.values())
        selected = [x for x in documents if name_key(x['member_name']) in {name_key(a) for a in disclosure_aliases}]
        fetched = []
        for document in selected:
            result = disclosure_document(local, document, True)
            result['id'] = stable_id('disclosure', person['id'], document['url'])
            fetched.append(result)
        output = {
            'generated_at': now(), 'election_id': config['election']['id'],
            'candidacy_id': mapping['id'], 'person_id': person['id'],
            'ballot_name': row['name'], 'district_code': row['district_code'],
            'district_name': districts[row['district_code']], 'party_name': row['party_name'],
            'roster_source': source_ref(roster_meta, 'Official candidate list', 'Elections BC'),
            'identity_status': 'reviewed' if reviewed else 'unreviewed_suggestions',
            'identity_leads': {'voting_members': leads, 'disclosure_members': disclosure_leads},
            'voting_aliases': vote_aliases, 'disclosure_aliases': disclosure_aliases,
            'vote_index_entries': votes, 'disclosure_documents': fetched,
            'coverage': {
                'voting_since': config['voting_since'], 'voting_sources_checked': vote_checks,
                'disclosure_sources_checked': checks, 'errors': errors + catalog_errors +
                    [{'url': x['url'], 'error': x['error']} for x in fetched if 'error' in x],
                'limitations': [
                    'Unreviewed exact full-name matches are discovery leads, not confirmed candidate attribution.',
                    'No match does not establish no public record. Name variants and prior offices require review.',
                    'Voting index entries need transcript review for exact questions and outcomes.',
                    'Disclosure text is unreviewed; dated holdings and material changes require page review.',
                    'Campaign finance and non-legislative prior-office records are outside this collector.',
                ],
            },
            'sources': list({**shared_sources, **local.used}.values()),
        }
        atomic_json(output_dir / f"{mapping['id']}.json", output)
        return {'candidacy_id': mapping['id'], 'name': row['name'], 'district_code': row['district_code'],
                'identity_status': output['identity_status'], 'votes': len(votes), 'documents': len(fetched),
                'errors': output['coverage']['errors']}

    results, failures = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending = {pool.submit(collect, row): row for row in rows}
        for future in as_completed(pending):
            row = pending[future]
            try:
                result = future.result()
                results.append(result)
                if result['votes'] or result['documents'] or result['errors']:
                    print(f"{result['name']}: {result['votes']} votes, {result['documents']} documents, {len(result['errors'])} errors", flush=True)
            except Exception as error:
                failures.append({'name': row['name'], 'district_code': row['district_code'], 'error': str(error)})
                print(f"FAILED {row['name']}: {error}", flush=True)
    atomic_json(output_dir / 'collection-audit.json', {
        'generated_at': now(), 'election_id': config['election']['id'],
        'expected_candidates': len(rows), 'completed_candidates': len(results),
        'roster_source': roster_meta, 'voting_archive_source': archive_meta,
        'results': sorted(results, key=lambda x: (x['district_code'], x['name'])), 'failures': failures,
    })
    print(f"Completed {len(results)}/{len(rows)} candidates; audit: {output_dir / 'collection-audit.json'}", flush=True)
    return int(bool(failures) or any(x['errors'] for x in results))


if __name__ == '__main__':
    raise SystemExit(main())
