from copy import deepcopy
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitor_guide import validate_guide
from rules import public_url
from data_quality import merge_enrichment,select_targets

DATES=[{'startDate':'2026-10-10','endDate':'2026-10-11'}]
def ticket():return {'id':'general','name':'일반권','visitDate':'2026-10-10','priceAmount':'8000','currency':'KRW','salesStartsAt':'2026-08-10T19:00:00+09:00','salesEndsAt':'2026-10-10','entryTime':None,'reservationUrl':None,'status':'PUBLISHED','note':None,'sourceUrl':'https://illustar.net/tickets','checkedOn':'2026-10-02'}
def guide():return {'tickets':[ticket()],'programs':[],'faq':[],'sales':[],'coverage':[]}
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
if __name__=='__main__':unittest.main()
