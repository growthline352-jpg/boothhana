import json,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
import jsonschema
from graph_worker import Worker,configuration,schema,require_opened,MODEL,validate_products,MEDIA
from run import RunError,CliUnavailable,audit_opened_urls

SOURCE='https://example.com/product'
RESULT={'assignments':[],'unresolved':[], 'sources':[{'url':SOURCE,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'Product description'}]}
def page_result(url=SOURCE):return {'type':'item.completed','item':{'type':'web_search','action':{'type':'open_page','url':url},'results':[{'url':url,'ref_id':'turn0view0','snippet':'Total lines: 30'}]}}
class FakeApi:
    def __init__(self):self.calls=[]
    def request(self,method,path,body=None):
        self.calls.append((method,path,body))
        if path.endswith('/extract'):return {'id':body['extractionId'],'resultHash':'b'*64}
        if path.endswith('/decide'):return {'verdict':body['verdict']}
        return {}

class GraphWorkerTests(unittest.TestCase):
    def test_watch_refreshes_all_pages_before_claiming(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;worker=Worker(cfg,FakeApi(),search=lambda *a,**k:None)
            calls=[]
            def request(method,path,body):
                calls.append((path,body))
                if path=='/claim':return {'empty':True}
                return {'afterId':100 if body['afterId']==0 else 150,'hasMore':body['afterId']==0}
            with patch.object(worker,'request',side_effect=request),patch('graph_worker.time.sleep',side_effect=InterruptedError):
                with self.assertRaises(InterruptedError):worker.run(watch=True)
            self.assertEqual(['/refresh','/refresh','/refresh-creators','/refresh-creators','/claim'],[p for p,b in calls])
            self.assertEqual([0,100,0,100],[b['afterId'] for p,b in calls[:-1]])

    def test_account_failure_releases_job_then_backs_off_without_draining_queue(self):
        for reason in ('USAGE_LIMIT','AUTH_REQUIRED','INVALID_SCHEMA'):
            with self.subTest(reason=reason),tempfile.TemporaryDirectory() as temp:
                cfg=configuration();cfg['stateDirectory']=temp;worker=Worker(cfg,FakeApi(),search=lambda *a,**k:None)
                job={'id':str(uuid.uuid4()),'kind':'EVENT','leaseToken':str(uuid.uuid4())};calls=[]
                def request(method,path,body):
                    calls.append((path,body))
                    if path=='/claim':return job
                    return {'afterId':1,'hasMore':False}
                with patch.object(worker,'request',side_effect=request),patch.object(worker,'process',side_effect=CliUnavailable(reason)),patch('graph_worker.time.sleep',side_effect=InterruptedError) as sleep:
                    with self.assertRaises(InterruptedError):worker.run(watch=True)
                self.assertEqual(1,sum(path=='/claim' for path,body in calls))
                self.assertTrue(calls[-1][0].endswith('/failure'))
                self.assertEqual(job['leaseToken'],calls[-1][1]['leaseToken'])
                sleep.assert_called_once_with(3600)

    def test_drain_exits_on_account_failure_without_claiming_every_pending_job(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;worker=Worker(cfg,FakeApi(),search=lambda *a,**k:None)
            job={'id':str(uuid.uuid4()),'kind':'EVENT','leaseToken':str(uuid.uuid4())}
            with patch.object(worker,'request',side_effect=[job,{}]) as request,patch.object(worker,'process',side_effect=CliUnavailable('USAGE_LIMIT')),patch('graph_worker.time.sleep') as sleep:
                worker.run()
            self.assertEqual(2,request.call_count);sleep.assert_not_called()

    def test_all_job_schemas_are_valid(self):
        for kind in ['DISCOVERY','EVENT','PARTICIPANTS','SALES','CREATOR','CHARACTERS','RELATIONS']:jsonschema.Draft202012Validator.check_schema(schema(kind))
    def test_batch_schema_requires_nullable_cursor_without_changing_legacy_schema(self):
        for kind in ['PARTICIPANTS','SALES','CREATOR']:
            value=schema(kind);self.assertIn('pageBatch',value['required'])
            self.assertEqual(100,value['properties']['pageBatch']['anyOf'][1]['properties']['labels']['maxItems'])
        original=json.loads((Path(__file__).resolve().parents[1]/'schemas/stage-result.schema.json').read_text(encoding='utf-8'))
        self.assertNotIn('pageBatch',original['properties'])
    def test_series_official_identity_page_is_required_original_evidence(self):
        result={**RESULT,'series':{'officialUrl':'https://example.com/series'}}
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[SOURCE]})
        require_opened(result,{'openedUrls':[SOURCE,'https://example.com/series']})
    def test_explicit_model_without_cost_ceiling(self):
        cfg=configuration();self.assertEqual(MODEL,cfg['model']);self.assertNotIn('maxCliCalls',cfg)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'config.json';path.write_text('{"model":null}')
            with self.assertRaises(RunError):configuration(path)
    def test_search_snippet_is_not_direct_source_verification(self):
        with self.assertRaises(RunError):require_opened(RESULT,{'openedUrls':['https://example.com/search']})
        require_opened(RESULT,{'openedUrls':[SOURCE+'/']})
    def test_extract_and_review_use_separate_calls_and_publish_only_after_review(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();calls=[]
            def search(cfg,directory,prompt,schema_path,**kwargs):
                calls.append(directory.name);self.assertEqual(MODEL,cfg['model']);self.assertTrue(kwargs['web_search'])
                value=RESULT if directory.name=='extract' else {'verdict':'APPROVE','reason':'Verified original'}
                (directory/'codex.jsonl').write_text(json.dumps(page_result()))
                return json.dumps(value).encode(),True,{'input_tokens':1}
            worker=Worker(cfg,api,search);job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'CHARACTERS','contextHash':'a'*64,'context':{'product':{'data':{'images':[]}}}}
            worker.process(job);self.assertEqual(['extract','review'],calls)
            self.assertEqual(['/extract','/decide'],['/'+p.rsplit('/',1)[-1] for _,p,_ in api.calls])
    def test_resume_reviews_saved_extraction_without_reextracting(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();calls=[]
            def search(cfg,directory,prompt,schema_path,**kwargs):
                calls.append(directory.name);(directory/'codex.jsonl').write_text(json.dumps(page_result()))
                return b'{"verdict":"ENRICH","reason":"Need more evidence"}',True,{}
            context={'product':{'data':{'images':[]}}};job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'CHARACTERS','context':context,'extraction':{'id':str(uuid.uuid4()),'resultHash':'b'*64,'result':RESULT,'context':context}}
            Worker(cfg,api,search).process(job);self.assertEqual(['review'],calls);self.assertEqual('ENRICH',api.calls[-1][2]['verdict'])
    def test_empty_results_need_direct_coverage_verification(self):
        result={'coverage':{'visitedPages':[SOURCE]},'participants':[]}
        require_opened(result,{'openedUrls':[SOURCE]})
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':['https://example.com/another']})

    def test_unsplit_image_set_never_silently_truncates(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            job={'kind':'CHARACTERS','context':{'product':{'data':{'images':[{'imageUrl':SOURCE+str(i)} for i in range(5)]}}}}
            with self.assertRaises(RunError):Worker(cfg,FakeApi()).images(job,Path(temp))

    def test_later_image_group_loads_all_remaining_images(self):
        import hashlib
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;raw=b'test image';digest=hashlib.sha256(raw).hexdigest()
            job={'kind':'CHARACTERS','context':{'input':{'analysisParent':str(uuid.uuid4()),'imageOffset':4},'product':{'data':{'images':[{'imageUrl':SOURCE+str(i)} for i in range(6)]}}}}
            with patch('graph_worker.fetch_image',return_value=(raw,'image/png',digest)) as fetch:
                paths,manifest=Worker(cfg,FakeApi()).images(job,Path(temp))
            self.assertEqual([4,5],[x['index'] for x in manifest]);self.assertEqual(2,len(paths));self.assertEqual([SOURCE+'4',SOURCE+'5'],[x.args[0] for x in fetch.call_args_list])

    def test_blocked_image_remains_visible_as_missing_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            job={'kind':'CHARACTERS','context':{'product':{'data':{'images':[{'imageUrl':'https://witchform.com/p.png'}]}}}}
            paths,manifest=Worker(cfg,FakeApi()).images(job,Path(temp))
            self.assertFalse(paths);self.assertEqual('blocked_or_invalid_host',manifest[0]['unavailable'])

    def test_changed_image_on_resume_requires_new_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();context={'product':{'data':{'images':[]}}}
            saved={**RESULT,'imageCoverage':[{'index':0,'sha256':'a'*64,'status':'AVAILABLE'}]}
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'CHARACTERS','context':context,'extraction':{'id':str(uuid.uuid4()),'resultHash':'b'*64,'result':saved,'context':context}}
            worker=Worker(cfg,api)
            with patch.object(worker,'images',return_value=([],[{'index':0,'sha256':'c'*64}])):
                with patch.object(worker,'call',return_value=({'verdict':'APPROVE','reason':'verified'},{'openedUrls':[SOURCE]})):
                    worker.process(job)
            self.assertEqual('ENRICH',api.calls[-1][2]['verdict'])

    def test_no_web_audit_never_requests_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi()
            worker=Worker(cfg,api,lambda *a,**k:(json.dumps(RESULT).encode(),False,{}))
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'CHARACTERS','contextHash':'a'*64,'context':{'product':{'data':{'images':[]}}}}
            with self.assertRaises(RunError):worker.process(job)
            self.assertFalse(api.calls)

    def test_batched_read_success_does_not_approve_failed_first_url(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'audit';row=page_result('https://example.com/failed')
            row['item']['results']=[{'title':'Internal Error','ref_id':'turn0view0','snippet':'Total lines: 1'}, {'url':SOURCE,'ref_id':'turn0view1','snippet':'Total lines: 307'}]
            path.write_text(json.dumps(row));self.assertEqual([SOURCE],audit_opened_urls(path))
            row['item']['action']={'type':'other'};path.write_text(json.dumps(row));self.assertEqual([SOURCE],audit_opened_urls(path))
            row['item']['results']=[{'url':SOURCE,'ref_id':'turn0search0','snippet':'Total lines: 307'}]
            path.write_text(json.dumps(row));self.assertEqual([],audit_opened_urls(path))

    def test_empty_body_and_unobserved_open_are_not_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'audit';row=page_result();row['item']['results'][0]['snippet']='Total lines: 0'
            path.write_text(json.dumps(row));self.assertEqual([],audit_opened_urls(path))
            del row['item']['results'];path.write_text(json.dumps(row));self.assertEqual([],audit_opened_urls(path))

    def test_failed_coverage_url_not_required_for_valid_fact(self):
        require_opened({**RESULT,'coverage':{'visitedPages':[SOURCE,'https://example.com/failed']}},{'openedUrls':[SOURCE]})

    def test_empty_discovery_requires_successful_completed_coverage(self):
        result={'events':[],'searchStatus':'COMPLETE','sourceCoverage':[{'status':'NO_RESULTS','checkedUrls':[SOURCE]}]}
        require_opened(result,{'openedUrls':[SOURCE]})
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[]})
        result['sourceCoverage'].append({'status':'NO_RESULTS','checkedUrls':['https://example.com/missing']})
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[SOURCE]})
        result['sourceCoverage']=[{'status':'INACCESSIBLE','checkedUrls':[SOURCE]}]
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[SOURCE]})
        result['sourceCoverage']=[]
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[SOURCE]})

    def test_partial_empty_discovery_retains_only_actual_read_evidence(self):
        result={'events':[],'searchStatus':'PARTIAL','sourceCoverage':[{'status':'PARTIAL','checkedUrls':[SOURCE,'https://example.com/missing']}]}
        require_opened(result,{'openedUrls':[SOURCE]})
        with self.assertRaises(RunError):require_opened(result,{'openedUrls':[]})

    def test_empty_discovery_review_refetches_calendar_and_preserves_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();calls=[]
            result={'events':[],'searchStatus':'COMPLETE','sourceCoverage':[{'status':'NO_RESULTS','checkedUrls':[SOURCE]}]}
            def call(directory,prompt,schema,images,urls):
                calls.append((directory.name,urls))
                return (result if directory.name=='extract' else {'verdict':'APPROVE','reason':'Calendar has no events'}),{'openedUrls':[SOURCE]}
            worker=Worker(cfg,api,search=lambda *a,**k:None)
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'DISCOVERY','contextHash':'a'*64,'context':{'input':{}}}
            with patch.object(worker,'call',side_effect=call):worker.process(job)
            self.assertIn(SOURCE,calls[1][1]);self.assertEqual('APPROVE',api.calls[-1][2]['verdict'])

    def test_medium_contract_rejects_arbitrary_vtuber_category(self):
        work_schema=schema('CHARACTERS')['properties']['assignments']['items']['properties']['work']
        work={'id':None,'name':'스텔라이브','sourceUrl':SOURCE,'medium':'VTuber 프로젝트','identityDecision':'NEW','identityEvidence':[]}
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(work,work_schema)
        work['medium']='오리지널·기타';jsonschema.validate(work,work_schema)
        backend=(Path(__file__).resolve().parents[2]/'backend/src/main/java/com/boothhana/interests/InterestRules.java').read_text(encoding='utf-8')
        import re
        self.assertEqual(set(MEDIA),set(re.findall(r'"([^"]+)"',re.search(r'MEDIA=Set.of\(([^)]*)\)',backend)[1])))

    def test_form_cannot_replace_its_individual_options(self):
        row={'goods':[{'name':'판매표','sources':RESULT['sources']}],'productCoverage':[{'sourceUrl':SOURCE,'optionNames':['히나','리제'],'complete':True}]}
        with self.assertRaises(RunError):validate_products(row)
        row['goods']=[{'name':n,'sources':RESULT['sources']} for n in ['히나','리제']];validate_products(row)

    def test_server_fetched_document_does_not_require_redundant_llm_search(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            doc={'url':SOURCE,'sha256':'a'*64,'capturedAt':'2026-10-08T00:00:00+00:00','available':True,'text':'Official named product'}
            worker=Worker(cfg,FakeApi(),search=lambda *a,**k:(json.dumps(RESULT).encode(),False,{}),source_loader=lambda urls:[doc])
            result,audit=worker.call(Path(temp)/'call','read original',schema('CHARACTERS'),[],[SOURCE])
            self.assertFalse(audit['webSearchObserved']);self.assertEqual('a'*64,audit['sourceDocuments'][0]['sha256']);require_opened(result,audit)

    def test_discovery_review_is_isolated_per_event(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi()
            worker=Worker(cfg,api,search=lambda *a,**k:None)
            events=[{'name':'good','sources':RESULT['sources']},{'name':'needs update','sources':RESULT['sources']}]
            def call(directory,*args):
                if directory.name=='extract':return {'events':events},{'openedUrls':[SOURCE]}
                good=directory.name=='review-event-0'
                return {'verdict':'APPROVE' if good else 'ENRICH','reason':'checked'},{'openedUrls':[SOURCE],'usage':{}}
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'DISCOVERY','contextHash':'a'*64,'context':{'input':{}}}
            with patch.object(worker,'call',side_effect=call):worker.process(job)
            body=api.calls[-1][2];self.assertEqual('APPROVE',body['verdict']);self.assertEqual(['APPROVE','ENRICH'],[d['verdict'] for d in body['eventDecisions']])
            self.assertEqual(events,api.calls[0][2]['result']['events'])

if __name__=='__main__':unittest.main()
