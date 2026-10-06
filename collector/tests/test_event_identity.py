"""Source-bound regressions: valid model output must still match the read event."""
import copy
from datetime import date
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import weekly
from catalog_rules import parse_schema
from discovery_validation import verify_facts
from event_identity import date_ranges, name_matches
from schedule_inventory import Page

ROOT = Path(__file__).resolve().parents[1]


class EventDateTests(unittest.TestCase):
    def interval(self, text, start, end, heading=''):
        self.assertIn((date.fromisoformat(start),date.fromisoformat(end)),date_ranges(text,heading))

    def test_korean_iso_and_short_range_formats(self):
        for text in ('행사일정 2026년 11월 10일(화) ~ 11일(수)',
                     '개최일 2026.11.10 ~ 11.11', '2026-11-10 ~ 2026-11-11',
                     '2026.11.10〜11.11', '2026.11.10 (Tue) ~ 11.11 (Wed)'):
            with self.subTest(text=text): self.interval(text,'2026-11-10','2026-11-11')

    def test_year_must_be_in_native_heading_or_date_quote(self):
        self.assertFalse(date_ranges('11.10 ~ 11.11'))
        self.interval('11.10 ~ 11.11','2026-11-10','2026-11-11','2026 테스트 행사')
        self.assertFalse(date_ranges('11.10 ~ 11.11','2025·2026 두 회차'))

    def test_cross_year_and_nonconsecutive_days(self):
        self.interval('개최일 2026.12.30 ~ 2027.1.2','2026-12-30','2027-01-02')
        self.interval('개최일 2026.12.30 ~ 1.2','2026-12-30','2027-01-02')
        values=date_ranges('2026.11.10, 2026.11.11, 2026.11.13')
        self.assertIn((date(2026,11,10),date(2026,11,11)),values)
        self.assertNotIn((date(2026,11,10),date(2026,11,13)),values)

    def test_booking_and_publication_dates_are_not_event_dates(self):
        for label in ('예약 기간','예매 마감','모집 기간','게시일','작성일'):
            self.assertFalse(date_ranges(label+' 2026.11.10 ~ 2026.11.11'))
        values=date_ranges('예약 2026.10.1 ~ 10.2\n행사 개최일 2026.11.10 ~ 11.11')
        self.assertEqual(values,{(date(2026,11,10),date(2026,11,11))})

    def test_english_dates_and_explicit_year(self):
        self.interval('Event dates: November 10–11, 2026','2026-11-10','2026-11-11')
        self.interval('10 November 2026 to 11 November 2026','2026-11-10','2026-11-11')

    def test_name_normalization_preserves_different_event_identity(self):
        self.assertTrue(name_matches('2026 제22회 테스트 커피 박람회','행사명: 테스트 커피 박람회 2026'))
        self.assertTrue(name_matches('Comic World 2026','ＣＯＭＩＣ－ＷＯＲＬＤ'))
        self.assertFalse(name_matches('2026 테스트 행사','2026 연말 채용 설명회'))
        self.assertTrue(name_matches('2026 AGF','AGF2026 공식 안내'))
        self.assertFalse(name_matches('2026 AGF','MAGFest 2026 공식 안내'))


