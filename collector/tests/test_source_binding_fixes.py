"""Source truth must survive quoting, structured dates and image-only pages."""
import copy
import json
from datetime import date
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from catalog_rules import parse_schema
from discovery_validation import verify_facts
from event_identity import date_ranges, source_date_ranges
from schedule_inventory import Page
from run import RunError
import recheck
import weekly
from image_repair import RepairQueue, now
import test_event_identity


class NativeDateBindingFixTests(unittest.TestCase):
    def setUp(self):
        fixture=test_event_identity.NativeEventFactTests();fixture.setUp()
        self.event,self.proof,self.docs=fixture.event,fixture.proof,fixture.docs
        self.result=fixture.result
        self.url=fixture.url

    def verify(self):return verify_facts([self.event],[self.proof],self.docs,[])

    def pipeline(self, expected_state, should_deliver):
        parse_schema(json.dumps(self.result).encode('utf-8'),'event-result-v4.schema.json')
        with tempfile.TemporaryDirectory() as folder:
            cfg=weekly.load_config(None);cfg.update(stateDirectory=folder,maxXRecentPages=0)
            scope=dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-12-31')
            job=weekly.Pipeline(cfg,Path(folder)/'run',scope,dry_run=True)
            item=job.event_queue.enqueue_discovered([self.event],scope)[0]
            def read(urls,docs,blocked):docs.update(self.docs);return docs
            with patch.object(weekly,'read_fact_documents',side_effect=read),patch.object(job,'job',return_value=(self.result,True)),patch.object(job,'deliver',return_value=dict(status='DRY_RUN',rejected=0)) as delivery:
                job.research_event_name(item)
            self.assertEqual(item['state'],expected_state)
            self.assertEqual(delivery.called,should_deliver)

    def test_schema_valid_cropped_booking_period_is_not_event_date(self):
        self.event['occurrences'][0].update(startDate='2026-10-01',endDate='2026-10-02')
        self.proof['occurrenceEvidence'][0]['dateQuote']='2026.10.1 ~ 2026.10.2'
        self.docs[self.url]['bodyText']='\n'.join([self.event['name'],
            '예약 기간: 2026.10.1 ~ 2026.10.2','행사 개최일: 2026.11.10 ~ 2026.11.11',
            '커피 산업 박람회','행사장 서울전시장',self.event['address']])
        accepted,rejected=self.verify()
        self.assertFalse(accepted)
        self.assertIn('EVENT_DATES_NOT_SUPPORTED_BY_QUOTE:0',rejected[0]['reasons'])
        self.pipeline('PARTIAL',False)
        self.event['occurrences'][0].update(startDate='2026-11-10',endDate='2026-11-11')
        self.proof['occurrenceEvidence'][0]['dateQuote']='2026.11.10 ~ 2026.11.11'
        self.assertFalse(self.verify()[1])
        self.pipeline('FOUND',True)

    def test_original_range_cannot_be_cropped_to_one_day(self):
        self.assertFalse(source_date_ranges('2026.11.10','행사 개최일 2026.11.10 ~ 2026.11.13'))
        self.assertFalse(source_date_ranges('2026.11.10 ~ 2026.11.13',
            '예약 기간 2026.11.10 ~ 2026.11.13\n행사 개최일 2026.12.10 ~ 2026.12.13'))

    def test_native_booking_label_survives_long_explanation_before_date(self):
        quote='2026.10.1 ~ 2026.10.2'
        original='예약 기간: '+('접속한 뒤 자세한 화면을 확인해 주세요 '*40)+quote+'\n행사 개최일 2026.11.10 ~ 2026.11.13'
        self.assertFalse(source_date_ranges(quote,original))

    def test_booking_explanation_mentioning_event_does_not_reset_field(self):
        self.assertFalse(source_date_ranges('2026.10.1 ~ 2026.10.2',
            '예약 기간: 이 행사를 방문하려면 예약하세요. 2026.10.1 ~ 2026.10.2\n행사일 2026.11.10 ~ 2026.11.13'))

    def test_iso_datetime_jsonld_keeps_full_range_and_timezone_dates(self):
        data={'@type':'Event','name':self.event['name'],
            'startDate':'2026-11-10T10:00:00+09:00','endDate':'2026-11-13T19:00:00+09:00',
            'location':{'@type':'Place','name':'서울전시장','address':{'addressRegion':'서울특별시','addressLocality':'강남구','streetAddress':'영동대로 513'}}}
        html='<p>커피 산업 박람회</p><p>행사장 서울전시장</p><script type="application/ld+json">'+json.dumps(data)+'</script>'
        self.docs[self.url]['bodyText']=Page(html).text
        self.event['occurrences'][0]['endDate']='2026-11-13'
        self.proof['occurrenceEvidence'][0]['dateQuote']='행사 개최일 2026-11-10T10:00:00+09:00 ~ 2026-11-13T19:00:00+09:00'
        self.assertFalse(self.verify()[1])
        self.pipeline('FOUND',True)
        self.assertIn((date(2027,1,1),date(2027,1,2)),date_ranges('2026-12-31T23:00Z ~ 2027-01-02T02:00+09:00'))
        self.assertNotIn((date(2026,11,10),date(2026,11,13)),date_ranges('2026-11-10T26:00:00+09:00 ~ 2026-11-13T19:00:00+09:00'))


