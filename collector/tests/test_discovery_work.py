import copy
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import weekly
from discovery_work import DiscoveryWorkQueue, festival_jobs, load_profiles, subculture_recent_jobs, subculture_source_jobs
from taxonomy import category_for


ROOT = Path(__file__).resolve().parents[1]
SCOPE = {"region": "SEOUL_GYEONGGI", "timezone": "Asia/Seoul", "startDate": "2026-11-01", "endDate": "2026-11-30"}


class DiscoveryWorkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.profile = load_profiles(ROOT / "discovery_profiles.json")

    def tearDown(self):
        self.temp.cleanup()

    def test_festival_profile_covers_all_local_authorities(self):
        self.assertEqual(len(self.profile["festival"]["seoulDistricts"]), 25)
        self.assertEqual(len(self.profile["festival"]["gyeonggiMunicipalities"]), 31)
        jobs = festival_jobs(self.profile, SCOPE)
        self.assertEqual(len(jobs), 56 + len(self.profile["festival"]["officialIndexes"]))
        self.assertEqual(len({row["subject"] for row in jobs}), len(jobs))

    def test_subculture_profile_has_fixed_recent_search_groups(self):
        queue = DiscoveryWorkQueue(self.root / "work.json")
        rows = queue.enqueue(subculture_recent_jobs(self.profile, SCOPE))
        self.assertEqual([row["subject"] for row in rows], [
            "온리전", "생일카페", "팝업 / 콜라보 카페", "부스 모집 / 부스 인포",
            "현장수령 / 선입금", "행사 / 전시 / 굿즈전", "서브컬처 음악 / DJ",
        ])
        self.assertTrue(all(row["payload"]["recentDays"] == 7 for row in rows))
        self.assertTrue(all(row["cadenceDays"] == 1 for row in rows))

    def test_subculture_music_sources_have_narrow_queries_and_category(self):
        queue = DiscoveryWorkQueue(self.root / "work.json")
        queue.enqueue(subculture_source_jobs(self.profile, SCOPE))
        due = queue.due("SUBCULTURE_SOURCE", 2)
        self.assertEqual({row["subject"] for row in due}, {"서브컬처 라이브·아이돌 공연", "서브컬처 애니송 DJ 행사"})
        self.assertTrue(all(row["category"] == "SUBCULTURE" for row in due))
        self.assertTrue(all(row["payload"]["allowedSubcategories"] == ["SUBCULTURE_MUSIC"] for row in due))
        self.assertEqual(category_for("SUBCULTURE_MUSIC"), "SUBCULTURE")
        self.assertEqual(category_for("MUSIC"), "FESTIVAL")
        self.assertFalse(any(row["payload"]["sourceType"] == "MUSIC_EVENT_INDEX" for row in festival_jobs(self.profile, SCOPE)))
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        context = pipeline.discovery_work_context(next(row for row in due if "DJ" in row["subject"]))
        self.assertTrue(any("DJ" in query for query in context["queries"]))
        self.assertEqual(context["source"]["sourceType"], "SUBCULTURE_MUSIC_INDEX")

    def test_subculture_dj_search_can_queue_subculture_music_once(self):
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        item = next(row for row in pipeline.discovery_work_queue.jobs.values() if row["subject"] == "서브컬처 음악 / DJ")
        fixture = json.loads((ROOT / "examples/v5/events.json").read_text(encoding="utf-8"))
        fixture = copy.deepcopy(fixture)
        fixture["events"][0]["subcategory"] = "SUBCULTURE_MUSIC"
        fixture["events"][0]["occurrences"] = [{"startDate": "2026-11-10", "endDate": "2026-11-10", "startTime": "18:00", "endTime": "21:00"}]
        with patch.object(weekly, "search_recent", return_value={"status": "COMPLETE", "posts": [], "issues": []}), \
             patch.object(weekly, "execute_search", return_value=(json.dumps(fixture).encode(), True, {})):
            self.assertEqual(pipeline.discovery_work_item(item), 1)
            music_item = next(row for row in pipeline.discovery_work_queue.jobs.values() if row["subject"] == "서브컬처 애니송 DJ 행사")
            pipeline.discovery_work_item(music_item)
        self.assertEqual(len(pipeline.event_queue.candidates), 1)

    def test_subculture_music_search_rejects_festival_music(self):
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        item = next(row for row in pipeline.discovery_work_queue.jobs.values() if row["subject"] == "서브컬처 애니송 DJ 행사")
        fixture = json.loads((ROOT / "examples/v5/events.json").read_text(encoding="utf-8"))
        fixture = copy.deepcopy(fixture)
        fixture["events"][0]["subcategory"] = "MUSIC"
        fixture["events"][0]["occurrences"] = [{"startDate": "2026-11-10", "endDate": "2026-11-10", "startTime": "18:00", "endTime": "21:00"}]
        with patch.object(weekly, "execute_search", return_value=(json.dumps(fixture).encode(), True, {})):
            self.assertEqual(pipeline.discovery_work_item(item), 0)
        self.assertFalse(pipeline.event_queue.candidates)

    def test_never_attempted_work_rotates_before_recent_work(self):
        queue = DiscoveryWorkQueue(self.root / "work.json")
        definitions = subculture_recent_jobs(self.profile, SCOPE)[:2]
        rows = queue.enqueue(definitions)
        queue.begin(rows[0]["key"])
        queue.finish(rows[0]["key"], "COMPLETE")
        due = queue.due("SUBCULTURE_RECENT", 1, datetime.now(timezone.utc) + timedelta(hours=1))
        self.assertEqual(due[0]["subject"], "생일카페")

    def test_festival_source_job_only_enqueues_festival_event(self):
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        item = next(row for row in pipeline.discovery_work_queue.jobs.values() if row["subject"] == "서울시 FUN SEOUL")
        fixture = json.loads((ROOT / "examples/v5/events.json").read_text(encoding="utf-8"))
        fixture = copy.deepcopy(fixture);fixture["events"][0]["subcategory"] = "CULTURE"
        fixture["events"][0]["occurrences"] = [{"startDate": "2026-11-10", "endDate": "2026-11-11", "startTime": "10:00", "endTime": "18:00"}]
        with patch.object(weekly, "execute_search", return_value=(json.dumps(fixture).encode(), True, {})):
            self.assertEqual(pipeline.discovery_work_item(item), 1)
        self.assertEqual(len(pipeline.event_queue.candidates), 1)
        self.assertEqual(pipeline.discovery_work_queue.jobs[item["key"]]["state"], "COMPLETE")

    def test_subculture_context_uses_exact_seven_day_window_and_x_result(self):
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        item = pipeline.discovery_work_queue.due("SUBCULTURE_RECENT", 1)[0]
        with patch.object(weekly, "search_recent", return_value={"status": "COMPLETE", "posts": [], "issues": []}):
            context = pipeline.discovery_work_context(item)
        start = datetime.fromisoformat(context["publishedSince"])
        end = datetime.fromisoformat(context["publishedUntil"])
        self.assertEqual((end - start).days, 7)
        self.assertEqual(context["xRecent"]["status"], "COMPLETE")
        self.assertTrue(all("after:" in query for query in context["queries"]))

    def test_cached_cli_without_open_url_details_does_not_false_reject_sources(self):
        cfg = weekly.load_config(None)
        cfg.update(stateDirectory=str(self.root / "state"), maxFestivalDiscoveryJobs=0, maxSubcultureSourceJobs=0, maxSubcultureDiscoveryJobs=0)
        with patch.dict(os.environ, {"BOOTH_COLLECTOR_TOKEN": "t" * 40}):
            pipeline = weekly.Pipeline(cfg, self.root / "run", SCOPE, dry_run=True)
        job = pipeline.job_dir("cached-current-cli")
        fixture = json.loads((ROOT / "examples/v5/events.json").read_text(encoding="utf-8"))
        weekly.write_json(job / "validated-result.json", fixture)
        weekly.write_json(job / "audit.json", {"webSearchObserved": True, "usage": {}, "openedUrls": [], "openedUrlAuditAvailable": False})
        (job / "codex.jsonl").write_text('{"type":"item.completed","item":{"type":"web_search","action":{"type":"other"}}}\n', encoding="utf-8")
        result, observed = pipeline.job("cached-current-cli", "unused", "event-result-v4.schema.json")
        self.assertTrue(observed)
        self.assertEqual(result["searchStatus"], fixture["searchStatus"])
        self.assertFalse(pipeline.issues)


if __name__ == "__main__":
    unittest.main()