class NativeEventFactTests(unittest.TestCase):
    def setUp(self):
        self.result=json.loads((ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))
        self.event=self.result['events'][0]
        self.event.update(name='2026 테스트 커피 박람회',edition='2026',subcategory='BUSINESS',venueName='서울전시장',address='서울특별시 강남구 영동대로 513')
        self.event['occurrences']=[dict(startDate='2026-11-10',endDate='2026-11-11',startTime=None,endTime=None)]
        self.url=self.event['sources'][0]['url']
        self.proof=dict(eventIndex=0,sourceUrl=self.url,addressSourceUrl=self.url,subcategory='BUSINESS',
                        nameQuote=self.event['name'],occurrenceEvidence=[dict(occurrenceIndex=0,dateQuote='행사 개최일 2026.11.10 ~ 2026.11.11')],
                        typeQuote='커피 산업 박람회',venueQuote='행사장 서울전시장',addressQuote=self.event['address'])
        self.result['eventEvidence']=[self.proof]
        self.docs={self.url:dict(status='READ',bodyText=self.proof['nameQuote']+'\n'+self.proof['occurrenceEvidence'][0]['dateQuote']+'\n커피 산업 박람회\n행사장 서울전시장\n'+self.event['address'])}

    def check(self): return verify_facts([self.event],[self.proof],self.docs,[])

    def test_current_source_passes_and_fake_quote_does_not(self):
        self.assertFalse(self.check()[1])
        self.proof['nameQuote']='2026 테스트 커피 박람회 상상한 추가 문장'
        self.assertIn('QUOTE_NOT_IN_READ_SOURCE:nameQuote',self.check()[1][0]['reasons'])

    def test_source_native_tmm_title_is_valid_name_evidence(self):
        doc=self.docs[self.url]
        doc['title']=self.event['name'];doc['bodyText']=doc['bodyText'].replace(self.event['name']+'\n','')
        self.assertFalse(self.check()[1])

    def test_structured_event_identity_and_dates_are_retained_by_native_reader(self):
        data={'@type':'Event','name':self.event['name'],'startDate':'2026-11-10','endDate':'2026-11-11',
              'location':{'@type':'Place','name':'서울전시장','address':{'addressRegion':'서울특별시','addressLocality':'강남구','streetAddress':'영동대로 513'}}}
        html='<p>커피 산업 박람회</p><p>행사장 서울전시장</p><script type="application/ld+json">'+json.dumps(data)+'</script>'
        self.proof['occurrenceEvidence'][0]['dateQuote']='행사 개최일 2026-11-10 ~ 2026-11-11'
        self.docs[self.url]['bodyText']=Page(html).text
        self.assertFalse(self.check()[1])

    def test_previous_edition_and_other_event_are_not_delivered(self):
        for name,quote in [('2025 테스트 커피 박람회','행사 개최일 2025.11.10 ~ 2025.11.11'),
                           ('2026 완전히 다른 커피 박람회','행사 개최일 2026.11.10 ~ 2026.11.11')]:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as folder:
                result=copy.deepcopy(self.result);proof=result['eventEvidence'][0]
                proof['nameQuote']=name;proof['occurrenceEvidence'][0]['dateQuote']=quote
                parse_schema(json.dumps(result).encode('utf-8'),'event-result-v4.schema.json')
                docs={self.url:dict(status='READ',bodyText=name+'\n'+quote+'\n커피 산업 박람회\n행사장 서울전시장\n'+self.event['address'])}
                cfg=weekly.load_config(None);cfg.update(stateDirectory=folder,maxXRecentPages=0)
                scope=dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate='2026-11-01',endDate='2026-12-31')
                pipeline=weekly.Pipeline(cfg,Path(folder)/'run',scope,dry_run=True)
                item=pipeline.event_queue.enqueue_discovered([self.event],scope)[0]
                def read(urls,documents,blocked): documents.update(docs);return documents
                with patch.object(weekly,'read_fact_documents',side_effect=read),patch.object(pipeline,'job',return_value=(result,True)),patch.object(pipeline,'deliver') as delivery,redirect_stdout(io.StringIO()):
                    self.assertIsNone(pipeline.research_event_name(item))
                delivery.assert_not_called();self.assertEqual(item['state'],'PARTIAL')

    def test_same_year_different_numbered_edition_is_rejected(self):
        self.event['name']='2026 제22회 테스트 커피 박람회'
        self.proof['nameQuote']='2026 제21회 테스트 커피 박람회'
        self.docs[self.url]['bodyText']=self.docs[self.url]['bodyText'].replace('2026 테스트 커피 박람회',self.proof['nameQuote'])
        self.assertIn('EVENT_EDITION_DISAGREES_WITH_SOURCE',self.check()[1][0]['reasons'])
        self.proof['nameQuote']='2026 21회 테스트 커피 박람회'
        self.docs[self.url]['bodyText']=self.docs[self.url]['bodyText'].replace('제21회','21회')
        self.assertIn('EVENT_EDITION_DISAGREES_WITH_SOURCE',self.check()[1][0]['reasons'])

    def test_each_occurrence_needs_unambiguous_native_date_evidence(self):
        self.event['occurrences'].append(dict(startDate='2026-11-13',endDate='2026-11-13',startTime=None,endTime=None))
        self.assertIn('MISSING_OR_AMBIGUOUS_OCCURRENCE_EVIDENCE',self.check()[1][0]['reasons'])
        self.proof['occurrenceEvidence'].append(copy.deepcopy(self.proof['occurrenceEvidence'][0]))
        self.assertIn('MISSING_OR_AMBIGUOUS_OCCURRENCE_EVIDENCE',self.check()[1][0]['reasons'])

    def test_range_cannot_crop_dates_or_bridge_closed_days(self):
        self.event['occurrences'][0]['endDate']='2026-11-10'
        self.assertIn('EVENT_DATES_NOT_SUPPORTED_BY_QUOTE:0',self.check()[1][0]['reasons'])

    def test_invalid_date_stays_rejected_instead_of_aborting_batch(self):
        self.event['occurrences'][0]['startDate']='2026-11-99'
        self.assertIn('INVALID_EVENT_OCCURRENCE',self.check()[1][0]['reasons'])


if __name__=='__main__': unittest.main()
