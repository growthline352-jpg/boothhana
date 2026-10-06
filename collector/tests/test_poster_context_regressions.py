"""Native image labels/section bounds precede page titles and research hints."""
from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import event_banner_validation as banners
import image_repair as images
from official_poster_sources import parse_official_document, IMAGE_CONTEXT_POLICY
from official_site_sources import parse_site_document
import test_event_banner_validation as banner_tests
from test_image_repair import target

NAME = '2026 테스트 문구 행사'
WRONG = '2026 연말 채용 설명회'
IMAGE, PAGE = banner_tests.IMAGE, banner_tests.PAGE


class PosterContextRegressions(unittest.TestCase):
    def document(self, fragment, page=PAGE):
        return parse_official_document('<main><h1>'+NAME+'</h1>'+fragment+'</main>', page, '2026-10-06', NAME)

    def evidence(self, document, url=IMAGE):
        row=next(row for row in document['images'] if row['url']==url)
        return images.poster_evidence(row,document,NAME,[url],dict(name=NAME,edition='2026'))

    def test_other_native_image_name_blocks_matching_page_title_and_hint(self):
        for fragment in ('<div class="poster"><img src="/poster.png" alt="'+WRONG+' 포스터"></div>',
                         '<meta property="og:image" content="'+IMAGE+'"><img src="/poster.png" alt="'+WRONG+' 포스터">'):
            with self.subTest(fragment=fragment):
                doc=self.document(fragment)
                self.assertTrue(doc['sourceTitleMatchesEvent'])
                self.assertFalse(self.evidence(doc))

    def test_generic_alt_still_blocks_other_containing_section_and_nested_heading(self):
        for label in ('포스터', '', NAME+' 포스터'):
            doc=self.document('<aside><div><h2>다른 행사: '+WRONG+'</h2></div><h3>공식 포스터</h3><img src="/poster.png" alt="'+label+'"></aside>')
            with self.subTest(label=label):
                self.assertIn('다른 행사: '+WRONG,doc['images'][0]['sectionHeadings'])
                self.assertFalse(self.evidence(doc))

    def test_closed_other_section_does_not_poison_correct_sibling_fallback(self):
        doc=self.document('<aside><h2>'+WRONG+'</h2><img src="/wrong.png" alt="포스터"></aside>'
                          '<section><h2>공식 포스터 다운로드</h2><img src="/poster.png" alt="공식 행사 포스터"></section>')
        self.assertFalse(self.evidence(doc,PAGE.rsplit('/',2)[0]+'/wrong.png'))
        self.assertTrue(self.evidence(doc))
        self.assertNotIn(WRONG,next(row for row in doc['images'] if row['url']==IMAGE)['sectionHeadings'])

    def test_generic_artwork_or_field_headings_preserve_single_event_fallback(self):
        for label in ('', '2026 포스터', '공식 행사 포스터', 'official poster image', 'Image 1', NAME+' 포스터'):
            with self.subTest(label=label):
                doc=self.document('<section><h2>개최 장소: 서울특별시 강남구</h2><img src="/poster.png" alt="'+label+'"></section>')
                self.assertTrue(self.evidence(doc))

    def test_visit_heading_and_photo_description_do_not_claim_another_event_name(self):
        doc=self.document('<section><h2>방문 전 알아두세요</h2><img src="/poster.png" alt="억새 사이를 걷는 사람들"></section>')
        self.assertTrue(self.evidence(doc))

    def test_native_partial_character_event_name_preserves_long_display_name(self):
        name='사카타 긴토키 (은혼) 생일카페 이벤트 · Dangbun Laundry'
        html='<main><h1>'+name+'</h1><h2>방문 전 알아두세요</h2><img src="/poster.png" alt="긴토키 생일카페 포스터"></main>'
        doc=parse_official_document(html,PAGE,'2026-10-06',name)
        self.assertTrue(images.poster_evidence(doc['images'][0],doc,name,[IMAGE],dict(name=name,edition='2026')))
        wrong=parse_official_document(html.replace('alt="긴토키','alt="타카스기'),PAGE,'2026-10-06',name)
        self.assertFalse(images.poster_evidence(wrong['images'][0],wrong,name,[IMAGE],dict(name=name,edition='2026')))

    def test_event_section_shortcut_cannot_override_other_native_image_label(self):
        doc=self.document('<img src="/poster.png" alt="'+WRONG+' 포스터">')
        doc['sourceScope']='EVENT_SECTION'
        self.assertFalse(self.evidence(doc))

    def test_duplicate_native_labels_keep_wrong_year_and_numbered_edition_checks(self):
        for expected,other in [(NAME,'2025 테스트 문구 행사'),('제38회 플래툰 컨벤션','제37회 플래툰 컨벤션')]:
            html='<main><h1>'+expected+'</h1><meta property="og:image" content="'+IMAGE+'"><img src="/poster.png" alt="'+other+' 포스터"></main>'
            doc=parse_official_document(html,PAGE,'2026-10-06',expected)
            with self.subTest(expected=expected):
                self.assertFalse(images.poster_evidence(doc['images'][0],doc,expected,[IMAGE],dict(name=expected,edition='2026')))

    def test_google_sites_preview_duplicates_preserve_other_native_name_and_section(self):
        page='https://sites.google.com/view/test-event/home';url='https://lh3.googleusercontent.com/poster.png'
        html='<meta property="og:image" content="'+url+'"><h1>'+NAME+'</h1><aside><h2>'+WRONG+'</h2><img src="'+url+'" alt="'+WRONG+' 포스터"></aside>'
        doc=parse_site_document(html,page,'2026-10-06')
        self.assertEqual(doc['images'][0]['role'],'PAGE_PREVIEW')
        self.assertIn(WRONG+' 포스터',doc['images'][0]['nativeLabels'])
        self.assertFalse(self.evidence(doc,url))
        positive=parse_site_document('<h1>'+NAME+'</h1><h2>공식 포스터</h2><img src="'+url+'" alt="포스터">',page,'2026-10-06')
        self.assertTrue(self.evidence(positive,url))

    def test_tmm_sale_excerpt_is_not_mistaken_for_an_explicit_image_name(self):
        page='https://takemm.com/prod/view/71267'
        doc=dict(sourceUrl=page,title=NAME,bodyText=NAME+' 행사 안내')
        image=dict(url='https://image.takemm.com/poster.png',role='CONTENT',nearbyText='입장 예약 안내\n무료 관람, 메뉴와 가격')
        self.assertTrue(images.poster_evidence(image,doc,NAME,[image['url']],dict(name=NAME,edition='2026')))
        image.update(role='PAGE_PREVIEW',nearbyText=WRONG)
        self.assertFalse(images.poster_evidence(image,doc,NAME,[image['url']],dict(name=NAME,edition='2026')))

    def test_policy_change_reopens_old_completed_image_version_but_keeps_current_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);cfg=images.load_config(None)
            job=images.Repair(cfg,object(),path)
            self.assertEqual(job.policy[-1],'event-thumbnail-v10')
            old_policy=[*job.policy[:-1],'event-thumbnail-v9'];value=target();at=images.now()
            old_stamp,_=job.queue.due(value,old_policy,at)
            job.queue.record(value,old_stamp,'EXHAUSTED',dict(methods=[]),at)
            new_stamp,due=job.queue.due(value,job.policy,at)
            self.assertTrue(due);self.assertNotEqual(old_stamp,new_stamp)
            job.queue.record(value,new_stamp,'VERIFIED',{},at)
            self.assertFalse(job.queue.due(value,job.policy,at+timedelta(days=30))[1])