class RecheckValueBindingFixTests(unittest.TestCase):
    def setUp(self):
        self.url='https://example.com/event/2026'
        self.target=dict(id=1,revision=2,event=dict(name='2026 테스트 행사',organizer='주최',edition='2026'))
        self.text='2026 테스트 행사\n예약 기간 2026.10.1 ~ 2026.10.2\n행사 개최일 2026.11.10 ~ 2026.11.13\n행사장 코엑스\n서울특별시 강남구 영동대로 513\n입장료 10,000원\n행사 취소 공지'
        self.docs=[dict(url=self.url,text=self.text)]
        self.result=dict(searchStatus='COMPLETE',identity={k:self.target['event'][k] for k in ('name','organizer','edition')},fields={})

    def propose(self,key,value,evidence):
        self.result['fields']={key:dict(state='CONFIRMED',sourceUrl=self.url,evidence=evidence,value=value)}
        parse_schema(json.dumps(self.result).encode('utf-8'),'event-recheck.schema.json')
        return recheck.observation(self.target,self.result,self.docs)

    def test_wrong_value_with_exact_original_quote_is_rejected(self):
        quote='행사 개최일 2026.11.10 ~ 2026.11.13'
        wrong=[dict(startDate='2026-12-10',endDate='2026-12-13',startTime=None,endTime=None)]
        with self.assertRaises(RunError):self.propose('occurrences',wrong,quote)
        correct=copy.deepcopy(wrong);correct[0].update(startDate='2026-11-10',endDate='2026-11-13')
        self.assertEqual(self.propose('occurrences',correct,quote)['values']['occurrences'],correct)
        with self.assertRaises(RunError):self.propose('occurrences',correct,'행사 개최일')

    def test_booking_period_cannot_be_confirmed_even_when_quote_is_cropped(self):
        value=[dict(startDate='2026-10-01',endDate='2026-10-02',startTime=None,endTime=None)]
        with self.assertRaises(RunError):self.propose('occurrences',value,'2026.10.1 ~ 2026.10.2')

    def test_changed_text_fields_require_the_actual_new_value(self):
        for key,value,quote in [('venueName','킨텍스','행사장 코엑스'),
            ('address','경기도 고양시 일산서구 킨텍스로 217-60','서울특별시 강남구 영동대로 513'),
            ('admission','20,000원','입장료 10,000원'),('districts',['노원구'],'서울특별시 강남구 영동대로 513')]:
            with self.subTest(key=key),self.assertRaises(RunError):self.propose(key,value,quote)
        self.assertEqual(self.propose('venueName','COEX','행사장 코엑스')['values']['venueName'],'COEX')
        self.assertEqual(self.propose('admission','10,000원','입장료 10,000원')['values']['admission'],'10,000원')

    def test_operation_state_must_agree_with_the_source(self):
        status=dict(state='POSTPONED',note=None,sourceUrl=self.url,checkedOn='2026-10-06')
        with self.assertRaises(RunError):self.propose('operationStatus',status,'행사 취소 공지')
        status['state']='CANCELED'
        self.assertEqual(self.propose('operationStatus',status,'행사 취소 공지')['values']['operationStatus']['state'],'CANCELED')

    def test_source_time_is_required_and_timezone_offset_is_not_opening_time(self):
        quote='행사 개최일 2026-11-10T10:00:00+09:00 ~ 2026-11-13T19:00:00+09:00'
        self.docs[0]['text']=quote
        value=[dict(startDate='2026-11-10',endDate='2026-11-13',startTime='09:00',endTime='19:00')]
        with self.assertRaises(RunError):self.propose('occurrences',value,quote)
        value[0]['startTime']='10:00'
        self.assertEqual(self.propose('occurrences',value,quote)['values']['occurrences'],value)

    def test_structured_guide_answer_cannot_disagree_with_quoted_original(self):
        quote='재입장 가능한가요? 재입장은 가능합니다.'
        self.docs[0]['text']=quote
        value=dict(tickets=[],programs=[],sales=[],coverage=[],faq=[dict(id='faq1',question='재입장 가능한가요?',answer='재입장은 불가능합니다.',status='CONFIRMED',sourceUrl=self.url,checkedOn='2026-10-06')])
        with self.assertRaises(RunError):self.propose('visitorGuide',value,quote)
        value['faq'][0]['answer']='재입장은 가능합니다.'
        self.assertEqual(self.propose('visitorGuide',value,quote)['values']['visitorGuide'],value)

    def test_utc_timestamp_uses_seoul_day_and_clock_without_inventing_dates(self):
        quote='행사 개최일 2026-11-10T23:00:00Z ~ 2026-11-13T10:00:00Z'
        self.docs[0]['text']=quote
        value=[dict(startDate='2026-11-11',endDate='2026-11-13',startTime='08:00',endTime='19:00')]
        self.assertEqual(self.propose('occurrences',value,quote)['values']['occurrences'],value)
        value[0]['startDate']='2026-11-10'
        with self.assertRaises(RunError):self.propose('occurrences',value,quote)


