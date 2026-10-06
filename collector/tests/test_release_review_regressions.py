import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from weekly import Pipeline, load_config
from data_quality import select_targets, attempt_record
from image_repair import Repair, poster_evidence
from official_poster_sources import parse_official_document
from schedule_inventory import ScheduleInventory,scoped_url
from regional_discovery import SCHEDULES
from popup_catalog_sources import event_record
from test_image_repair import FakeApi, target, PAGE


class ReleaseReviewRegressions(unittest.TestCase):
    def test_actual_partial_information_receipts_remain_due_and_old_exhaustion_reopens(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,autoApproveCollectedData=False)
            job=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-12-31'),dry_run=True)
            job.api=object()
            result=json.loads((Path(__file__).parents[1]/'examples/v5/events.json').read_text(encoding='utf-8'))
            result.update(searchStatus='PARTIAL',summary='Official source research not complete')
            rows=[dict(id=1,revision=1,event=copy.deepcopy(result['events'][0]),repairSourceFailure=True)]
            with patch.object(job,'job',side_effect=lambda *a,**kw:(copy.deepcopy(result),True)),patch('weekly.collect_detail_sources',return_value=([],[])),patch.object(job,'deliver',return_value=dict(status='PARTIAL')) as deliver,patch.object(job,'request') as request:
                job.enrich_events(rows)
                self.assertEqual(deliver.call_count,3);request.assert_not_called()
            record=job.enrichment_attempts['1']
            self.assertEqual(record['resolution'],'DEFERRED');self.assertNotIn('completedAt',record)
            self.assertEqual(len(select_targets(rows,{'1':record},100,[])),1)
            record.update(resolution='EXHAUSTED',completedAt='2026-10-06T00:00:00Z')
            self.assertEqual(len(select_targets(rows,{'1':record},100,[])),1)

    def test_body_only_wrong_edition_blocks_upload_but_prior_booking_and_footer_do_not(self):
        event={**target()['event'],'edition':'2026','occurrences':[dict(startDate='2026-10-10',endDate='2026-10-11')]}
        page='<main><h1>테스트 행사</h1><p>행사 개최일: 2025.10.10 ~ 2025.10.11. 2025 행사 공식 포스터입니다.</p><div class="poster"><img src="/poster.png" alt="테스트 행사 포스터"></div></main>'
        doc=parse_official_document(page,PAGE,'2026-10-06',event['name'])
        self.assertFalse(poster_evidence(doc['images'][0],doc,event['name'],[doc['images'][0]['url']],event))
        valid=page.replace('2025','2026').replace('<main>','<main><p>예매 기간: 2025.12.01 ~ 2025.12.31</p>')+'<footer>2025.01.01 copyright</footer>'
        current=parse_official_document(valid,PAGE,'2026-10-06',event['name'])
        self.assertTrue(poster_evidence(current['images'][0],current,event['name'],[],event))
        self.assertIn('행사 개최일',current['images'][0]['eventContext'])

    def test_current_poster_is_not_rejected_by_prior_publication_or_past_event_dates(self):
        event={**target()['event'],'edition':'2026','occurrences':[dict(startDate='2026-10-10',endDate='2026-10-11')]}
        for extra in ('게시일: 2025.12.01','수정일: 2025.12.01','지난 행사 개최일: 2025.10.10 ~ 2025.10.11'):
            with self.subTest(extra=extra):
                page='<main><h1>2026 테스트 행사</h1><p>'+extra+'</p><p>행사 개최일: 2026.10.10 ~ 2026.10.11</p><div class="poster"><img src="/poster.png" alt="2026 테스트 행사 포스터"></div></main>'
                doc=parse_official_document(page,PAGE,'2026-10-06',event['name'])
                self.assertTrue(poster_evidence(doc['images'][0],doc,event['name'],[],event))

    def test_date_fields_keep_boundaries_so_publication_cannot_hide_wrong_edition(self):
        event={**target()['event'],'edition':'2026','occurrences':[dict(startDate='2026-10-10',endDate='2026-10-11')]}
        fields=(
            '<table><tr><th>게시일</th><td>2026.10.01</td></tr><tr><th>행사 개최일</th><td>2025.10.10 ~ 2025.10.11</td></tr></table>',
            '<dl><dt>게시일</dt><dd>2026.10.01</dd><dt>행사 개최일</dt><dd>2025.10.10 ~ 2025.10.11</dd></dl>',
            '<p>게시일 2026.10.01 행사 개최일 2025.10.10 ~ 2025.10.11</p>',
        )
        for field in fields:
            with self.subTest(field=field):
                page='<main><h1>테스트 행사</h1>'+field+'<div class="poster"><img src="/poster.png" alt="테스트 행사 포스터"></div></main>'
                doc=parse_official_document(page,PAGE,'2026-10-06',event['name'])
                self.assertFalse(poster_evidence(doc['images'][0],doc,event['name'],[doc['images'][0]['url']],event))
                # Publication from the prior year must also not veto a current event.
                page=page.replace('게시일 2026.10.01','게시일 2024.10.01').replace('<td>2026.10.01','<td>2024.10.01').replace('<dd>2026.10.01','<dd>2024.10.01').replace('2025.10','2026.10')
                current=parse_official_document(page,PAGE,'2026-10-06',event['name'])
                self.assertTrue(poster_evidence(current['images'][0],current,event['name'],[current['images'][0]['url']],event))

    def test_information_timeouts_remain_retryable_and_legacy_bad_completion_reopens(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,autoApproveCollectedData=False)
            job=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            job.api=object();rows=[dict(id=1,revision=1,event=target()['event'])]
            with patch.object(job,'enrich_event',side_effect=TimeoutError('temporary')) as read:
                job.enrich_events(rows);self.assertEqual(read.call_count,3)
            record=job.enrichment_attempts['1'];self.assertEqual(record['resolution'],'DEFERRED');self.assertNotIn('completedAt',record)
            record['resolution']='EXHAUSTED';self.assertEqual(len(select_targets(rows,{'1':record},100,[])),1)

    def test_image_timeout_is_retryable_and_does_not_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=dict(blockedSourceHosts=[],imageAllowedHosts=[],stateDirectory=folder)
            job=Repair(cfg,FakeApi([target()]),Path(folder),drain=True)
            failures=[('FETCH_FAILED',{}),('RESEARCH_FAILED',{}),('RESEARCH_FAILED',{})]
            with patch.object(job,'discover_attempt',side_effect=failures):job.run_batch()
            record=job.queue.rows['1'];self.assertEqual(record['state'],'RESEARCH_FAILED');self.assertIsNotNone(record['nextAttemptAt']);self.assertNotIn('completedAt',record)
            record.update(state='EXHAUSTED',nextAttemptAt=None)
            self.assertTrue(job.queue.due(target(),job.policy,__import__('datetime').datetime.now(__import__('datetime').timezone.utc))[1])

    def test_explicit_wrong_edition_is_rejected_even_with_hint_or_section(self):
        image='<h1>2025 테스트 행사</h1><div class="poster"><img src="/poster.png" alt="2025 테스트 행사"></div><p>2025.10.10 행사 포스터</p>'
        doc=parse_official_document(image,PAGE,'2026-10-06','2026 테스트 행사');poster=doc['images'][0]
        event={**target()['event'],'edition':'2026','occurrences':[dict(startDate='2026-10-10',endDate='2026-10-10')]}
        self.assertFalse(poster_evidence(poster,doc,event['name'],[poster['url']],event))
        self.assertFalse(poster_evidence(poster,{**doc,'sourceScope':'EVENT_SECTION'},event['name'],[],event))
        no_alt=parse_official_document(image.replace('alt="2025 테스트 행사"','alt="행사 포스터"'),PAGE,'2026-10-06',event['name'])
        self.assertFalse(poster_evidence(no_alt['images'][0],no_alt,event['name'],[no_alt['images'][0]['url']],event))
        valid=parse_official_document(image.replace('2025','2026'),PAGE,'2026-10-06',event['name'])
        self.assertTrue(poster_evidence(valid['images'][0],valid,event['name'],[],event))

    def test_next_day_continues_same_listing_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'schedule.json';spec=dict(url='https://example.com/list',detailPattern=r'/event/\d+',listPattern=r'/list\?page=\d+')
            pages={spec['url']:'<a href="/event/1">one</a><a href="/list?page=2">next</a>','https://example.com/list?page=2':'<a href="/event/2">two</a>','https://example.com/event/1':'<h1>one</h1>venue','https://example.com/event/2':'<h1>two</h1>venue'}
            scope=dict(startDate='2026-10-06',endDate='2026-12-05')
            job=ScheduleInventory(path,fetch=lambda u:pages[u])
            def first(url):job.deadline=0;return pages[url]
            job.fetch=first;self.assertEqual(job.scan(spec,scope)['state'],'PARTIAL')
            resumed=ScheduleInventory(path,fetch=lambda u:pages[u]);row=resumed.scan(spec,dict(startDate='2026-10-07',endDate='2026-12-06'))
            self.assertEqual(row['state'],'COMPLETE');self.assertEqual(len(row['documents']),2);self.assertEqual(len(resumed.value['sources']),1)

    def test_lotte_separates_outside_window_from_non_popup(self):
        from lotte_popup_sources import DETAIL_BASE,parse_detail
        from datetime import date
        branch=dict(company='LOTTE',code='0002',name='잠실점',officialName='백화점 잠실점',venue='롯데월드몰',region='SEOUL',address='서울특별시 송파구 올림픽로 300')
        item=dict(id='SNM00000000000562455',title='테스트 안내',location='백화점 잠실점',url=DETAIL_BASE+'SNM00000000000562455')
        html='<meta property="og:url" content="'+item['url']+'"><h3 class="__detail-title">테스트 안내</h3><span class="__location">백화점 잠실점</span><span class="__place">1층 행사장</span><p class="__date">12.10(목) ~ 12.12(토)</p><p class="__txt-desc">굿즈 팝업스토어</p><script>lddi.ShareLink.appData.cntsStDtm = \'20261210000000\';lddi.ShareLink.appData.cntsEndDtm = \'20261212000000\';</script>'
        future=parse_detail(html,item,date(2026,10,15),date(2026,12,14),branch,include_outside=True)
        with patch('popup_catalog_sources.parse_detail',wraps=parse_detail) as parse:
            self.assertEqual(event_record(branch,item,dict(startDate='2026-10-06',endDate='2026-12-05'),lambda *a:html),(None,'OUTSIDE_WINDOW'))
            self.assertEqual(event_record(branch,item,dict(startDate='2026-10-15',endDate='2026-12-14'),lambda *a:html),(future,None))
            self.assertTrue(parse.call_args.kwargs['include_outside'])
        self.assertEqual(event_record(branch,item,dict(startDate='2026-10-06',endDate='2026-12-05'),lambda *a:html.replace('굿즈 팝업스토어','신상품 안내')),(None,'NON_POPUP'))

    def test_partial_coex_keeps_original_scope_and_completed_scope_can_advance(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.json';spec=SCHEDULES['EXHIBITION'][0];scope=dict(startDate='2026-10-06',endDate='2026-12-05');calls=[]
            def fetch(url):
                calls.append(url)
                if '/exhibitions/' in url:return '<h1>event detail</h1>venue'
                if 'var_page=2' in url:return '<a href="/exhibitions/two/">two</a>'
                return '<a href="/event/full-schedules/?var_page=2">next</a><a href="/exhibitions/one/">one</a>'
            first=ScheduleInventory(path,fetch=fetch)
            def budget(url):html=fetch(url);first.deadline=0;return html
            first.fetch=budget;first.scan(spec,scope)
            legacy=next(iter(first.value['sources'].values()));legacy.pop('listingScope');legacy.pop('seed')
            first.value['sources']={'legacy-checkpoint':legacy};first.save()
            tomorrow=dict(startDate='2026-10-07',endDate='2026-12-06');calls=[]
            resumed=ScheduleInventory(path,fetch=fetch);row=resumed.scan(spec,tomorrow)
            self.assertEqual(row['state'],'COMPLETE');self.assertEqual(len(row['documents']),2);self.assertEqual(len(resumed.value['sources']),1)
            self.assertTrue(all('search_start_date=2026.10.06' in u for u in calls if '/full-schedules' in u))
            calls=[];ScheduleInventory(path,fetch=fetch).scan(spec,tomorrow)
            self.assertIn(scoped_url(spec['url'],spec,tomorrow),calls)

if __name__=='__main__':unittest.main()
