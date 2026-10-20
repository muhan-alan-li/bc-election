import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collect_polling import parse_outlooks

class PollingCollectionTests(unittest.TestCase):
    def html(self,label='NDP leaning',name='Riding One'):
        return f'''Latest update: October 16, 2026<table><tr><td><a href='https://338canada.com/bc/1001e.htm'>{name}</a></td><td class='ridingprojcell'>{label}</td></tr></table>'''

    def test_named_lead_and_toss_up_are_distinct(self):
        districts=[{'code':'ONE','name':'Riding One'}]
        row=parse_outlooks(self.html(),districts)[0]
        self.assertEqual((row['kind'],row['leaderPartyID'],row['outlook']),('projection','ndp','leaning'))
        row=parse_outlooks(self.html('Toss up'),districts)[0]
        self.assertIsNone(row['leaderPartyID'])
        self.assertEqual(row['outlook'],'toss_up')

    def test_changed_or_partial_source_cannot_replace_publication(self):
        districts=[{'code':'ONE','name':'Riding One'}]
        for html,roster in [(self.html('CPBC guaranteed'),districts),(self.html(name='Unknown'),districts),(self.html(),districts+[{'code':'TWO','name':'Riding Two'}]),('No date',districts)]:
            with self.subTest(html=html):
                with self.assertRaises(ValueError):
                    parse_outlooks(html,roster)
