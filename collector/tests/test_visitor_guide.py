from copy import deepcopy
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitor_guide import validate_guide
from rules import public_url
from data_quality import merge_enrichment,select_targets,missing_reasons

DATES=[{'startDate':'2026-10-10','endDate':'2026-10-11'}]
def ticket():return {'id':'general','name':'일반권','visitDate':'2026-10-10','priceAmount':'8000','currency':'KRW','salesStartsAt':'2026-08-10T19:00:00+09:00','salesEndsAt':'2026-10-10','entryTime':None,'reservationUrl':None,'status':'PUBLISHED','note':None,'sourceUrl':'https://illustar.net/tickets','checkedOn':'2026-10-02'}
def guide():return {'tickets':[ticket()],'programs':[],'faq':[],'sales':[],'coverage':[]}
def program():return {'id':'stage','name':'공연','type':'STAGE','subjects':[],'day':None,'startTime':None,'endTime':None,'venue':None,'ticketRequirement':'UNKNOWN','ticketId':None,'status':'PUBLISHED','note':None,'sourceUrl':'https://illustar.net/programs','checkedOn':'2026-10-02'}
class VisitorGuideTests(unittest.TestCase):
 def test_confirmed_prices_need_provenance_and_current_event_dates(self):
  validate_guide(guide(),DATES,public_url)
  for field,value in [('sourceUrl',None),('checkedOn',None),('visitDate','2025-10-10'),('salesEndsAt','2026-08-01'),('reservationUrl','http://127.0.0.1/private')]:
   g=guide();g['tickets'][0][field]=value
   with self.assertRaises(ValueError):validate_guide(g,DATES,public_url)
 def test_unknown_policy_cannot_repeat_last_edition_answer(self):
  g=guide();g['faq']=[{'id':'entry','question':'지연 입장 가능?','answer':'작년에는 가능','status':'UNKNOWN','sourceUrl':None,'checkedOn':None}]
  with self.assertRaises(ValueError):validate_guide(g,DATES,public_url)
 def test_gap_merge_preserves_existing_reviewed_prices_and_fills_new_guide(self):
  old={'name':'행사','occurrences':DATES,'visitorGuide':guide()};new=deepcopy(old);new['visitorGuide']['tickets'][0]['priceAmount']='22000'
  self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'][0]['priceAmount'],'8000')
  old['visitorGuide']=None
  self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'][0]['priceAmount'],'22000')
 def test_admin_accepted_request_has_priority_within_existing_limit(self):
  a={'id':1,'event':{'name':'일반 행사'}};b={'id':2,'event':{'name':'요청 행사'},'informationRequested':True}
  self.assertEqual([r['id'] for r in select_targets([a,b],{'2':{'checkedAt':'2026-10-02'}},1,[])],[2])
 def test_partial_published_guide_remains_eligible_for_enrichment(self):
  g=guide();g['tickets'][0]['priceAmount']=None
  old={'name':'행사','subcategory':'COMIC_DOUJIN','occurrences':DATES,'visitorGuide':g}
  self.assertIn('INCOMPLETE_VISITOR_GUIDE',missing_reasons(old))
  g['tickets'][0]['priceAmount']='8000';g['programs']=[program()]
  self.assertIn('INCOMPLETE_VISITOR_GUIDE',missing_reasons(old))
  g['programs'][0].update(day='2026-10-10',startTime='14:00')
  self.assertNotIn('INCOMPLETE_VISITOR_GUIDE',missing_reasons(old))
 def test_later_verified_price_and_program_time_fill_published_rows(self):
  g=guide();g['tickets'][0]['priceAmount']=None;g['programs']=[program()]
  old={'name':'행사','occurrences':DATES,'visitorGuide':g};new=deepcopy(old)
  new['visitorGuide']['tickets'][0].update(priceAmount='8000',checkedOn='2026-10-03')
  new['visitorGuide']['programs'][0].update(day='2026-10-10',startTime='14:00',ticketRequirement='INCLUDED',checkedOn='2026-10-03')
  merged=merge_enrichment(old,new)['visitorGuide']
  self.assertEqual(merged['tickets'][0]['priceAmount'],'8000')
  self.assertEqual(merged['programs'][0]['startTime'],'14:00')
  validate_guide(merged,DATES,public_url)
  self.assertIsNone(old['visitorGuide']['tickets'][0]['priceAmount'])
 def test_enrichment_rejects_older_or_conflicting_guide_evidence(self):
  g=guide();g['programs']=[program()]
  old={'name':'행사','occurrences':DATES,'visitorGuide':g}
  for change in [{'priceAmount':'22000','entryTime':'10:00'}, {'checkedOn':'2026-10-01','entryTime':'10:00'}, {'sourceUrl':None,'entryTime':'10:00'}]:
   new=deepcopy(old);new['visitorGuide']['tickets'][0].update(change)
   self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'],g['tickets'])
 def test_sold_out_program_requires_evidence(self):
  g=guide();p=program();g['programs']=[p];p.update(status='SOLD_OUT',sourceUrl=None,checkedOn=None)
  with self.assertRaises(ValueError):validate_guide(g,DATES,public_url)
 def test_sale_date_can_gain_time_and_partial_coverage_can_be_completed(self):
  g=guide();g['sales']=[{'id':'sale','title':'판매','salesMethod':'온라인','salesStartsAt':'2026-10-01','salesEndsAt':None,'pickupDay':None,'note':None,'sourceUrl':'https://illustar.net/sale','checkedOn':'2026-10-01'}]
  g['coverage']=[{'kind':'PROGRAMS','status':'PARTIAL','note':'시간 미확인','sourceUrl':'https://illustar.net/programs','checkedOn':'2026-10-01'}]
  old={'name':'행사','occurrences':DATES,'visitorGuide':g};new=deepcopy(old)
  new['visitorGuide']['sales'][0].update(salesStartsAt='2026-10-01T10:00:00+09:00',pickupDay='2026-10-11',checkedOn='2026-10-02')
  new['visitorGuide']['coverage'][0].update(status='PUBLISHED',note='전체 시간표 확인',checkedOn='2026-10-02')
  merged=merge_enrichment(old,new)['visitorGuide'];validate_guide(merged,DATES,public_url)
  self.assertEqual(merged['sales'][0]['pickupDay'],'2026-10-11')
  self.assertEqual(merged['coverage'][0]['status'],'PUBLISHED')
  new['visitorGuide']['sales'][0]['salesStartsAt']='2026-10-02T00:00:00+09:00'
  self.assertEqual(merge_enrichment(old,new)['visitorGuide']['sales'],g['sales'])
if __name__=='__main__':unittest.main()
