import io
import json
import unittest
import zipfile
from election.finder import import_postal, import_boundaries, postal_code


def archive(name, text):
    file = io.BytesIO()
    with zipfile.ZipFile(file, 'w') as output:
        output.writestr(name, text)
    return file.getvalue()


class FinderImportTests(unittest.TestCase):
    def test_postal_sources_keep_multiple_locations_and_missing_data(self):
        geo = archive('CA_full.txt', 'CA\tV6Y 1N9\tRichmond\tBritish Columbia\tBC\t\t\t\t\t49.16\t-123.13\t6\n'
                      'CA\tV6Y 1N9\tRichmond\tBritish Columbia\tBC\t\t\t\t\t49.17\t-123.13\t6\n')
        oda = archive('ODA_BC_v1.csv', 'postal_code,latitude,longitude\nV6Y1N9,49.18,-123.12\n,49.1,-123.1\nV6Y2N9,49.19,-123.12\nV6Y3N9,nan,-123.1\n')
        postal, audit = import_postal(geo, oda)
        self.assertEqual(len(postal['V6Y1N9']['geonames']), 2)
        self.assertEqual(postal['V6Y1N9']['statcan'], [(-123.12, 49.18)])
        self.assertEqual(audit['statcan_only_postal_codes'], 1)
        self.assertEqual(audit['statcan_rows_with_postal'], 3)
        self.assertEqual(audit['statcan_usable_rows'], 2)
        self.assertEqual(postal_code(' v6y 1n9 '), 'V6Y1N9')
        self.assertIsNone(postal_code('V6Y'))
        self.assertIsNone(postal_code('V6D1N9'))

    def test_invalid_boundary_set_and_unclosed_ring(self):
        feature = {'type': 'Feature', 'properties': {'ED_ABBREVIATION': 'SYN', 'ED_NAME': 'Synthetic', 'BOUNDARY_SET_ID': 11},
                   'geometry': {'type': 'Polygon', 'coordinates': [[[-123,49],[-122,49],[-122,50],[-123,49]]]}}
        body = {'type': 'FeatureCollection', 'features': [feature]}
        self.assertEqual(import_boundaries(json.dumps(body))['features'][0]['bbox'], [-123,49,-122,50])
        feature['properties']['BOUNDARY_SET_ID'] = 10
        with self.assertRaises(ValueError): import_boundaries(json.dumps(body))
        feature['properties']['BOUNDARY_SET_ID'] = 11
        feature['geometry']['coordinates'][0][-1] = [-124,49]
        with self.assertRaises(ValueError): import_boundaries(json.dumps(body))
