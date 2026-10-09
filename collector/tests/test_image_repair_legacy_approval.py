"""Existing pending posters need fresh evidence before automatic re-registration."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import image_repair as images
from test_image_repair import FakeApi, target, asset, RAW, SHA, PAGE, URL
from weekly import load_config


class LegacyApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = load_config(None)
        self.cfg.update(stateDirectory=str(self.root), blockedSourceHosts=[],
                        imageAllowedHosts=[], autoApproveCollectedData=True,
                        maxThumbnailSearches=0)
        self.value = target()
        self.value['event'].update(edition='2026', occurrences=[dict(
            startDate='2026-10-10', endDate='2026-10-11')])
        self.value['assets'] = [asset(rights='PENDING', state='CANDIDATE')]
        self.api = FakeApi([self.value])
        original = self.api.request

        def request(method, path, data=None, **kwargs):
            if method == 'POST' and path.endswith('/events/1/assets'):
                self.api.calls.append((method, path, data, kwargs))
                return asset(state='CANDIDATE')
            if method == 'GET' and path.endswith('/assets/10'):
                self.api.calls.append((method, path, data, kwargs))
                return asset(state='CANDIDATE')
            return original(method, path, data, **kwargs)

        self.api.request = request
        self.job = images.Repair(self.cfg, self.api, self.root/'repair', apply=True)

    def discover(self, html=None, raw=RAW, sha=SHA):
        html = html or '<h1>2026 테스트 행사</h1><div class="poster"><img src="/poster.png"></div>'
        with patch.object(images, 'allowed_by_robots', return_value=True), \
             patch.object(images, 'fetch_html', return_value=(html, '')), \
             patch.object(images, 'fetch_image', return_value=(raw, 'image/png', sha)):
            return self.job.discover(self.value)

    def test_fresh_evidence_reapproves_existing_pending_then_verifies_public_bytes(self):
        state, note = self.discover()
        self.assertEqual(state, 'VERIFIED')
        paths = [call[1] for call in self.api.calls]
        self.assertEqual(paths, [images.PATH+'/events/1/assets',
                                images.PATH+'/assets/10', images.PATH+'/assets/10/content'])
        self.assertEqual(note['candidates'][0]['assetId'], 10)
        self.assertEqual(self.value['assets'][0]['rightsState'], 'APPROVED')
        self.assertTrue(note['stored']['detailVerified'])
        self.assertTrue(note['stored']['listVerified'])

    def test_cached_verified_bytes_still_require_fresh_matching_official_page(self):
        from detail_image_cache import retain_images
        blob = self.root/'pending.png'
        blob.write_bytes(RAW)
        retain_images([dict(sourceUrl=PAGE, status='READ', images=[dict(
            url=URL, analysisStatus='ATTACHED', imageFile=blob.name,
            contentType='image/png', sha256=SHA, fetchedUrls=[URL])])],
            [blob], self.root/'detail-image-cache-v1')
        with patch.object(images, 'allowed_by_robots', return_value=True), \
             patch.object(images, 'fetch_html', return_value=('<h1>2026 테스트 행사</h1>', '')), \
             patch.object(images, 'fetch_image', side_effect=AssertionError('No verified page image')):
            _, note = self.job.discover(self.value)
        self.assertEqual(note['candidates'], [])
        self.assertEqual(self.api.calls, [])

    def test_rejection_or_explicit_review_note_is_not_overwritten(self):
        for change in (dict(rightsState='REJECTED'),
                       dict(rightsState='PENDING', rightsNote='사용 승인 보류: 원저작자 확인 필요')):
            with self.subTest(change=change):
                self.value['assets'] = [{**asset(rights='PENDING', state='CANDIDATE'), **change}]
                self.api.calls.clear()
                self.discover()
                self.assertEqual(self.api.calls, [])

    def test_old_edition_or_font_bytes_or_placeholder_do_not_reapprove(self):
        with self.subTest(reason='previous edition'):
            self.discover('<h1>2025 테스트 행사</h1><div class="poster"><img src="/poster.png"></div>')
            self.assertEqual(self.api.calls, [])
        with self.subTest(reason='invalid font bytes'):
            self.discover(raw=b'wOF2 invalid font bytes')
            self.assertEqual(self.api.calls, [])
        with self.subTest(reason='verified placeholder bytes'):
            with patch.object(images, 'PLACEHOLDER_SHA256', {SHA}):
                self.discover()
            self.assertEqual(self.api.calls, [])

    def test_robots_denial_cannot_reapprove_the_cached_candidate(self):
        with patch.object(images, 'allowed_by_robots', return_value=False), \
             patch.object(images, 'fetch_html', side_effect=AssertionError('Blocked source')):
            self.job.discover(self.value)
        self.assertEqual(self.api.calls, [])

    def test_explicit_selected_pending_banner_remains_blocked(self):
        self.value['selectedBannerAssetId'] = 10
        with patch.object(self.job, 'discover', side_effect=AssertionError('Preserve explicit selection')):
            state, _ = self.job.repair(self.value)
        self.assertEqual(state, 'SELECTION_BLOCKED')
        self.assertEqual(self.api.calls, [])


if __name__ == '__main__':
    unittest.main()
