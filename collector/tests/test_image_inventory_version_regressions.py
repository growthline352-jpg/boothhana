"""Native section dates and changed LOTTE detail originals reach actual gates/queues."""
from copy import deepcopy
from contextlib import redirect_stdout
from datetime import datetime,timedelta,timezone
import io
import unittest
from unittest.mock import patch

import image_repair as images
import popup_catalog_sources as catalog
from official_poster_sources import parse_official_document
from official_site_sources import parse_site_document
from lotte_popup_sources import DETAIL_BASE,LIST_URL,detail_version
import test_popup_inventory as popup_tests
from popup_inventory import OfficialInventory

NAME='2026 테스트 문구 행사'
PAGE='https://official.example/event/2026'
OTHER='<aside><h2>다른 행사: 2025 연말 채용 설명회</h2><p>개최일: 2025.10.10 ~ 2025.10.11</p></aside>'
CURRENT='<p>행사 개최일: 2026.10.10 ~ 2026.10.11</p><section><img src="/poster.png" alt="공식 포스터"></section>'


class NativePosterDateContextTests(unittest.TestCase):
    def evidence(self,html):
        doc=parse_official_document('<main><h1>'+NAME+'</h1>'+html+'</main>',PAGE,'2026-10-07',NAME)
        return images.poster_evidence(doc['images'][0],doc,NAME,[],dict(name=NAME,edition='2026'))

    def test_closed_other_event_dates_before_and_after_current_image_are_excluded(self):
        for html in (OTHER+CURRENT,CURRENT+OTHER):
            with self.subTest(html=html):self.assertTrue(self.evidence(html))

    def test_other_event_full_date_in_its_heading_is_also_excluded(self):
        other='<aside><h2>다른 행사: 2025 연말 채용 설명회 개최일: 2025.10.10</h2></aside>'
        self.assertTrue(self.evidence(CURRENT+other))

    def test_other_section_h1_does_not_poison_native_target_heading_or_hide_wrong_target_year(self):
        other=OTHER.replace('<h2>','<h1>').replace('</h2>','</h1>')
        self.assertTrue(self.evidence(CURRENT+other));self.assertTrue(self.evidence(other+CURRENT))
        wrong=parse_official_document('<main><h1>2025 테스트 문구 행사</h1><img src="/poster.png" alt="포스터"></main>',PAGE,'2026-10-07',NAME)
        self.assertFalse(images.poster_evidence(wrong['images'][0],wrong,NAME,[],dict(name=NAME,edition='2026')))

    def test_same_event_wrong_date_in_general_guide_is_still_rejected(self):
        self.assertFalse(self.evidence('<section><h2>관람 안내</h2><p>개최일: 2025.10.10 ~ 2025.10.11</p><img src="/poster.png" alt="포스터"></section>'))

    def test_general_guide_and_table_field_labels_preserve_current_event_fallback(self):
        self.assertTrue(self.evidence('<section><h2>관람 안내</h2><table><tr><th>게시일</th><td>2025.10.01</td></tr><tr><th>개최일</th><td>2026.10.10 ~ 2026.10.11</td></tr></table><img src="/poster.png" alt="포스터"></section>'))

    def test_native_wrong_poster_name_and_edition_remain_rejected(self):
        for label in ('2026 산리오 팝업 포스터','2025 테스트 문구 행사 포스터'):
            with self.subTest(label=label):
                self.assertFalse(self.evidence(CURRENT.replace('공식 포스터',label)+OTHER))

    def test_google_sites_uses_same_heading_context_for_dates(self):
        page='https://sites.google.com/view/test-event/home';url='https://lh3.googleusercontent.com/poster.png'
        for unrelated in (OTHER,''):
            doc=parse_site_document('<main><h1>'+NAME+'</h1>'+CURRENT.replace('/poster.png',url)+unrelated+'</main>',page,'2026-10-07')
            self.assertTrue(images.poster_evidence(doc['images'][0],doc,NAME,[],dict(name=NAME,edition='2026')))


