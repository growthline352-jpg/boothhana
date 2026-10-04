import unittest
from recheck import observation,source_digest,official_urls,extract_documents
from discovery_work import popup_jobs,load_profiles,DiscoveryWorkQueue
from pathlib import Path
import tempfile
import json,time
from types import SimpleNamespace
from unittest.mock import patch
class RecheckTests(unittest.TestCase):
 def setUp(self):
  self.url='https://example.com/event'
  self.target={'id':1,'revision':3,'event':{'name':'행사','organizer':'주최','edition':'2026','sources':[{'kind':'OFFICIAL','access':'ORIGINAL','url':self.url}]}}
  self.docs=[{'url':self.url,'text':'공식 일정 정정: 이번 행사는 11월 1일부터 2일까지 열립니다.'}]
  self.result={'identity':{'name':'행사','organizer':'주최','edition':'2026'},'fields':{'occurrences':{'state':'CONFIRMED','sourceUrl':self.url,'evidence':'공식 일정 정정','value':[{'startDate':'2026-11-01','endDate':'2026-11-02','startTime':None,'endTime':None}]}}}
 def test_changed_dates_are_proposed_without_replacing_or_reidentifying_event(self):
  payload=observation(self.target,self.result,self.docs)
  self.assertEqual(payload['eventRevision'],3);self.assertEqual(payload['values']['occurrences'][0]['startDate'],'2026-11-01');self.assertNotIn('occurrences',self.target['event'])
 def test_unfetched_or_other_edition_evidence_is_rejected(self):
  self.result['fields']['occurrences']['sourceUrl']='https://example.com/other'
  with self.assertRaises(Exception):observation(self.target,self.result,self.docs)
  self.result['identity']['edition']='2025'
  with self.assertRaises(Exception):observation(self.target,self.result,self.docs)
 def test_unpublished_does_not_clear_known_fact(self):
  self.result['fields']['occurrences'].update(state='SOURCE_UNPUBLISHED',value=None)
  payload=observation(self.target,self.result,self.docs);self.assertEqual(payload['values'],{});self.assertEqual(payload['status'],'SOURCE_UNPUBLISHED')
 def test_extraction_failure_is_not_reported_as_source_unpublished(self):
  self.result['fields']['occurrences'].update(state='EXTRACTION_FAILED',value=None)
  self.assertEqual(observation(self.target,self.result,self.docs)['status'],'EXTRACTION_FAILED')
 def test_digest_changes_when_official_fact_changes(self):
  self.assertNotEqual(source_digest(self.docs),source_digest([{'url':self.url,'text':'다른 장소'}]))
 def test_blank_value_and_fabricated_evidence_cannot_propose_changes(self):
  self.result['fields']['occurrences']['evidence']='원문에 없는 주장'
  with self.assertRaises(Exception):observation(self.target,self.result,self.docs)
  self.result['fields']['occurrences'].update(evidence='공식 일정 정정',value='')
  with self.assertRaises(Exception):observation(self.target,self.result,self.docs)
 def test_popup_sources_recur_independently_after_one_day(self):
  profile=load_profiles(Path(__file__).resolve().parents[1]/'discovery_profiles.json');scope={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':'2026-10-04','endDate':'2026-11-03'}
  jobs=popup_jobs(profile,scope);self.assertEqual(len(jobs),2);self.assertTrue(all(j['cadenceDays']==1 for j in jobs))
  with tempfile.TemporaryDirectory() as temp:
   queue=DiscoveryWorkQueue(Path(temp)/'jobs.json');queue.enqueue(jobs);self.assertEqual(len(queue.due('POPUP_SOURCE',2)),2);self.assertEqual(queue.due('FESTIVAL_SOURCE',2),[])
 def test_fetched_official_extraction_has_its_own_audit_and_cli_budget(self):
  with tempfile.TemporaryDirectory() as temp:
   pipeline=SimpleNamespace(cfg={'maxRuntimeMinutes':30,'timeoutSeconds':300},calls=0,stats={'cliCalls':0},started=time.monotonic(),check_budget=lambda **kw:None,job_dir=lambda key:Path(temp),progress=lambda *args:None)
   with patch('recheck.execute_search',return_value=(json.dumps({'searchStatus':'COMPLETE',**self.result}).encode(),False,{})):
    extracted=extract_documents(pipeline,'recheck-1','prompt',self.docs,[])
   self.assertEqual(pipeline.calls,1);self.assertEqual(extracted['fields'],self.result['fields'])
   audit=json.loads((Path(temp)/'audit.json').read_text(encoding='utf-8'));self.assertEqual(audit['mode'],'FETCHED_OFFICIAL_DOCUMENTS');self.assertEqual(audit['fetchedSourceUrls'],[self.url])
   with self.assertRaises(Exception):extract_documents(pipeline,'recheck-1','prompt',[],[])
