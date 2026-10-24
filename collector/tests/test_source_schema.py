import copy,unittest,json,tempfile,uuid
from pathlib import Path
import jsonschema
from graph_worker import schema,Worker,configuration
from source_schema import constrain_source_schema

CHANNEL='https://www.postype.com/@artist'
ROSTER='https://dongne.co/events/df261002/circles'
def channel(verified=True,next_url=CHANNEL+'?page=2'):
 return {'url':CHANNEL,'available':True,'sha256':'a'*64,'channelPageVerified':verified,'pagination':{'nextPageUrl':next_url}}
def roster(url=ROSTER):
 ids=[str(100+i) for i in range(24)]
 return {'url':url,'available':True,'sha256':'b'*64,'rosterEntries':[{'sourceEntryId':i,'detailUrl':url+'/'+i} for i in ids],
  'pagination':{'entryUrls':[url+'/'+i for i in ids],'rangeStart':1,'rangeEnd':24}}

class NativeSourceSchemaTests(unittest.TestCase):
 def test_process_supplies_fresh_constraints_to_cli_and_never_repairs_a_bad_output(self):
  from test_graph_worker import FakeApi,page_result
  for model_next in (None,CHANNEL+'?page=2'):
   with self.subTest(model_next=model_next),tempfile.TemporaryDirectory() as temp:
    cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();seen=[]
    candidate={'profile':{'name':'Artist','kind':'ARTIST','aliases':[],'profileUrl':CHANNEL},'sources':[{'url':CHANNEL,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'Public channel'}],
     'goods':[],'socialAccounts':[],'socialPageComplete':False,'productCoverage':[],'eventLeads':[],'identityDecision':{'action':'KEEP','canonicalId':None,'evidence':[]},'nextPageUrl':model_next,'coverage':'PARTIAL','pageBatch':None}
    doc={**channel(),'capturedAt':'2026-10-24T00:00:00Z','text':'Current public channel'}
    def search(config,directory,prompt,schema_path,**kwargs):
     if directory.name=='extract':seen.append(json.loads(schema_path.read_text(encoding='utf-8'))['properties']['nextPageUrl']['enum'])
     (directory/'codex.jsonl').write_text(json.dumps(page_result(CHANNEL)))
     value={'profileUrls':[]} if directory.name=='social-discovery' else candidate if directory.name=='extract' else {'verdict':'APPROVE','reason':'Checked current originals'}
     return json.dumps(value).encode(),True,{}
    job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'contextHash':'a'*64,'kind':'CREATOR','context':{'input':{'pageUrl':CHANNEL},'creator':{'data':{'profileUrl':CHANNEL}}}}
    worker=Worker(cfg,api,search,lambda urls:[doc,{'url':'https://x.com/artist','available':True,'browserPartial':True,'sha256':'c'*64,'capturedAt':'2026-10-24T00:00:01Z','text':'Public auxiliary profile; history incomplete'}])
    if model_next is None:
     with self.assertRaises(jsonschema.ValidationError):worker.process(job)
     self.assertEqual([],api.calls)
    else:
     worker.process(job);self.assertEqual('APPROVE',api.calls[-1][2]['verdict']);self.assertEqual(model_next,api.calls[0][2]['result']['nextPageUrl'])
    self.assertEqual([[CHANNEL+'?page=2']],seen)
 def test_model_must_return_observed_cursor_and_partial_while_next_page_remains(self):
  base=schema('CREATOR');before=copy.deepcopy(base)
  constrained,proof=constrain_source_schema(base,[channel()],{'kind':'CREATOR','pageUrl':CHANNEL})
  self.assertEqual(base,before);self.assertEqual([CHANNEL+'?page=2'],constrained['properties']['nextPageUrl']['enum'])
  for bad in (None,CHANNEL+'?page=3'):
   with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(bad,constrained['properties']['nextPageUrl'])
  jsonschema.validate(CHANNEL+'?page=2',constrained['properties']['nextPageUrl'])
  with self.assertRaises(jsonschema.ValidationError):jsonschema.validate('COMPLETE',constrained['properties']['coverage'])
  self.assertTrue(proof['channelPageVerified'])
 def test_unverified_current_channel_cannot_invent_a_cursor_or_completion(self):
  for docs in ([channel(False)],[],[channel(),channel()]):
   constrained,_=constrain_source_schema(schema('CREATOR'),docs,{'kind':'CREATOR','pageUrl':CHANNEL})
   self.assertEqual([None],constrained['properties']['nextPageUrl']['enum'])
   with self.assertRaises(jsonschema.ValidationError):jsonschema.validate('COMPLETE',constrained['properties']['coverage'])
 def test_known_last_page_has_null_cursor_without_forcing_unconfirmed_facts_complete(self):
  s,_=constrain_source_schema(schema('CREATOR'),[channel(next_url=None)],{'kind':'CREATOR','pageUrl':CHANNEL})
  self.assertEqual([None],s['properties']['nextPageUrl']['enum']);self.assertIn('PARTIAL',s['properties']['coverage']['enum'])
 def test_roster_cannot_drop_three_hidden_observations_or_invent_provider_ids(self):
  base=schema('PARTICIPANTS');before=copy.deepcopy(base)
  s,proof=constrain_source_schema(base,[roster()],{'kind':'PARTICIPANTS'})
  self.assertEqual(base,before);p=s['properties']['participants']
  self.assertEqual((24,24),(p['minItems'],p['maxItems']));self.assertEqual(24,proof['currentPageRows'])
  count_schema={**p,'items':{}}
  with self.assertRaises(jsonschema.ValidationError):jsonschema.validate([{}]*21,count_schema)
  jsonschema.validate([{}]*24,count_schema)
  field=p['items']['properties']['sourceEntryId']
  for bad in (None,'obs_fake','999999'):
   with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(bad,field)
  self.assertEqual([str(100+i) for i in range(24)],field['enum'])
 def test_detail_and_sales_do_not_inherit_a_supporting_roster_scope(self):
  for kind,page in (('PARTICIPANTS',ROSTER+'/174217'),('SALES',ROSTER),('CREATOR','https://x.com/artist')):
   base=schema(kind);s,proof=constrain_source_schema(base,[roster()],{'kind':kind,'pageUrl':page})
   self.assertEqual(base,s);self.assertIsNone(proof)
 def test_ambiguous_changed_or_unavailable_native_inventory_does_not_force_a_guess(self):
  bad=roster();bad['rosterEntries'][0]['sourceEntryId']='99999'
  hidden=roster();hidden['available']=False
  for docs in ([roster(),roster('https://dongne.co/events/other/circles')],[bad],[hidden],[]):
   base=schema('PARTICIPANTS');s,proof=constrain_source_schema(base,docs,{'kind':'PARTICIPANTS'})
   self.assertEqual(base,s);self.assertIsNone(proof)