class BannerContextDeliveryRegressions(unittest.TestCase):
    setUp = banner_tests.EventBannerValidationTests.setUp
    body = banner_tests.EventBannerValidationTests.body
    source = banner_tests.EventBannerValidationTests.source
    html = banner_tests.EventBannerValidationTests.html
    def test_matching_event_page_rejects_only_other_poster_and_old_gate_cache(self):
        html='<main><h1>'+NAME+'</h1><section><h2>'+WRONG+'</h2><img src="/poster.png" alt="포스터"></section></main>'
        body=self.body();folder=self.root/'old-proof';folder.mkdir()
        run_id=body['runId']
        (folder/'banner-validation.json').write_text(json.dumps(dict(policy=['event-batch-native-banners-v1',[]],payloadDigest=banners.digest(body),verified=1,rejected=0)),encoding='utf-8')
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(html,'')):
            gated,report=banners.guard_batch_banners(body,self.cfg,folder)
        self.assertEqual(gated['result']['events'][0],{**self.event,'banners':[]})
        self.assertNotEqual(gated['runId'],run_id);self.assertEqual(report['policy'][0],'event-batch-native-banners-v3')
        self.assertEqual(report['rejected'],1)
        self.assertEqual(json.loads((folder/report['originalPayload']).read_text(encoding='utf-8')),body)

    def test_old_parser_proof_is_refetched_before_generic_image_can_pass(self):
        old=self.source('<h1>'+NAME+'</h1><img src="/poster.png" alt="포스터">')
        old.pop('imageContextPolicy');old['images'][0].pop('sectionHeadings')
        fresh='<main><h1>'+NAME+'</h1><aside><h2>'+WRONG+'</h2><img src="/poster.png" alt="포스터"></aside></main>'
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(fresh,'')) as fetch:
            events,report=banners.validate_event_banners([self.event],self.cfg,self.root/'sources',source_documents=[old])
        fetch.assert_called_once();self.assertEqual(events[0]['banners'],[])
        self.assertEqual(report[0]['nativeSource']['imageContextPolicy'],IMAGE_CONTEXT_POLICY)
        no_read,report=banners.validate_event_banners([self.event],self.cfg,self.root/'unread',source_documents=[old],allow_fetch=False)
        self.assertEqual(no_read[0]['banners'],[]);self.assertEqual(report[0]['state'],'ORIGINAL_NOT_READ')


if __name__=='__main__':unittest.main()
