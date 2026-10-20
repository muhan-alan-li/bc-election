"""Refresh attributed 338Canada riding outlooks; never treat projections as polls.

python3 ingestion/collect_polling.py [--html saved-districts.htm]
Retains the last publication if dates, coverage or riding mapping fail validation.
Province-wide surveys are separately source-reviewed in polling-surveys.json.
"""
import argparse
import json
import re
import tempfile
import unicodedata
from datetime import date, datetime, timezone
from html import unescape
from pathlib import Path
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parents[1]
SOURCE = 'https://338canada.com/bc/districts.htm'

def key(text):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower())

def parse_outlooks(html, districts):
    match = re.search(r'Latest update:\s*([A-Z][a-z]+ \d{1,2}, \d{4})', html)
    if not match:
        raise ValueError('Missing projection date')
    updated = datetime.strptime(match[1], '%B %d, %Y').date().isoformat()
    if updated > date.today().isoformat():
        raise ValueError('Projection date is in the future')
    mapped = {key(d['name']): d for d in districts}
    rows, seen = [], set()
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', html, re.S | re.I):
        rating = re.search(r"<td\b[^>]*class=['\"]ridingprojcell['\"][^>]*>(.*?)</td>", row, re.S)
        link = re.search(r"<a\b[^>]*href=['\"](https://338canada.com/bc/\d{4}e.htm)['\"][^>]*>([^<]+)</a>", row)
        if not rating or not link:
            continue
        name = unescape(link[2]).strip()
        district = mapped.get(key(name))
        if not district or district['code'] in seen:
            raise ValueError(f'Unmapped or duplicate riding: {name}')
        label = unescape(re.sub('<[^>]+>', '', rating[1])).strip()
        if label == 'Toss up':
            leader, outlook = None, 'toss_up'
        else:
            parsed = re.fullmatch(r'(NDP|CPBC|GRN) (safe|likely|leaning)', label)
            if not parsed:
                raise ValueError(f'Unknown projection label: {label}')
            leader = {'NDP':'ndp','CPBC':'conservative','GRN':'green'}[parsed[1]]
            outlook = parsed[2]
        seen.add(district['code'])
        rows.append({'code':district['code'],'name':district['name'],'kind':'projection',
                     'leaderPartyID':leader,'outlook':outlook,'asOf':updated,
                     'source':{'url':link[1],'label':'338Canada riding projection'}})
    if len(rows) != len(districts):
        raise ValueError(f'Incomplete projection coverage: {len(rows)}/{len(districts)}')
    return sorted(rows, key=lambda x:x['name'])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html',type=Path)
    args = parser.parse_args()
    if args.html:
        html = args.html.read_text()
    else:
        with urlopen(Request(SOURCE,headers={'User-Agent':'BC-election-guide/1.0 (source-attributed election research)'}), timeout=45) as response:
            html = response.read().decode('utf-8')
    districts = json.loads((BASE/'ingestion/polling-districts.json').read_text())
    rows = parse_outlooks(html, districts)
    folder = BASE/'content-server/content/bc-provincial-2026'
    output = {'schema_version':1,'election_id':'bc-provincial-2026',
              'collectedAt':datetime.now(timezone.utc).isoformat(),
              'methodology':{'url':'https://338canada.com/about.htm','label':'338Canada methodology'},
              'districts':rows,'surveys':json.loads((folder/'polling-surveys.json').read_text())}
    dest = folder/'polling.json'
    if dest.exists():
        old = json.loads(dest.read_text())
        if max(x['asOf'] for x in old['districts']) > max(x['asOf'] for x in rows):
            raise ValueError('Refusing to replace newer projections with older data')
    with tempfile.NamedTemporaryFile(mode='w',dir=folder,delete=False) as handle:
        json.dump(output,handle,ensure_ascii=False,indent=2)
        handle.write('\n')
        temporary=Path(handle.name)
    temporary.replace(dest)
    print(f'Published {len(rows)} attributed riding projections; dated {rows[0]["asOf"]}.')

if __name__ == '__main__':
    main()
