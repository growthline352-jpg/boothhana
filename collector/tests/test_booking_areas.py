import unittest
from copy import deepcopy
from areas import district_errors
from data_quality import merge_enrichment
from test_data_quality import event
class BookingAreaTests(unittest.TestCase):
 def test_district_validation_and_preservation(self):
  self.assertEqual(district_errors(dict(region='SEOUL',districts=['중구','마포구'])),[])
  self.assertTrue(district_errors(dict(region='GYEONGGI',districts=['중구'])))
  old=event();new=event();new['districts']=['중구'];self.assertEqual(merge_enrichment(old,new)['districts'],['중구'])
  old['districts']=['마포구'];self.assertEqual(merge_enrichment(old,new)['districts'],['마포구'])
 def test_booking_state_can_change_with_new_source_observation_but_known_facts_cannot(self):
  old=event();old['visitorGuide']={'tickets':[dict(id='t',status='PUBLISHED',bookingState='OPEN',priceAmount='1000',sourceUrl='https://example.com',checkedOn='2026-10-01')]}
  new=deepcopy(old);new['visitorGuide']['tickets'][0].update(bookingState='CLOSED',checkedOn='2026-10-02')
  self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'][0]['bookingState'],'CLOSED')
  new['visitorGuide']['tickets'][0]['priceAmount']='2000';self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'][0]['priceAmount'],'1000')
  new=deepcopy(old);new['visitorGuide']['tickets'][0].pop('bookingState');self.assertEqual(merge_enrichment(old,new)['visitorGuide']['tickets'][0]['bookingState'],'OPEN')
