import unittest

from publish_month import month_bounds, overlaps, source_backed


class PublishMonthTests(unittest.TestCase):
    def test_bounds_include_leap_day(self):
        self.assertEqual(month_bounds("2028-02"), ("2028-02-01", "2028-02-29"))

    def test_overlap_includes_event_started_previous_month(self):
        self.assertTrue(overlaps({"occurrences": [{"startDate": "2026-10-30", "endDate": "2026-11-02"}]}, "2026-11-01", "2026-11-30"))

    def test_original_official_source_required(self):
        self.assertTrue(source_backed({"sources": [{"kind": "VENUE", "access": "ORIGINAL"}]}))
        self.assertFalse(source_backed({"sources": [{"kind": "AGGREGATOR", "access": "ORIGINAL"}]}))
        self.assertFalse(source_backed({"sources": [{"kind": "OFFICIAL", "access": "SEARCH_SNIPPET"}]}))


if __name__ == "__main__":
    unittest.main()
