import sys
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

from import_manual_participants import roster


class ManualParticipantImportTests(unittest.TestCase):
    def test_jipconomy_roster_has_unique_official_positions(self):
        rows=roster(ROOT/'manual-data'/'jipconomy-2026.tsv','https://jipconomy.kr/booth/','2026-09-30','2026-10-01')
        codes=[row['locations'][0]['code'] for row in rows]
        self.assertEqual(len(rows),40)
        self.assertEqual(len(set(codes)),40)
        self.assertIn('E-01',codes)
        self.assertNotIn('E-02',codes)
        self.assertTrue(all(row['sources'][0]['access']=='ORIGINAL' for row in rows))
        self.assertTrue(all(row['sourceEntryId']==row['identity']['entryId'] for row in rows))


if __name__=='__main__':unittest.main()
