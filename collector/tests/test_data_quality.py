import unittest
from data_quality import missing_reasons,merge_enrichment,select_targets

def event(name='행사'):
    return {'name':name,'subcategory':'WINE','organizer':'주최','edition':'2026','region':'SEOUL','venueName':'전시장',
      'address':None,'description':'설명','admission':None,'subjects':[],
      'occurrences':[{'startDate':'2026-10-01','endDate':'2026-10-01','startTime':None,'endTime':None}],
      'sources':[{'url':'https://official.example/event','kind':'OFFICIAL','access':'ORIGINAL','evidence':'일정'}],
      'banners':[],'warnings':[],'eventFormat':'MULTI_BOOTH','discoveryLinks':[],
      'operationStatus':{'state':'UNKNOWN','note':None,'sourceUrl':None,'checkedOn':None}}

class DataQualityTests(unittest.TestCase):
 def test_missing_fields_are_explicit(self):
  self.assertEqual(missing_reasons(event()),['MISSING_ADDRESS','MISSING_ADMISSION','MISSING_HOURS','MISSING_PARTICIPANT_SOURCE','MISSING_FLOORPLAN_SOURCE','MISSING_SALES_SOURCE','MISSING_CURRENT_BANNER','MISSING_VISITOR_GUIDE','MISSING_INTEREST_SUBJECTS'])
 def test_merge_only_fills_gaps_and_preserves_identity(self):
  old=event();new=event();new.update(address='서울 주소',admission='무료',venueName='다른 장소')
  new['occurrences'][0].update(startTime='10:00',endTime='18:00')
  new['discoveryLinks']=[{'kind':'PARTICIPANTS','url':'https://official.example/booths','status':'PUBLISHED','note':'공식 명단'}]
  new['banners']=[{'imageUrl':'https://official.example/poster.jpg','pageUrl':'https://official.example/event','rights':'UNKNOWN','rightsEvidence':None,'matchesEdition':True}]
  merged=merge_enrichment(old,new)
  self.assertEqual(merged['venueName'],'전시장')
  self.assertEqual(merged['address'],'서울 주소')
  self.assertEqual(merged['occurrences'][0]['startTime'],'10:00')
  self.assertEqual(merged['discoveryLinks'][0]['status'],'PUBLISHED')
 def test_unrelated_event_is_rejected(self):
  with self.assertRaises(ValueError):merge_enrichment(event(),event('다른 행사'))
 def test_never_attempted_targets_rotate_before_recent_ones(self):
  rows=[{'id':1,'event':event('우선 행사')},{'id':2,'event':event('새 행사')},{'id':3,'event':event('기존 행사')}]
  attempts={'1':{'checkedAt':'2026-09-01'},'3':{'checkedAt':'2026-08-01'}}
  self.assertEqual([row['id'] for row in select_targets(rows,attempts,3,['우선'])],[2,3,1])
 def test_published_same_url_replaces_unknown_and_unpublished_but_not_known_link(self):
  from copy import deepcopy
  for state in ('UNKNOWN','UNPUBLISHED','INACCESSIBLE','PUBLISHED'):
   old=event();old['discoveryLinks']=[dict(kind='PARTICIPANTS',url='https://official.example/list',status=state,note='기존')]
   new=deepcopy(old);new['discoveryLinks'][0].update(status='PUBLISHED',note='공식 최신 명단')
   merged=merge_enrichment(old,new)
   self.assertEqual(len(merged['discoveryLinks']),1)
   self.assertEqual(merged['discoveryLinks'][0]['status'],'PUBLISHED')
   self.assertEqual(merged['discoveryLinks'][0]['note'],'기존' if state=='PUBLISHED' else '공식 최신 명단')
   self.assertEqual(old['discoveryLinks'][0]['status'],state)
 def test_same_banner_can_gain_edition_confirmation_without_inventing_rights(self):
  from copy import deepcopy
  old=event();old['banners']=[dict(imageUrl='https://official.example/poster.jpg',pageUrl='https://official.example/event',matchesEdition=False,rights='UNKNOWN',rightsEvidence=None)]
  new=deepcopy(old);new['banners'][0].update(matchesEdition=True,rights='ALLOWED')
  merged=merge_enrichment(old,new)
  self.assertTrue(merged['banners'][0]['matchesEdition']);self.assertEqual(merged['banners'][0]['rights'],'UNKNOWN')
 def test_festival_visitor_guide_is_checked_too(self):
  value=event();value['subcategory']='MUSIC_FESTIVAL'
  self.assertIn('MISSING_VISITOR_GUIDE',missing_reasons(value))

if __name__=='__main__':unittest.main()
