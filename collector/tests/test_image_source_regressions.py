"""Offline regressions for native poster identity and source-version completion."""
import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import image_repair as images
import recheck
from official_poster_sources import parse_official_document
from official_site_sources import parse_site_document
from event_detail_sources import parse_tmm_product
from test_image_repair import FakeApi, target, asset, RAW, SHA, PAGE, URL
from weekly import load_config


class ImageSourceRegressions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.cfg=load_config(None)
        self.cfg.update(stateDirectory=str(self.root),blockedSourceHosts=[],imageAllowedHosts=[],autoApproveCollectedData=True,maxThumbnailSearches=0)

    def value(self):
        value=target();value['sourceDigest']=None
        value['event']['sources'][0]['access']='ORIGINAL'
        value['event'].update(edition='2026',occurrences=[dict(startDate='2026-10-10',endDate='2026-10-11')])
        return value

    def api(self,value):
        api=FakeApi([value]);original=api.request
        def request(method,path,data=None,**kwargs):
            if path.endswith('/events/1/assets'):
                api.calls.append((method,path,data,kwargs));return dict(id=10,rightsState='APPROVED')
            if method=='GET' and path.endswith('/assets/10'):
                api.calls.append((method,path,data,kwargs));return asset(state='CANDIDATE')
            return original(method,path,data,**kwargs)
        api.request=request
        return api

    def document(self,media=''):
        text='이번 행사 장소와 운영 안내는 공식 홈페이지에서 확인할 수 있습니다. 자세한 행사 내용과 개최 목적, 참여 안내를 함께 확인하세요. '
        return '<main><h1>2026 테스트 행사</h1><p>행사 개최일: 2026.10.10 ~ 2026.10.11</p><p>'+text*2+'</p>'+media+'</main>'

    def read(self,value,html):
        with patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',return_value=(html,'')):
            documents,failed,_=recheck.read_sources(value['event'],self.root/'sources',self.cfg)
        self.assertFalse(failed);self.assertEqual(len(documents),1)
        return documents

    def test_research_hint_for_other_event_does_not_register_or_upload(self):
        value=self.value();api=self.api(value);job=images.Repair(self.cfg,api,self.root/'repair',apply=True)
        wrong_page='https://organizer.example/recruitment/2026';wrong_image='https://organizer.example/recruitment-poster.png'
        wrong='<h1>2026 연말 채용 설명회</h1><p>개최일: 2026.10.10</p><div class="poster"><img src="/recruitment-poster.png" alt="2026 연말 채용 설명회 포스터"></div>'
        found=dict(state='RESEARCH_FOUND',sources=[dict(url=wrong_page,kind='OFFICIAL',imageUrls=[wrong_image])])
        def html(url,*args):return (wrong if url==wrong_page else self.document(),'')
        with patch.object(images,'allowed_by_robots',return_value=True),patch.object(images,'fetch_html',side_effect=html),patch.object(images,'fetch_image') as fetch,patch.object(job.research,'search',return_value=found):
            state,note=job.discover(value)
        self.assertEqual(state,'NO_IMAGE_FOUND');self.assertEqual(note['candidates'],[])
        self.assertEqual(api.calls,[]);fetch.assert_not_called()

    def test_hint_preserves_native_name_variants_and_named_image(self):
        for expected,title in [('2026 테스트 행사','테스트-행사 2026'),('제38회 플래툰 컨벤션','38회 플래툰 컨벤션 2026')]:
            with self.subTest(expected=expected):
                doc=parse_official_document(f'<h1>{title}</h1><img src="/hero.png">',PAGE,'2026-10-06',expected)
                self.assertTrue(images.poster_evidence(doc['images'][0],doc,expected,[doc['images'][0]['url']],dict(name=expected,edition='2026')))
        doc=parse_official_document('<h1>주최자 공지</h1><img src="/hero.png" alt="2026 테스트 행사 포스터">',PAGE,'2026-10-06','2026 테스트 행사')
        self.assertTrue(images.poster_evidence(doc['images'][0],doc,'2026 테스트 행사',event=self.value()['event']))

    def test_special_page_body_requires_actual_matching_event_even_with_hint(self):
        for kind,page in [('GOOGLE_SITES','https://sites.google.com/view/event'),('TMM_PUBLIC_PRODUCT','https://takemm.com/prod/view/71267')]:
            image=dict(url=URL,role='PAGE_PREVIEW')
            with self.subTest(kind=kind):
                doc=dict(sourceType=kind,sourceUrl=page,title='공식 안내',bodyText='2026 테스트 행사 안내')
                self.assertTrue(images.poster_evidence(image,doc,'2026 테스트 행사',[URL],self.value()['event']))
                doc['bodyText']='2026 연말 채용 설명회 안내'
                self.assertFalse(images.poster_evidence(image,doc,'2026 테스트 행사',[URL],self.value()['event']))

    def test_name_normalization_does_not_hide_a_different_numbered_edition(self):
        name='제38회 플래툰 컨벤션'
        for title in ('제37회 플래툰 컨벤션 2026','37회 플래툰 컨벤션 2026'):
            with self.subTest(title=title):
                doc=parse_official_document(f'<h1>{title}</h1><img src="/poster.png">',PAGE,'2026-10-06',name)
                self.assertFalse(images.poster_evidence(doc['images'][0],doc,name,[URL],dict(name=name,edition='2026')))

    def test_native_aggregate_section_preserves_variant_and_rejects_other_section(self):
        html='<section id="mdftv_1"><h5>테스트 행사 2026</h5><img src="/target.png" alt="테스트 행사"></section><section id="mdftv_2"><h5>다른 행사</h5><img src="/wrong.png" alt="다른 행사"></section>'
        doc=parse_official_document(html,'https://web1.gg.go.kr/a#mdftv_1','2026-10-06','2026 테스트 행사')
        self.assertEqual(doc['sourceScope'],'EVENT_SECTION')
        self.assertTrue(images.poster_evidence(doc['images'][0],doc,'2026 테스트 행사',event=self.value()['event']))
        wrong=parse_official_document(html,'https://web1.gg.go.kr/a#mdftv_2','2026-10-06','2026 테스트 행사')
        self.assertEqual(wrong['images'],[])
        ordinal='<section id="mdftv_1"><h5>38회 플래툰 컨벤션 2026</h5><img src="/target.png" alt="제38회 플래툰 컨벤션 포스터"></section>'
        doc=parse_official_document(ordinal,'https://web1.gg.go.kr/a#mdftv_1','2026-10-06','제38회 플래툰 컨벤션')
        self.assertEqual(doc['sourceScope'],'EVENT_SECTION')
        self.assertTrue(images.poster_evidence(doc['images'][0],doc,'제38회 플래툰 컨벤션',event=dict(name='제38회 플래툰 컨벤션',edition='2026')))
        old=parse_official_document(ordinal.replace('2026','2025'),'https://web1.gg.go.kr/a#mdftv_1','2026-10-06','제38회 플래툰 컨벤션')
        self.assertFalse(images.poster_evidence(old['images'][0],old,'제38회 플래툰 컨벤션',event=dict(name='제38회 플래툰 컨벤션',edition='2026')))

    def test_pending_old_asset_preserves_verified_public_replacement_and_completion(self):
        value=self.value();value['assets']=[{**asset(id=42,rights='PENDING',state='CANDIDATE'),'imageUrl':'https://official.example/old.png'}]
        api=self.api(value);job=images.Repair(self.cfg,api,self.root/'repair',apply=True,drain=True)
        with patch.object(images,'allowed_by_robots',return_value=True),patch.object(images,'fetch_html',return_value=(self.document('<div class="poster"><img src="/poster.png"></div>'),'')),patch.object(images,'fetch_image',return_value=(RAW,'image/png',SHA)):
            report=job.run_batch()
        row=report['events'][0]
        self.assertEqual(report['counts'],{'VERIFIED':1});self.assertTrue(row['completedAt'])
        self.assertEqual(row['details']['assetIds'],[42]);self.assertTrue(row['details']['stored']['detailVerified']);self.assertTrue(row['details']['stored']['listVerified'])
        self.assertTrue(any(call[1].endswith('/content') for call in api.calls))

    def test_pending_old_asset_does_not_mask_failure_delay_or_exhaustion(self):
        value=self.value();value['assets']=[asset(rights='PENDING',state='CANDIDATE')]
        job=images.Repair(self.cfg,self.api(value),self.root/'repair')
        for state in ('FETCH_FAILED','STORAGE_FAILED','PUBLICATION_FAILED','RESEARCH_DEFERRED','RESEARCH_BLOCKED','RESEARCH_FAILED','SOURCE_BLOCKED','EXHAUSTED','WAITING_REVIEW'):
            with self.subTest(state=state),patch.object(job,'discover',return_value=(state,dict(nextAction='native action'))):
                result,note=job.repair(value)
            self.assertEqual(result,state);self.assertEqual(note['nextAction'],'native action')

    def test_image_and_attachment_changes_affect_digest_without_chrome_churn(self):
        value=self.value();before=self.read(value,self.document())
        changes=['<img src="/poster.png" alt="테스트 행사">','<a href="/poster.pdf">첨부 포스터</a>']
        for media in changes:
            after=self.read(value,self.document(media))
            self.assertNotEqual(recheck.source_digest(before),recheck.source_digest(after))
        chrome=self.read(value,self.document()+'<nav><img src="/random.png"><a href="/random.pdf">download</a></nav><script>random()</script>')
        self.assertEqual(recheck.source_digest(before),recheck.source_digest(chrome))
        first=self.read(value,self.document('<img src="/poster.png" alt="테스트 행사">'))
        different_context=self.read(value,self.document('<img src="/poster.png" alt="다른 행사">'))
        self.assertNotEqual(recheck.source_digest(first),recheck.source_digest(different_context))

    def test_special_extractors_keep_attachment_identity_and_ignore_download_status(self):
        page='https://sites.google.com/view/event'
        site=parse_site_document(self.document('<a href="https://official.example/poster.pdf">포스터 다운로드</a>'),page,'2026-10-06')
        product=dict(code='SUCCESS/',data=dict(prod_info=dict(prod_id=71267,title='2026 테스트 행사',contents=self.document('<a href="https://official.example/poster.pdf">포스터 다운로드</a>'))))
        tmm=parse_tmm_product(json.dumps(product).encode(),'https://takemm.com/prod/view/71267','2026-10-06')
        for doc in (site,tmm):
            self.assertEqual(doc['attachments'],[dict(url='https://official.example/poster.pdf',label='포스터 다운로드')])
        doc=dict(images=[dict(url=URL,role='POSTER',nearbyText='테스트 행사',analysisStatus='INACCESSIBLE')])
        first=recheck.source_document(PAGE,'same text',doc)
        doc['images'][0].update(analysisStatus='ATTACHED',sha256=SHA,imageFile='random.image')
        self.assertEqual(first,recheck.source_document(PAGE,'same text',doc))

    def test_existing_notice_new_poster_changes_root_digest_and_failed_notice_stays_retryable(self):
        value=self.value();root_html=self.document('<a href="/notice/one">행사 안내</a>')
        documents=[]
        for notice in ('<h1>테스트 행사 안내</h1>','<h1>테스트 행사 안내</h1><img src="/poster.png">'):
            def fetch(url,*args):return (root_html if url==PAGE else notice,'')
            with patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',side_effect=fetch):
                rows,failed,_=recheck.read_sources(value['event'],self.root/'sources',self.cfg)
            self.assertFalse(failed);self.assertEqual(len(rows),1);documents.append(rows)
        self.assertNotEqual(recheck.source_digest(documents[0]),recheck.source_digest(documents[1]))
        self.assertEqual(recheck.extraction_documents(documents[0]),recheck.extraction_documents(documents[1]))
        def failed_fetch(url,*args):
            if url==PAGE:return root_html,''
            raise TimeoutError()
        with patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',side_effect=failed_fetch):
            _,failed,_=recheck.read_sources(value['event'],self.root/'sources',self.cfg)
        self.assertEqual(failed,{'https://official.example/notice/one':'ACCESS_FAILED'})

    def test_known_site_notice_media_changes_the_registered_parent_version(self):
        value=self.value();page='https://sites.google.com/view/event'
        child=page+'/notice';value['event']['sources'][0]['url']=page
        versions=[]
        for media in ([],[dict(url=URL,role='PAGE_PREVIEW',nearbyText='테스트 행사')]):
            details=[dict(sourceUrl=page,status='READ',sourceType='GOOGLE_SITES',bodyText='테스트 행사 공식 안내 '*20,images=[],childUrls=[child]),
                     dict(sourceUrl=child,status='READ',sourceType='GOOGLE_SITES',bodyText='포스터 안내',images=media,childUrls=[])]
            with patch.object(recheck,'collect_detail_sources',return_value=(details,[])),patch.object(recheck,'fetch_html',side_effect=AssertionError('Known checked notice must be reused')):
                documents,failed,_=recheck.read_sources(value['event'],self.root/'sources',self.cfg)
            self.assertFalse(failed);versions.append(documents)
        self.assertNotEqual(recheck.source_digest(versions[0]),recheck.source_digest(versions[1]))

    def test_linked_source_walk_is_bounded_and_does_not_confirm_incomplete_version(self):
        value=self.value();calls=[]
        def fetch(url,*args):
            calls.append(url)
            next_id=1 if url==PAGE else int(url.rsplit('/',1)[1])+1
            return self.document(f'<a href="/notice/{next_id}">행사 안내</a>'),''
        with patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',side_effect=fetch):
            _,failed,_=recheck.read_sources(value['event'],self.root/'sources',self.cfg)
        self.assertEqual(len(calls),12)
        self.assertEqual(failed,{'https://official.example/notice/12':'EXTRACTION_FAILED'})

    def test_source_digest_reopens_terminal_only_on_actual_version_change(self):
        value=self.value();job=images.Repair(self.cfg,self.api(value),self.root/'repair')
        at=images.now()
        for state in ('VERIFIED','EXHAUSTED'):
            stamp,_=job.queue.due(value,job.policy,at);job.queue.record(value,stamp,state,{},at)
            self.assertFalse(job.queue.due(value,job.policy,at+timedelta(days=365))[1])
            changed={**value,'sourceDigest':'new-source-version'}
            self.assertTrue(job.queue.due(changed,job.policy,at)[1])

    def test_actual_recheck_reopens_exhausted_queue_without_force(self):
        value=self.value();before=self.read(value,self.document());value['sourceDigest']=recheck.source_digest(before)
        baseline_digest=value['sourceDigest']
        api=self.api(value);job=images.Repair(self.cfg,api,self.root/'repair',apply=True,drain=True)
        stamp,_=job.queue.due(value,job.policy,images.now())
        job.queue.record(value,stamp,'EXHAUSTED',dict(methods=[dict(method=m,state='NO_IMAGE_FOUND') for m in ('SOURCE_DETAILS','ORGANIZER_SEARCH','VENUE_SEARCH')]),images.now())
        after_html=self.document('<div class="poster"><img src="/poster.png" alt="테스트 행사"></div>')
        class RecheckApi:
            def request(inner,method,path,payload=None):
                if path.endswith('/recheck-workload'):return dict(due=1)
                if '/recheck-events?' in path:return [dict(copy.deepcopy(value),digest=value['sourceDigest'],status='SOURCE_UNPUBLISHED',checked_revision=value['revision'],failures=0)]
                if path.endswith('/observations'):
                    self.assertEqual(payload['values'],{})
                    api.rows[0]['sourceDigest']=payload['digest'];return dict(changedFields=[])
                raise AssertionError((method,path))
        result=dict(identity=dict(name=value['event']['name'],organizer=None,edition='2026'),fields={})
        with patch.object(recheck,'Api',return_value=RecheckApi()),patch('weekly.Api',return_value=RecheckApi()),patch.object(recheck,'load_config',return_value=copy.deepcopy(self.cfg)),patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',return_value=(after_html,'')),patch.object(recheck,'extract_documents',return_value=result) as extract,redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(recheck.main([]),0)
        summary=json.loads(stdout.getvalue());self.assertEqual(summary['unchanged'],0);self.assertEqual(summary['saved'],1)
        extract.assert_called_once();prompt=extract.call_args.args[2]
        self.assertNotIn('"media"',prompt);self.assertNotEqual(api.rows[0]['sourceDigest'],baseline_digest)
        reopened=images.Repair(self.cfg,api,self.root/'repair',apply=True,drain=True)
        with patch.object(images,'allowed_by_robots',return_value=True),patch.object(images,'fetch_html',return_value=(after_html,'')) as read,patch.object(images,'fetch_image',return_value=(RAW,'image/png',SHA)):
            report=reopened.run_batch()
        self.assertEqual(report['processed'],1);self.assertEqual(report['counts'],{'VERIFIED':1});self.assertGreater(read.call_count,0)


if __name__=='__main__':unittest.main()