class NativeLotteDetailVersionTests(unittest.TestCase):
    setUp=popup_tests.PopupInventoryTests.setUp
    NEWS='SNM00000000000562455'
    def prepare(self,max_details=0):
        self.version=0;self.fail=False;self.reads=[]
        self.detail_url=DETAIL_BASE+self.NEWS
        self.branch.update(officialName='백화점 동탄점',officialNames=['백화점 동탄점'])
        self.listing='<div class="content-item" onclick="goUrl(\'C00903\',\''+self.NEWS+'\')"><span class="__title">브랜드 행사</span><span class="__info">백화점 동탄점</span></div><script>$([name=\'page\']).val(\'1\');$([name=\'hasNextYn\']).val(\'N\');$([name=\'totalCnt\']).val(\'1\');</script>'
        self.collector=OfficialInventory(self.run,fetch=self.http,state_path=self.path,known_events=[],published_events=[],max_details=max_details)
        self.collector.state.branches()[self.branch['key']]=deepcopy(self.branch)
        self.active=self.collector.state.branches()[self.branch['key']]
    def html(self,body,noise=''):
        return '<meta property="og:url" content="'+self.detail_url+'"><h3 class="__detail-title">브랜드 행사</h3><span class="__location">백화점 동탄점</span><span class="__place">1층 브랜드 행사장</span><p class="__date">11.10(화) ~ 11.11(수)</p><p class="__txt-desc">'+body+'</p><script>lddi.ShareLink.appData.cntsStDtm = \'20261110000000\';lddi.ShareLink.appData.cntsEndDtm = \'20261111000000\';</script>'+noise
    def http(self,url,body=None):
        self.reads.append(url)
        if url==self.branch['url']:return '동탄점 C00903 /contents/shpgInfoList'
        if '/store/main?' in url:return '<p class="__address">경기도 화성시 동탄역로 160</p>'
        if url==LIST_URL:return self.listing
        if url==self.detail_url:
            if self.fail:raise OSError('source temporarily unavailable')
            return self.html('신상품 소개' if self.version==0 else '캐릭터 굿즈 팝업스토어')
        raise AssertionError(url)
    def scan(self):
        with redirect_stdout(io.StringIO()):self.collector.scan_branch(self.active)
    def age(self):
        old=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat().replace('+00:00','Z')
        self.active.update(lastInventorySuccessAt=old,nextAttemptAt=old)

    def test_body_change_reopens_exclusion_and_actual_native_event_is_delivered(self):
        self.prepare();self.scan();old=self.active['items'][self.NEWS]['detailSourceDigest']
        self.assertEqual(self.active['items'][self.NEWS]['reason'],'NON_POPUP')
        self.age();self.version=1;self.scan()
        item=self.active['items'][self.NEWS]
        self.assertNotEqual(item['detailSourceDigest'],old);self.assertEqual(item['outcome'],'DRY_RUN')
        self.assertEqual(item['event']['subcategory'],'POPUP_RETAIL');self.assertEqual(self.active['state'],'COMPLETE')
        self.assertEqual(len(self.run.event_queue.candidates),1)
        self.assertTrue(list(self.run.folder.glob('jobs/official-popup-*/payload.json')))

    def test_same_completed_version_is_only_probed_not_reclassified_or_delivered(self):
        self.prepare();self.version=1;self.scan();self.age()
        before=deepcopy(self.run.receipts);offset=len(self.reads)
        with patch.object(catalog,'parse_detail',wraps=catalog.parse_detail) as classify:self.scan()
        classify.assert_not_called();self.assertEqual(self.run.receipts,before)
        self.assertEqual(self.reads[offset:].count(self.detail_url),1)
        self.assertEqual(self.active['items'][self.NEWS]['outcome'],'DRY_RUN')

    def test_native_version_ignores_navigation_noise_but_tracks_dates_and_image(self):
        self.prepare();card={'id':self.NEWS}
        html=self.html('신상품 소개')
        version=detail_version(html,card)
        self.assertEqual(detail_version(self.html('신상품   소개','<nav>20261007 request 123</nav>'),card),version)
        self.assertNotEqual(detail_version(html.replace('20261110000000','20261112000000'),card),version)
        self.assertNotEqual(detail_version(html+'<meta property="og:image" content="https://minfo.lotteshopping.com/'+self.NEWS+'/poster.png">',card),version)

    def test_failed_probe_retains_old_proof_and_retry_checks_changed_original(self):
        self.prepare();self.scan();old=self.active['items'][self.NEWS]['detailSourceDigest']
        self.age();self.version=1;self.fail=True;self.scan()
        self.assertEqual(self.active['state'],'PARTIAL');self.assertEqual(self.active['items'][self.NEWS]['detailSourceDigest'],old)
        self.assertEqual(self.active['items'][self.NEWS]['outcome'],'EXCLUDED')
        self.fail=False;self.scan()
        self.assertEqual(self.active['items'][self.NEWS]['outcome'],'DRY_RUN');self.assertEqual(self.active['state'],'COMPLETE')

    def test_old_unversioned_exclusion_is_checked_once_then_unchanged_version_skips(self):
        self.prepare();self.scan();self.active['items'][self.NEWS].pop('detailSourceDigest');self.age();self.scan()
        self.assertEqual(self.active['items'][self.NEWS]['reason'],'NON_POPUP')
        self.age()
        with patch.object(catalog,'parse_detail',wraps=catalog.parse_detail) as classify:self.scan()
        classify.assert_not_called();self.assertEqual(self.active['state'],'COMPLETE')

    def test_native_version_budget_retains_unvisited_items_and_resumes_same_snapshot(self):
        self.prepare(max_details=1)
        second='SNM00000000000562456';second_url=DETAIL_BASE+second
        self.listing=self.listing.split('<script>')[0]+self.listing.split('<script>')[0].replace(self.NEWS,second)+'<script>$([name=\'page\']).val(\'1\');$([name=\'hasNextYn\']).val(\'N\');$([name=\'totalCnt\']).val(\'2\');</script>'
        original=self.collector.fetch
        def http(url,body=None):
            if url==second_url:
                self.reads.append(url)
                return self.html('신상품 소개' if self.version==0 else '캐릭터 굿즈 팝업스토어').replace(self.detail_url,second_url).replace('브랜드 행사','다른 브랜드 행사')
            return original(url,body)
        self.collector.fetch=http
        self.scan();self.assertEqual(self.active['state'],'PARTIAL')
        self.scan();self.assertEqual(self.active['state'],'COMPLETE')
        self.age();self.version=1;self.scan()
        snapshot=self.active['inventoryRevision']
        self.assertEqual(self.active['state'],'PARTIAL');self.assertEqual(self.active['items'][second]['outcome'],'EXCLUDED')
        self.scan()
        self.assertEqual(self.active['inventoryRevision'],snapshot)
        self.assertEqual(self.active['state'],'COMPLETE');self.assertEqual(self.active['items'][second]['outcome'],'DRY_RUN')
        self.assertEqual(len(self.run.event_queue.candidates),2)

    def test_changed_native_detail_reopens_completed_research_job_instead_of_reusing_old_result(self):
        self.prepare();self.version=1
        with patch.object(catalog,'parse_detail',side_effect=ValueError('individual dates ambiguous')):self.scan()
        item=self.active['items'][self.NEWS];key=item['researchKey']
        self.run.discovery_work_queue.finish(key,'NO_RESULTS')
        self.scan();self.assertEqual(item['reason'],'RESEARCH_NO_POPUP')
        self.age()
        original=self.collector.fetch
        self.collector.fetch=lambda url,body=None:original(url,body).replace('캐릭터 굿즈','새 캐릭터 굿즈') if url==self.detail_url else original(url,body)
        with patch.object(catalog,'parse_detail',side_effect=ValueError('individual dates still ambiguous')):self.scan()
        job=self.run.discovery_work_queue.jobs[key]
        self.assertEqual(item['outcome'],'RESEARCH_QUEUED');self.assertEqual(job['state'],'PENDING')
        self.assertIsNone(job['nextRunAt']);self.assertEqual(job['payload']['detailSourceDigest'],item['detailSourceDigest'])


if __name__=='__main__':unittest.main()
