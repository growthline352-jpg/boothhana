import json
import unittest
from pathlib import Path

from import_manual_events import build_batch, month_bounds


ROOT = Path(__file__).resolve().parents[1]


class ManualEventImportTests(unittest.TestCase):
    def test_month_bounds(self):
        self.assertEqual(month_bounds("2026-11"), ("2026-11-01", "2026-11-30"))

    def test_official_november_file_builds_manual_batch(self):
        result = json.loads(
            (ROOT / "manual-data" / "2026-11-official-events.json").read_text(encoding="utf-8")
        )
        batch = build_batch(result, "2026-11", ["witchform.com"])
        self.assertEqual(batch["executionMode"], "MANUAL_IMPORT")
        self.assertFalse(batch["webSearchObserved"])
        self.assertEqual(len(batch["result"]["events"]), 41)

    def test_q4_file_builds_explicit_range_batch(self):
        result = json.loads(
            (ROOT / "manual-data" / "2026-q4-subculture-official-events.json").read_text(encoding="utf-8")
        )
        batch = build_batch(result, None, ["witchform.com"], "2026-10-01", "2026-12-31")
        self.assertEqual(batch["scope"]["startDate"], "2026-10-01")
        self.assertEqual(batch["scope"]["endDate"], "2026-12-31")
        self.assertEqual(len(batch["result"]["events"]), 4)


if __name__ == "__main__":
    unittest.main()
