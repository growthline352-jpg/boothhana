import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from event_queue import EventNameQueue, candidate_key
from weekly import official_source_issues


SCOPE = {"region": "SEOUL_GYEONGGI", "timezone": "Asia/Seoul", "startDate": "2026-11-01", "endDate": "2026-11-30"}


class EventNameQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "queue.json"
        self.queue = EventNameQueue(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_names_are_independent_and_deduplicated(self):
        rows = self.queue.enqueue(["행사 A", "행사 B", "행사 A"], SCOPE)
        self.assertEqual(len(self.queue.candidates), 2)
        self.assertEqual(rows[0]["key"], rows[2]["key"])
        self.assertNotEqual(candidate_key("행사 A", SCOPE), candidate_key("행사 B", SCOPE))

    def test_same_year_sliding_window_reuses_candidate_and_expands_scope(self):
        first = self.queue.enqueue(["행사 A"], SCOPE)[0]
        shifted = {**SCOPE, "startDate": "2026-11-15", "endDate": "2026-12-15"}
        second = self.queue.enqueue(["행사 A"], shifted)[0]
        self.assertEqual(first["key"], second["key"])
        self.assertEqual(second["scope"]["startDate"], "2026-11-01")
        self.assertEqual(second["scope"]["endDate"], "2026-12-15")
        self.assertEqual(self.queue.summary(shifted)["PENDING"], 1)

    def test_retry_and_terminal_found(self):
        item = self.queue.enqueue(["행사 A"], SCOPE)[0]
        self.queue.begin(item["key"])
        self.queue.finish(item["key"], "PARTIAL", retry_hours=24, issues=["official source unavailable"])
        self.assertEqual(self.queue.due(SCOPE, 10, 5), [])
        tomorrow = datetime.now(timezone.utc) + timedelta(hours=25)
        self.assertEqual(len(self.queue.due(SCOPE, 10, 5, tomorrow)), 1)
        self.queue.finish(item["key"], "FOUND", retry_hours=0, event_id=17, matched_name="행사 A")
        self.assertEqual(self.queue.due(SCOPE, 10, 5, tomorrow), [])

    def test_stage_state_is_tied_to_found_event(self):
        item = self.queue.enqueue(["행사 A"], SCOPE)[0]
        self.queue.finish(item["key"], "FOUND", retry_hours=0, event_id=17, matched_name="행사 A")
        self.assertTrue(self.queue.mark_stage(17, "FLOORPLAN", "RUNNING"))
        self.assertTrue(self.queue.mark_stage(17, "FLOORPLAN", "PARTIAL", ["not published"]))
        stage = self.queue.candidates[item["key"]]["stages"]["FLOORPLAN"]
        self.assertEqual(stage["attempts"], 1)
        self.assertEqual(stage["state"], "PARTIAL")

    def test_official_original_must_be_in_checked_urls(self):
        url = "https://official.example/event"
        event = {"name": "행사 A", "sources": [{"url": url, "kind": "OFFICIAL", "access": "ORIGINAL", "evidence": "일정"}]}
        result = {"sourceCoverage": [{"channel": "ORGANIZER_OFFICIAL", "status": "CHECKED", "queries": ["행사 A"], "checkedUrls": [url], "notes": "원문"}]}
        self.assertEqual(official_source_issues("행사 A", result, event), [])
        result["sourceCoverage"][0]["checkedUrls"] = []
        self.assertIn("official original URL missing from sourceCoverage.checkedUrls", official_source_issues("행사 A", result, event))


if __name__ == "__main__":
    unittest.main()
