"""Popup discovery must cover future openings without starving general sources."""
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone
from discovery_work import DiscoveryWorkQueue, load_profiles, popup_jobs
from daily_popups import select_source_jobs


class PopupUpcomingTests(unittest.TestCase):
    def setUp(self):
        self.scope = dict(region='SEOUL_GYEONGGI', timezone='Asia/Seoul', startDate='2026-10-04', endDate='2026-11-03')
        self.profile = load_profiles(Path(__file__).resolve().parents[1] / 'discovery_profiles.json')

    def test_upcoming_sources_include_seoul_and_gyeonggi_official_announcements(self):
        jobs = popup_jobs(self.profile, self.scope)
        future = [r for r in jobs if r['payload'].get('openingFocus') == 'UPCOMING']
        self.assertGreaterEqual(len(future), 2)
        self.assertTrue(any(r['payload']['region'] == '경기' for r in future))
        self.assertTrue(any('ehyundai.com' in url for r in future for url in r['payload']['seeds']))
        self.assertTrue(any('starfield.co.kr' in url for r in future for url in r['payload']['seeds']))

    def test_future_slot_and_general_sources_both_rotate_with_existing_attempt_history(self):
        with tempfile.TemporaryDirectory() as temp:
            queue = DiscoveryWorkQueue(Path(temp) / 'jobs.json')
            queue.enqueue(popup_jobs(self.profile, self.scope))
            seen = set()
            for day in range(6):
                jobs = select_source_jobs(queue, 2)
                self.assertEqual(len(jobs), 2)
                self.assertEqual(sum(r['payload'].get('openingFocus') == 'UPCOMING' for r in jobs), 1)
                seen.update(r['subject'] for r in jobs)
                for item in jobs:
                    queue.begin(item['key'])
                    queue.finish(item['key'], 'PARTIAL', retry_hours=24)
                # Simulate next day's scheduler without resetting attempt history.
                for item in queue.jobs.values():
                    item['nextRunAt'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
            self.assertEqual(seen, {r['subject'] for r in queue.jobs.values()})

    def test_not_due_future_source_does_not_waste_general_slot(self):
        with tempfile.TemporaryDirectory() as temp:
            queue = DiscoveryWorkQueue(Path(temp) / 'jobs.json')
            queue.enqueue(popup_jobs(self.profile, self.scope))
            for item in queue.jobs.values():
                if item['payload'].get('openingFocus') == 'UPCOMING':
                    item['nextRunAt'] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
            jobs = select_source_jobs(queue, 2)
            self.assertEqual(len(jobs), 2)
            self.assertTrue(all(r['payload'].get('openingFocus') != 'UPCOMING' for r in jobs))
