"""Publish immutable election generations and atomically switch the active manifest.

Legacy files are compatibility exports; the web server reads the pinned generation.
All operations are local. Existing generations remain available for rollback.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import uuid
from urllib.parse import urlparse
from datetime import date, datetime
import warnings

from .storage import atomic_json, now, read_json
from .workflow import validate


def safe(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError('Unsafe release identifier')
    return value


def active_path(published, election):
    return published / 'active' / f'{safe(election)}.json'


def current_data(published, election):
    active = read_json(active_path(published, election))
    if not active:
        return published
    return published / 'releases' / safe(election) / safe(active['generation']) / 'data'


def _copy_election(source, destination, election):
    for relative in (Path(election), Path('platforms') / election, Path('political') / election):
        if (source / relative).exists():
            shutil.copytree(source / relative, destination / relative, dirs_exist_ok=True)


def _validate_content(folder, election):
    def url(value):
        parsed = urlparse(value)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError('Invalid publication source URL')
    def source(value):
        url(value['url'])
        if not isinstance(value['label'], str) or not value['label']:
            raise ValueError('Missing publication source label')
    registry = read_json(folder / election / 'parties.json')
    guide = read_json(folder / election / 'guide.json')
    questionnaire = read_json(folder / election / 'questionnaire.json')
    polling = read_json(folder / election / 'polling.json')
    for value in (registry, guide, questionnaire, polling):
        if not value or value.get('schema_version') != 1 or value.get('election_id') != election:
            raise ValueError('Incomplete or mismatched editorial publication')
    ids = [p['id'] for p in registry['parties']]
    if not ids or len(set(ids)) != len(ids):
        raise ValueError('Invalid party registry')
    aliases = set()
    for p in registry['parties']:
        safe(p['id'])
        if not isinstance(p['name'], str) or not p['ballotNames']:
            raise ValueError('Invalid party identity')
        for name in p['ballotNames']:
            if not isinstance(name, str) or not name or name in aliases:
                raise ValueError('Invalid registry ballot alias')
            aliases.add(name)
        if not p['name'] or not re.fullmatch(r'#[0-9a-fA-F]{6}', p['color']):
            raise ValueError('Invalid party label')
    if {p['id'] for p in guide['parties'] + guide['otherParties']} != set(ids):
        raise ValueError('Guide and party registry differ')
    if not isinstance(guide['reviewedOn'], str) or not guide['reviewedOn']:
        raise ValueError('Missing guide review date')
    url(guide['partyRosterSource'])
    labels = {p['id']: p for p in registry['parties']}
    for p in guide['parties'] + guide['otherParties']:
        if not all(isinstance(p.get(k), str) and p[k] for k in ('name', 'color', 'leader', 'leaderNote', 'status')):
            raise ValueError('Invalid guide presentation fields')
        if p['name'] != labels[p['id']]['name'] or p['color'] != labels[p['id']]['color']:
            raise ValueError('Guide labels differ from registry')
        portrait = p.get('portrait', '')
        if portrait:
            if not isinstance(portrait, str) or not portrait.startswith('/content/assets/leaders/') or any(c in portrait for c in ('..', '?', '#', '\\')):
                raise ValueError('Invalid portrait path')
            url(p['portraitSource'])
        url(p['leaderSource'])
        url(p['platform'])
        if not p['leader'] or not p['leaderNote'] or not p['status'] or not re.fullmatch(r'#[0-9a-fA-F]{6}', p['color']):
            raise ValueError('Invalid party presentation')
        for item in p['items']:
            if not all(isinstance(item[k], str) and item[k] for k in ('summary', 'topic')) or not item['points'] or not item['sources']:
                raise ValueError('Invalid policy item')
            for citation in item['sources']:
                source(citation)
            for point in item['points']:
                if not isinstance(point['text'], str) or not point['text'] or not point['sourceIndices'] or any(type(i) is not int or i < 0 or i >= len(item['sources']) for i in point['sourceIndices']):
                    raise ValueError('Invalid policy citation')
    def dated(value):
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value or value > date.today().isoformat():
            raise ValueError('Invalid publication date')
    dated(questionnaire['reviewedOn'])
    if not questionnaire['questions'] or not isinstance(questionnaire['methodology'], str) or not questionnaire['methodology']:
        raise ValueError('Incomplete questionnaire')
    if len(questionnaire['parties']) != len(ids) or {p['id'] for p in questionnaire['parties']} != set(ids):
        raise ValueError('Questionnaire parties differ from registry')
    aliases = set()
    for party in questionnaire['parties']:
        if not party['ballotNames']:
            raise ValueError('Missing ballot aliases')
        for name in party['ballotNames']:
            if not name or name in aliases:
                raise ValueError('Duplicate ballot alias')
            aliases.add(name)
    questions = set()
    for question in questionnaire['questions']:
        safe(question['id'])
        if question['id'] in questions or not all(isinstance(question[k], str) and question[k] for k in ('topic', 'prompt', 'yes', 'no', 'note')) or not question['stances']:
            raise ValueError('Invalid question')
        questions.add(question['id'])
        seen = set()
        for stance in question['stances']:
            if stance['partyID'] not in ids or stance['partyID'] in seen or stance['side'] not in ('yes', 'no') or not isinstance(stance['summary'], str) or not stance['summary']:
                raise ValueError('Invalid party stance')
            seen.add(stance['partyID'])
            dated(stance['checkedOn'])
            source(stance['source'])
    datetime.fromisoformat(polling['collectedAt'])
    source(polling['methodology'])
    districts = set()
    for row in polling['districts']:
        safe(row['code'])
        if row['code'] in districts or not row['name'] or row['kind'] != 'projection':
            raise ValueError('Invalid riding projection')
        districts.add(row['code'])
        dated(row['asOf'])
        if row['outlook'] == 'toss_up':
            if row['leaderPartyID'] is not None:
                raise ValueError('Toss-up cannot name a leader')
        elif row['outlook'] not in ('leaning', 'likely', 'safe') or row['leaderPartyID'] not in ids:
            raise ValueError('Invalid projection leader')
        source(row['source'])
    polls = set()
    for poll in polling['surveys']:
        safe(poll['id'])
        if poll['id'] in polls or poll['scope'] != 'province' or poll['kind'] != 'poll' or not all(isinstance(poll[k], str) and poll[k] for k in ('pollster', 'method', 'population', 'uncertainty')) or poll['sampleSize'] <= 0:
            raise ValueError('Invalid survey metadata')
        polls.add(poll['id'])
        for key in ('publishedOn', 'fieldworkStart', 'fieldworkEnd'):
            dated(poll[key])
        if not poll['fieldworkStart'] <= poll['fieldworkEnd'] <= poll['publishedOn']:
            raise ValueError('Invalid survey dates')
        reported = set()
        total = 0
        for result in poll['results']:
            if result['partyID'] not in ids + ['other'] or result['partyID'] in reported or not 0 <= result['share'] <= 100:
                raise ValueError('Invalid survey result')
            reported.add(result['partyID'])
            total += result['share']
        if not 98 <= total <= 102:
            raise ValueError('Invalid survey total')
        source(poll['source'])


def publish_release(root, election, pending=(), content_dir=None):
    root, election = Path(root), safe(election)
    published = root / 'published'
    published.mkdir(parents=True, exist_ok=True)
    # Serialize full and partial publications so neither loses the other's updates.
    with (published / '.release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _publish(root, election, list(pending), content_dir)


def _publish(root, election, pending, content_dir):
    published = root / 'published'
    previous = read_json(active_path(published, election))
    source = current_data(published, election)
    parent = published / 'releases' / election
    parent.mkdir(parents=True, exist_ok=True)
    generation = uuid.uuid4().hex
    staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=parent))
    target = parent / generation
    try:
        data_dir = staging / 'data'
        _copy_election(source, data_dir, election)
        for path, output in pending:
            relative = Path(path).relative_to(published)
            atomic_json(data_dir / relative, output, compact=True)
        districts = []
        for path in sorted((data_dir / election).glob('*.json')):
            if path.name == 'catalog.json':
                continue
            data = read_json(path)
            validate(data, client=True)
            if data['election']['id'] != election or data['district']['official_code'] != path.stem:
                raise ValueError('Mismatched release district')
            district = {k: data['district'][k] for k in ('id', 'official_code', 'name', 'roster_status')}
            district['candidate_count'] = len(data['candidacies'])
            districts.append(district)
            ballot = {'schema_version': 1, 'election_id': election, 'district': district,
                      'parties': data['parties'], 'candidacies': data['candidacies']}
            atomic_json(data_dir / election / 'ballots' / path.name, ballot, compact=True)
        atomic_json(data_dir / election / 'catalog.json', {'schema_version': 1, 'election_id': election,
                    'districts': sorted(districts, key=lambda d: d['name'])}, compact=True)
        if content_dir is None:
            content_dir = os.environ.get('BC_GUIDE_CONTENT') or Path(__file__).resolve().parents[2] / 'content-server/content'
        content_dir = Path(content_dir)
        if (content_dir / election).exists():
            shutil.copytree(content_dir / election, staging / 'content' / election)
            if (content_dir / 'assets').exists():
                shutil.copytree(content_dir / 'assets', staging / 'content/assets')
            _validate_content(staging / 'content', election)
        elif previous and (source.parent / 'content').exists():
            shutil.copytree(source.parent / 'content', staging / 'content')
        files = {str(p.relative_to(staging)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted(staging.rglob('*')) if p.is_file()}
        manifest = {'schema_version': 1, 'election_id': election, 'generation': generation,
                    'previous': previous['generation'] if previous else None, 'created_at': now(), 'files': files}
        atomic_json(staging / 'manifest.json', manifest)
        staging.rename(target)
        # This is the commit point. Failures before it preserve the previous release.
        atomic_json(active_path(published, election), {k: manifest[k] for k in ('schema_version', 'election_id', 'generation', 'previous', 'created_at')})
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    # Keep legacy research tools and finder availability checks working. The API
    # never uses these mirrors after it observes the active generation.
    for path, output in pending:
        try:
            atomic_json(path, output, compact=True)
        except OSError as error:
            warnings.warn(f'Release active; compatibility export failed: {error}')
    return target


def rollback(root, election):
    published, election = Path(root) / 'published', safe(election)
    with (published / '.release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        active = read_json(active_path(published, election))
        if not active or not active.get('previous'):
            raise ValueError('No previous generation to restore')
        manifest = read_json(published / 'releases' / election / safe(active['previous']) / 'manifest.json')
        if not manifest or manifest['election_id'] != election:
            raise ValueError('Previous release is unavailable')
        atomic_json(active_path(published, election), {k: manifest[k] for k in ('schema_version', 'election_id', 'generation', 'previous', 'created_at')})
        return manifest['generation']
