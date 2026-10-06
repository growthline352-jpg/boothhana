import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import weekly
from discovery_validation import rejected_leads, verify_facts
from regional_discovery import typed_jobs, TYPE_TERMS

ROOT = Path(__file__).resolve().parents[1]
SCOPE = dict(region='SEOUL_GYEONGGI', timezone='Asia/Seoul', startDate='2026-11-01', endDate='2026-12-31')


class DiscoveryRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        cfg = weekly.load_config(None); cfg.update(stateDirectory=self.temp.name, maxXRecentPages=0)
        self.run = weekly.Pipeline(cfg, Path(self.temp.name)/'run', SCOPE, dry_run=True)
        self.result = json.loads((ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))
        self.event = self.result['events'][0]
        self.event.update(venueName='서울전시장', address='서울특별시 강남구 영동대로 513', subcategory='BUSINESS')
        self.event['occurrences'] = [dict(startDate='2026-11-10', endDate='2026-11-11', startTime=None, endTime=None)]
        self.url = self.event['sources'][0]['url']
        self.proof = dict(eventIndex=0, sourceUrl=self.url, addressSourceUrl=self.url, subcategory='BUSINESS',
                          typeQuote='커피 산업 박람회', venueQuote='행사장 서울전시장', addressQuote=self.event['address'],
                          nameQuote=self.event['name'],occurrenceEvidence=[dict(occurrenceIndex=0,dateQuote='행사 개최일 2026.11.10 ~ 2026.11.11')])
        self.identity_text=self.event['name']+'\n'+self.proof['occurrenceEvidence'][0]['dateQuote']+'\n'
        self.docs = {self.url:dict(status='READ',bodyText=self.identity_text+'커피 산업 박람회\n행사장 서울전시장\n'+self.event['address'])}

    def verify(self):
        return verify_facts([self.event], [self.proof], self.docs, [])

    def test_rejection_becomes_durable_individual_research_with_reason(self):
        self.event['operationStatus'] = dict(state='ACTIVE',note=None,sourceUrl=self.url,checkedOn='2026-11-01')
        item = self.run.discovery_work_queue.due('REGIONAL_SOURCE',1)[0]
        with patch.object(self.run,'job',return_value=(self.result,True)), redirect_stdout(io.StringIO()):
            self.run.discovery_work_item(item)
        rows = list(self.run.event_queue.candidates.values())
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['state'],'PENDING')
        self.assertTrue(rows[0]['discoveryLead']['verificationRequired'])
        self.assertTrue(rows[0]['discoveryLead']['validationIssues'])
        self.assertIn('REJECTED_DISCOVERY',rows[0]['origins'])
        self.assertFalse(list((self.run.folder/'jobs').glob('*/payload.json')))

    def test_unsafe_source_is_not_saved_but_valid_sibling_survives(self):
        invalid = copy.deepcopy(self.event);invalid['name']='unsafe';invalid['sources']=[dict(url='http://127.0.0.1/a')]
        rows, dropped = rejected_leads(dict(events=[invalid,self.event]),[],[],[])
        self.assertEqual([r['name'] for r in rows],[self.event['name']])
        self.assertEqual(dropped[0]['reason'],'NO_SAFE_RESEARCH_SOURCE')

    def test_distinct_editions_with_same_name_are_retained(self):
        second=copy.deepcopy(self.event);second['edition']='another'
        rows,_=rejected_leads(dict(events=[self.event,second]),[],[dict(index=1,name=second['name'],reasons=['bad'])],[])
        self.assertEqual(len(self.run.event_queue.enqueue_discovered(rows,SCOPE)),2)
        self.assertEqual(rows[0]['validationIssues'],[]);self.assertEqual(rows[1]['validationIssues'],['bad'])

    def test_each_format_has_independent_queries_and_persistent_job(self):
        jobs=typed_jobs(SCOPE)
        self.assertEqual(len(jobs),30)
        self.assertEqual({j['payload']['searchType'] for j in jobs},set(TYPE_TERMS))
        birthday=next(j for j in jobs if j['payload']['searchType']=='BIRTHDAY_CAFE')
        self.assertTrue(any('site:takemm.com' in q for q in birthday['payload']['queryTemplates']))
        self.assertFalse(any('온리전' in q for q in birthday['payload']['queryTemplates']))
        self.assertTrue(all(j['payload']['requireFactEvidence'] for j in jobs))

    def test_region_and_district_follow_actual_venue_not_search_region(self):
        self.event['region']='GYEONGGI';self.event['districts']=['노원구']
        accepted,rejected=self.verify()
        self.assertFalse(rejected);self.assertEqual(len(accepted),1)
        self.assertEqual(self.event['region'],'SEOUL');self.assertEqual(self.event['districts'],['강남구'])

    def test_wrong_street_number_is_rejected_even_if_model_has_quote(self):
        self.event['address']='서울특별시 강남구 영동대로 514'
        accepted,rejected=self.verify()
        self.assertFalse(accepted)
        self.assertIn('EVENT_ADDRESS_NOT_IN_QUOTE',rejected[0]['reasons'])

    def test_invented_quote_and_unread_source_cannot_verify(self):
        self.proof['typeQuote']='imagined proof'
        self.assertIn('QUOTE_NOT_IN_READ_SOURCE:typeQuote',self.verify()[1][0]['reasons'])
        self.proof['typeQuote']='커피 산업 박람회';self.docs[self.url]['status']='INACCESSIBLE'
        self.assertIn('FACT_SOURCE_NOT_READ:sourceUrl',self.verify()[1][0]['reasons'])

    def test_business_address_and_unrelated_address_source_are_rejected(self):
        self.proof['addressQuote']='사업자 주소 '+self.event['address']
        self.docs[self.url]['bodyText']+='\n'+self.proof['addressQuote']
        self.assertIn('BUSINESS_ADDRESS_IS_NOT_EVENT_LOCATION',self.verify()[1][0]['reasons'])
        other='https://example.com/unrelated';self.proof['addressSourceUrl']=other
        self.proof['addressQuote']=self.event['address'];self.docs[other]=dict(status='READ',bodyText=self.event['address'])
        self.assertIn('ADDRESS_SOURCE_NOT_CONNECTED_TO_EVENT_VENUE',self.verify()[1][0]['reasons'])

    def test_empty_venue_and_unrelated_original_source_are_rejected(self):
        self.event['venueName']=None
        self.assertIn('EVENT_VENUE_NOT_IN_QUOTE',self.verify()[1][0]['reasons'])
        self.event['venueName']='서울전시장';self.event['sources']=[]
        self.assertIn('FACT_SOURCE_NOT_EVENT_ORIGINAL',self.verify()[1][0]['reasons'])

    def test_venue_hall_qualifier_is_verified_separately_from_venue_name(self):
        self.event['venueName']='코엑스 Hall A, B';self.proof['venueQuote']='관람 장소 Hall A, B'
        self.docs[self.url]['bodyText']=self.identity_text+'코엑스\n커피 산업 박람회\n관람 장소 Hall A, B\n'+self.event['address']
        self.assertFalse(self.verify()[1])
        self.event['venueName']='코엑스 Hall C';self.assertIn('EVENT_VENUE_NOT_IN_QUOTE',self.verify()[1][0]['reasons'])

    def test_organizer_footer_cannot_supply_a_guessed_venue_address(self):
        self.docs[self.url]['footerAddresses']=[self.event['address']]
        self.assertIn('SITE_FOOTER_ADDRESS_NEEDS_SEPARATE_VENUE_CONFIRMATION',self.verify()[1][0]['reasons'])

    def test_business_address_label_outside_quote_still_rejects(self):
        self.docs[self.url]['bodyText']='커피 산업 박람회\n서울전시장\n사업자 주소\n'+self.event['address']
        self.assertIn('BUSINESS_ADDRESS_IS_NOT_EVENT_LOCATION',self.verify()[1][0]['reasons'])

    def test_character_popup_does_not_become_subculture_by_subject(self):
        self.event['subcategory']=self.proof['subcategory']='CHARACTER_ART'
        self.proof['typeQuote']='캐릭터 팝업스토어'
        self.docs[self.url]['bodyText']='캐릭터 팝업스토어\n행사장 서울전시장\n'+self.event['address']
        self.assertIn('POPUP_STORE_IS_NOT_SUBCULTURE_FORMAT',self.verify()[1][0]['reasons'])

    def test_industrial_coffee_show_cannot_be_food_festival(self):
        self.event['subcategory']=self.proof['subcategory']='FOOD'
        self.assertIn('TRADE_EXHIBITION_IS_NOT_FESTIVAL',self.verify()[1][0]['reasons'])

    def test_type_is_supported_by_actual_quote(self):
        self.event['subcategory']=self.proof['subcategory']='BIRTHDAY_CAFE'
        self.assertIn('EVENT_TYPE_NOT_SUPPORTED_BY_QUOTE',self.verify()[1][0]['reasons'])

    def test_original_tmm_read_upgrades_snippet_and_equivalent_address_spelling(self):
        url='https://takemm.com/prod/view/71267'
        self.event.update(venueName='쿠잉스테이션',address='서울특별시 마포구 와우산로29마길 16 2층',subcategory='BIRTHDAY_CAFE')
        self.event['sources']=[dict(url=url,kind='OTHER',access='SEARCH_SNIPPET',evidence='검색 단서')]
        self.proof.update(sourceUrl=url,addressSourceUrl=url,subcategory='BIRTHDAY_CAFE',typeQuote='생일 카페',
            venueQuote='쿠잉스테이션',addressQuote='서울 마포구 와우산로29마길 16 2F')
        self.docs={url:dict(status='READ',bodyText=self.identity_text+'생일 카페\n쿠잉스테이션\n서울 마포구 와우산로29마길 16 2F')}
        accepted,rejected=self.verify();self.assertFalse(rejected);self.assertEqual(len(accepted),1)
        self.assertEqual(self.event['sources'][0]['access'],'ORIGINAL');self.assertEqual(self.event['sources'][0]['kind'],'OFFICIAL')

    def test_no_proof_remains_pending_for_new_typed_discovery(self):
        self.result.pop('eventEvidence',None)
        item=next(j for j in self.run.discovery_work_queue.jobs.values() if j['kind']=='TYPE_SOURCE' and j['payload']['searchType']=='BIRTHDAY_CAFE')
        with patch.object(self.run,'job',return_value=(self.result,True)), redirect_stdout(io.StringIO()):
            self.run.discovery_work_item(item)
        row=next(iter(self.run.event_queue.candidates.values()))
        self.assertEqual(row['state'],'PENDING')
        self.assertIn('MISSING_OR_AMBIGUOUS_EVENT_FACT_EVIDENCE',row['discoveryLead']['validationIssues'])

    def test_retry_prompt_contains_previous_research_failures(self):
        item=self.run.event_queue.enqueue_discovered([self.event],SCOPE)[0]
        item['issues']=['판매 시각 시간대 필요']
        result={**self.result,'events':[],'searchStatus':'FAILED'}
        with patch.object(weekly,'read_fact_documents',return_value={}),patch.object(self.run,'job',return_value=(result,True)) as job:
            self.run.research_event_name(item)
        self.assertIn('previousResearchIssues',job.call_args.args[1]);self.assertIn('판매 시각 시간대 필요',job.call_args.args[1])

    def test_unverified_optional_guide_does_not_drop_verified_event(self):
        self.event['visitorGuide']=dict(tickets=[],programs=[],faq=[],sales=[],coverage=[
            dict(kind='PARTICIPANTS',status='UNPUBLISHED',sourceUrl=None,checkedOn=None,note='미확인')])
        self.result['eventEvidence']=[self.proof]
        item=self.run.event_queue.enqueue_discovered([self.event],SCOPE)[0]
        def read(urls,documents,blocked):documents.update(self.docs);return documents
        with patch.object(weekly,'read_fact_documents',side_effect=read),patch.object(weekly,'official_source_issues',return_value=[]),\
                patch.object(self.run,'job',return_value=(self.result,True)),redirect_stdout(io.StringIO()):
            event=self.run.research_event_name(item)
        self.assertIsNotNone(event);self.assertEqual(event['visitorGuide']['coverage'],[])
        self.assertTrue(list((self.run.folder/'jobs').glob('*/guide-validation.json')))
        payload=json.loads(next((self.run.folder/'jobs').glob('*/payload.json')).read_text(encoding='utf-8'))
        self.assertNotIn('eventEvidence',payload['result'])


if __name__ == '__main__': unittest.main()
