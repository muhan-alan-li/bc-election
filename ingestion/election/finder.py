"""Import free location sources; keep matching in the Go server."""
import csv
import io
import json
import math
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from .storage import atomic_json, now

GEONAMES_URL = 'https://download.geonames.org/export/zip/CA_full.csv.zip'
STATCAN_URL = 'https://www150.statcan.gc.ca/n1/en/pub/46-26-0001/2021001/ODA_BC_v1.zip'
BOUNDARIES_URL = ('https://openmaps.gov.bc.ca/geo/pub/ows?service=WFS&version=2.0.0&request=GetFeature'
                  '&typeNames=pub:WHSE_ADMIN_BOUNDARIES.EBC_ELECTORAL_DISTS_BS11_SVW'
                  '&outputFormat=application%2Fjson&srsName=EPSG%3A4326')
POSTAL = re.compile(r'^V[0-9][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$')


def postal_code(value):
    value = re.sub(r'\s+', '', value.upper())
    return value if POSTAL.fullmatch(value) else None


def point(lat, lon):
    try:
        lat, lon = float(lat), float(lon)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(lat) or not math.isfinite(lon) or not (48 <= lat <= 61 and -140 <= lon <= -113):
        return None
    return (round(lon, 6), round(lat, 6))


def import_postal(geonames, statcan):
    locations = defaultdict(lambda: defaultdict(set))
    audit = {'geonames_bc_rows': 0, 'statcan_rows': 0, 'statcan_rows_with_postal': 0,
             'statcan_usable_rows': 0, 'invalid_geonames_rows': 0}
    with zipfile.ZipFile(io.BytesIO(geonames)) as archive:
        with io.TextIOWrapper(archive.open('CA_full.txt'), encoding='utf-8-sig') as file:
            for row in csv.reader(file, delimiter='\t'):
                if len(row) < 12:
                    raise ValueError('Unexpected GeoNames postal schema')
                if row[4] != 'BC':
                    continue
                audit['geonames_bc_rows'] += 1
                code, coords = postal_code(row[1]), point(row[9], row[10])
                if code and coords:
                    locations[code]['geonames'].add(coords)
                else:
                    audit['invalid_geonames_rows'] += 1
    with zipfile.ZipFile(io.BytesIO(statcan)) as archive:
        with io.TextIOWrapper(archive.open('ODA_BC_v1.csv'), encoding='utf-8-sig') as file:
            rows = csv.DictReader(file)
            if not {'postal_code', 'latitude', 'longitude'} <= set(rows.fieldnames or []):
                raise ValueError('Unexpected StatCan address schema')
            for row in rows:
                audit['statcan_rows'] += 1
                if row['postal_code'].strip():
                    audit['statcan_rows_with_postal'] += 1
                code, coords = postal_code(row['postal_code']), point(row['latitude'], row['longitude'])
                if code and coords:
                    locations[code]['statcan'].add(coords)
                    audit['statcan_usable_rows'] += 1
    if not locations:
        raise ValueError('No usable BC postal locations')
    audit['unique_postal_codes'] = len(locations)
    audit['statcan_unique_postal_codes'] = sum('statcan' in sources for sources in locations.values())
    audit['statcan_only_postal_codes'] = sum('statcan' in sources and 'geonames' not in sources for sources in locations.values())
    # Retain both sources: agreement between sampled points is not proof of full area coverage.
    return {code: {source: sorted(points) for source, points in sources.items()}
            for code, sources in sorted(locations.items())}, audit


def import_boundaries(body):
    collection = json.loads(body)
    if collection.get('type') != 'FeatureCollection' or not collection.get('features'):
        raise ValueError('Expected an electoral boundary FeatureCollection')
    features, codes = [], set()
    for feature in collection['features']:
        props, geometry = feature['properties'], feature['geometry']
        code, name = props['ED_ABBREVIATION'], props['ED_NAME']
        if not re.fullmatch(r'[A-Z0-9_-]+', code) or code in codes or not name or props['BOUNDARY_SET_ID'] != 11:
            raise ValueError('Invalid or duplicate boundary identity/version')
        codes.add(code)
        if geometry['type'] not in ('Polygon', 'MultiPolygon'):
            raise ValueError('Unsupported district geometry')
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        coords = []
        for polygon in polygons:
            if not polygon:
                raise ValueError('Empty polygon')
            for ring in polygon:
                if len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError('Invalid boundary ring')
                for lon, lat in ring:
                    if point(lat, lon) is None:
                        raise ValueError('Boundary coordinates are not BC longitude/latitude')
                    coords.append((lon, lat))
        features.append({'type': 'Feature', 'properties': {'official_code': code, 'name': name,
                        'boundary_set_id': 11, 'gazette_date': props.get('GAZETTE_DATE')},
                        'bbox': [min(p[0] for p in coords), min(p[1] for p in coords),
                                 max(p[0] for p in coords), max(p[1] for p in coords)],
                        'geometry': geometry})
    return {'type': 'FeatureCollection', 'features': sorted(features, key=lambda f: f['properties']['name'])}


def build_finder(store, storage):
    geonames, gm = store.get(GEONAMES_URL)
    statcan, sm = store.get(STATCAN_URL)
    boundaries, bm = store.get(BOUNDARIES_URL)
    postal, audit = import_postal(geonames, statcan)
    geography = import_boundaries(boundaries)
    audit['boundary_count'] = len(geography['features'])
    dataset = {'schema_version': 1, 'boundary_version': 'bc-2023-redistribution-set-11',
               'generated_at': now(), 'sources': [
                   {**gm, 'name': 'GeoNames', 'license': 'CC BY 3.0', 'source_date': '2023-03-13'},
                   {**sm, 'name': 'Statistics Canada Open Database of Addresses', 'license': 'Open Government Licence – Canada', 'source_date': '2021'},
                   {**bm, 'name': 'Elections BC', 'license': 'Elections BC Open Data Licence', 'source_date': '2023-12-07'}],
               'audit': audit, 'postal_codes': postal, 'boundaries': geography}
    path = Path(storage) / 'published' / 'finder.json'
    atomic_json(path, dataset, compact=True)
    atomic_json(Path(storage) / 'normalized' / 'finder-audit.json', audit)
    return path, audit
