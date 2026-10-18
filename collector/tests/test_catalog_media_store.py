import unittest
from unittest.mock import Mock,patch
from catalog_media_store import store_approved,PREFIX

class MediaStoreTests(unittest.TestCase):
 def asset(self,**extra):return {'id':1,'participantId':7,'rightsState':'APPROVED','storageState':'PENDING','revision':2,'imageUrl':'https://pbs.twimg.com/media/sale',**extra}
 def test_approved_candidate_uses_revision_hash_upload_and_reports_stored(self):
  api=Mock();asset=self.asset();api.request.side_effect=[[asset],asset,{**asset,'storageState':'STORED','storedUrl':'https://cdn.example.com/image'}]
  with patch('catalog_media_store.fetch_image',return_value=(b'image','image/png','a'*64)):result=store_approved(api,{7})
  self.assertEqual(1,len(result['stored']));self.assertEqual('2',api.request.call_args.kwargs['headers']['X-Asset-Revision'])
  self.assertEqual('a'*64,api.request.call_args.kwargs['headers']['X-Image-SHA256'])
 def test_revoked_or_unapproved_or_other_booth_never_fetches(self):
  for listed,fresh in ((self.asset(rightsState='PENDING'),None),(self.asset(),self.asset(rightsState='EXCLUDED')),(self.asset(participantId=9),None)):
   api=Mock();api.request.side_effect=[[listed],fresh]
   with patch('catalog_media_store.fetch_image') as fetch:result=store_approved(api,{7})
   fetch.assert_not_called();self.assertEqual([],result['stored'])
 def test_storage_failure_is_reported_and_does_not_claim_completion(self):
  api=Mock();asset=self.asset();api.request.side_effect=[[asset],asset,RuntimeError('store failed'),asset]
  with patch('catalog_media_store.fetch_image',return_value=(b'image','image/png','a'*64)):result=store_approved(api,{7})
  self.assertEqual([],result['stored']);self.assertEqual(1,len(result['failed']))
 def test_targeted_assets_are_not_starved_by_the_unrelated_global_queue(self):
  api=Mock();asset=self.asset();api.request.side_effect=[asset,asset,{**asset,'storageState':'STORED'}]
  with patch('catalog_media_store.fetch_image',return_value=(b'image','image/png','a'*64)):result=store_approved(api,asset_ids=[1])
  self.assertEqual(1,len(result['stored']));self.assertEqual(PREFIX+'/assets/1',api.request.call_args_list[0].args[1])
 def test_unchanged_failed_source_backs_off_instead_of_fetching_every_poll(self):
  api=Mock();asset=self.asset();retry_after={}
  api.request.side_effect=[[asset],asset,asset,[asset]]
  with patch('catalog_media_store.fetch_image',side_effect=RuntimeError('source failed')) as fetch:
   first=store_approved(api,retry_after=retry_after);second=store_approved(api,retry_after=retry_after)
  self.assertEqual(1,len(first['failed']));self.assertEqual([1],second['deferred']);self.assertEqual(1,fetch.call_count)
