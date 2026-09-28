import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from event_queue import EventNameQueue, candidate_key, discovered_candidate_key, normalize_name
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

    def test_decorative_punctuation_does_not_break_official_name_match(self):
        self.assertEqual(
            normalize_name("2026 서울국제주류&와인박람회 마곡"),
            normalize_name("2026 서울국제주류&와인박람회 ‘마곡’"),
        )
        url = "https://official.example/event"
        event = {"name": "2026 서울국제주류&와인박람회 ‘마곡’", "sources": [{"url": url, "kind": "OFFICIAL", "access": "ORIGINAL", "evidence": "일정"}]}
        result = {"sourceCoverage": [{"channel": "ORGANIZER_OFFICIAL", "status": "CHECKED", "queries": ["행사"], "checkedUrls": [url], "notes": "원문"}]}
        self.assertEqual(official_source_issues("2026 서울국제주류&와인박람회 마곡", result, event), [])

    def test_same_year_sliding_window_reuses_candidate_and_expands_scope(self):
        first = self.queue.enqueue(["행사 A"], SCOPE)[0]
        shifted = {**SCOPE, "startDate": "2026-11-15", "endDate": "2026-12-15"}
        second = self.queue.enqueue(["행사 A"], shifted)[0]
        self.assertEqual(first["key"], second["key"])
        self.assertEqual(second["scope"]["startDate"], "2026-11-01")
        self.assertEqual(second["scope"]["endDate"], "2026-12-15")
        self.assertEqual(self.queue.summary(shifted)["PENDING"], 1)

    def test_discovered_editions_are_separate_durable_jobs(self):
        base = {"name": "정기 행사", "edition": None, "organizer": "주최사", "venueName": "행사장", "region": "SEOUL", "sources": []}
        first = {**base, "occurrences": [{"startDate": "2026-11-01", "endDate": "2026-11-01"}]}
        second = {**base, "occurrences": [{"startDate": "2026-12-01", "endDate": "2026-12-01"}]}
        rows = self.queue.enqueue_discovered([first, second], SCOPE)
        self.assertEqual(len(rows), 2)
        self.assertNotEqual(discovered_candidate_key(first, SCOPE), discovered_candidate_key(second, SCOPE))
        self.assertEqual(rows[0]["origins"], ["MONTHLY_DISCOVERY"])
        self.assertEqual(rows[0]["discoveryLead"]["venueName"], "행사장")

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
        self.assertIn("first-party original URL missing from sourceCoverage.checkedUrls", official_source_issues("행사 A", result, event))

    def test_small_only_event_accepts_organizer_social_without_homepage(self):
        post = "https://x.com/small_only_event/status/123456789"
        event = {
            "name": "작은 온리전",
            "subcategory": "ONLY_EVENT",
            "sources": [{"url": post, "kind": "ORGANIZER_SOCIAL", "access": "ORIGINAL", "evidence": "주최 계정의 날짜·장소 공지"}],
        }
        result = {
            "sourceCoverage": [{
                "channel": "ORGANIZER_OFFICIAL", "status": "CHECKED", "queries": ["작은 온리전"],
                "checkedUrls": [post], "notes": "독립 홈페이지 없이 주최 SNS 원문 확인",
            }]
        }
        self.assertEqual(official_source_issues("작은 온리전", result, event), [])

    def test_participant_post_alone_is_not_first_party_event_confirmation(self):
        post = "https://x.com/participant/status/987654321"
        event = {
            "name": "작은 온리전",
            "subcategory": "ONLY_EVENT",
            "sources": [{"url": post, "kind": "OTHER", "access": "ORIGINAL", "evidence": "참가자 부스 인포"}],
        }
        result = {
            "sourceCoverage": [{
                "channel": "PARTICIPANT_SOCIAL", "status": "CHECKED", "queries": ["작은 온리전 부스 인포"],
                "checkedUrls": [post], "notes": "참가자 글 한 건만 확인",
            }]
        }
        self.assertIn("no first-party original source", official_source_issues("작은 온리전", result, event)[0])


if __name__ == "__main__":
    unittest.main()
