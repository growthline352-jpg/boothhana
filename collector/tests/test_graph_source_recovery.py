import copy,io,json,tempfile,unittest,urllib.error,uuid
from pathlib import Path
from unittest.mock import Mock,patch
import jsonschema
from browser_sources import BrowserPending
from catalog_transport import Api
from graph_worker import Worker,configuration,schema
from social_sources import SocialSources
from taxonomy import GROUPS
from transport import DeliveryError

SOURCE='https://official.example/event'
X='https://x.com/artist'
DOC={'url':SOURCE,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-23T00:00:00Z','text':'Official event and creator original'}
RESULT={'assignments':[],'unresolved':[],'sources':[{'url':SOURCE,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'Original product'}]}

def rejection(status=400,code='INVALID_REQUEST'):
    api=Api('https://api.example','t'*40)
    body=json.dumps({'status':status,'code':code,'message':'양쪽 공식 출처의 동일성 근거가 필요합니다.'}).encode()
    api.opener.open=Mock(side_effect=urllib.error.HTTPError(api.base,status,'Rejected',{},io.BytesIO(body)))
    try:api.request('POST','/api/internal/subculture/v6/jobs/x/decide',{})
    except DeliveryError as error:return error
    raise AssertionError('Expected rejection')

class SourceRecoveryTests(unittest.TestCase):
    def test_graph_schemas_use_shared_subculture_types_without_narrowing_legacy_collection(self):
        for kind in ('EVENT','DISCOVERY'):
            event=schema(kind) if kind=='EVENT' else schema(kind)['properties']['events']['items']
            self.assertEqual(set(GROUPS['SUBCULTURE']),set(event['properties']['subcategory']['enum']))
        legacy=json.loads((Path(__file__).resolve().parents[1]/'schemas/event-result-v4.schema.json').read_text())
        self.assertGreater(len(legacy['properties']['events']['items']['properties']['subcategory']['enum']),len(GROUPS['SUBCULTURE']))

    def test_structured_rejection_has_typed_status_without_secret_or_body(self):
        error=rejection()
        self.assertEqual(400,getattr(error,'status',None))
        self.assertEqual('INVALID_REQUEST',getattr(error,'code',None))
        self.assertNotIn('t'*40,str(error))

    def process_saved(self,error,decision='APPROVE'):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        cfg=configuration();cfg['stateDirectory']=folder.name
        calls=[]
        def request(method,path,body):
            calls.append(copy.deepcopy(body))
            if len(calls)==1:raise error
            return {'verdict':body['verdict']}
        worker=Worker(cfg,Mock());worker.request=request
        extracted={'id':str(uuid.uuid4()),'resultHash':'b'*64,'context':{},'contextHash':'a'*64,'audit':{},'result':copy.deepcopy(RESULT)}
        job={'id':str(uuid.uuid4()),'kind':'CHARACTERS','leaseToken':str(uuid.uuid4()),'context':{'product':{'data':{'images':[]}}},'extraction':extracted}
        with patch.object(worker,'call',return_value=({'verdict':decision,'reason':'Independent original review'},{'openedUrls':[SOURCE]})):
            receipt=worker.process(job)
        return receipt,calls,extracted

    def test_definitive_approval_rejection_records_enrichment_for_fresh_extraction(self):
        receipt,calls,extracted=self.process_saved(rejection())
        self.assertEqual('ENRICH',receipt['verdict']);self.assertEqual(2,len(calls))
        for key in ('leaseToken','extractionId','resultHash','audit'):
            self.assertEqual(calls[0][key],calls[1][key])
        self.assertIn('양쪽 공식 출처',calls[1]['reason'])
        self.assertEqual(RESULT,extracted['result'])

    def test_ambiguous_delivery_lease_conflict_auth_and_other_errors_are_not_rewritten(self):
        for error in (DeliveryError('API delivery failed: TimeoutError'),rejection(409,'CONFLICT'),rejection(403,'FORBIDDEN'),rejection(400,'INVALID_INPUT')):
            with self.subTest(error=str(error)),self.assertRaises(DeliveryError):self.process_saved(error)
        with self.assertRaises(DeliveryError):self.process_saved(rejection(),decision='ENRICH')

    def test_pending_x_does_not_discard_verified_official_sources(self):
        loader=SocialSources([],public=lambda urls:[copy.deepcopy(DOC)],browser=Mock(side_effect=BrowserPending('Public browser capture pending: request')))
        with patch.dict('os.environ',{},clear=True):docs=loader([X,SOURCE],defer_browser_pending=True)
        self.assertTrue(docs[0]['browserPending']);self.assertFalse(docs[0]['available'])
        self.assertTrue(docs[1]['available']);self.assertNotIn('sha256',docs[0])
        with patch.dict('os.environ',{},clear=True),self.assertRaises(BrowserPending):loader([X],defer_browser_pending=True)

    def test_partial_source_collection_never_approves_an_empty_complete_catalog(self):
        loader=SocialSources([],public=lambda urls:[copy.deepcopy(DOC)],browser=Mock(side_effect=BrowserPending('Pending capture')))
        value={'searchStatus':'COMPLETE','coverage':{'completeness':'COMPLETE'},'participants':[],'sales':None}
        with tempfile.TemporaryDirectory() as folder,patch.dict('os.environ',{},clear=True):
            cfg=configuration();cfg['stateDirectory']=folder
            worker=Worker(cfg,Mock(),search=lambda *a,**k:(json.dumps(value),False,{}),source_loader=loader)
            result,audit=worker.call(Path(folder)/'extract','test',{'type':'object'},[],[X,SOURCE])
            self.assertEqual('PARTIAL',result['searchStatus']);self.assertEqual('PARTIAL',result['coverage']['completeness'])
            self.assertEqual([SOURCE],[d['url'] for d in audit['sourceDocuments']])
            self.assertNotIn(X,audit['openedUrls'])
            pending=json.loads((Path(folder)/'extract/source-documents.json').read_text())['documents'][0]
            self.assertTrue(pending['browserPending'])

if __name__=='__main__':unittest.main()