class ShortSourceFingerprintFixTests(unittest.TestCase):
    def test_short_original_retains_new_media_and_reopens_completed_queue(self):
        url='https://official.example/event/2026'
        target=dict(id=1,revision=2,event=dict(name='2026 테스트 행사',sources=[dict(kind='OFFICIAL',access='ORIGINAL',url=url)]))
        cfg=dict(blockedSourceHosts=[],httpTimeoutSeconds=10)
        before='<h1>2026 테스트 행사</h1>'
        after=before+'<div class="poster"><img src="/poster.png" alt="2026 테스트 행사 포스터"></div>'
        versions=[]
        with tempfile.TemporaryDirectory() as folder:
            for content in (before,after):
                with patch.object(recheck,'collect_detail_sources',return_value=([],[])),patch.object(recheck,'allowed_by_robots',return_value=True),patch.object(recheck,'fetch_html',return_value=(content,'')):
                    rows,failed,_=recheck.read_sources(target['event'],Path(folder)/'sources',cfg)
                self.assertEqual(failed,{url:'EXTRACTION_FAILED'})
                self.assertEqual(len(rows),1)
                self.assertFalse(rows[0]['extractionEligible'])
                self.assertEqual(recheck.extraction_documents(rows),[])
                versions.append(rows)
            self.assertNotEqual(recheck.source_digest(versions[0]),recheck.source_digest(versions[1]))
            queue=RepairQueue(Path(folder)/'queue.json');at=now()
            target['sourceDigest']=recheck.source_digest(versions[0]);stamp,_=queue.due(target,'test-policy',at)
            queue.record(target,stamp,'EXHAUSTED',dict(methods=[dict(state='NO_IMAGE_FOUND')]),at)
            self.assertFalse(queue.due(target,'test-policy',at)[1])
            target['sourceDigest']=recheck.source_digest(versions[1])
            self.assertTrue(queue.due(target,'test-policy',at)[1])


if __name__=='__main__':unittest.main()
