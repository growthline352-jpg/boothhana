import copy,hashlib,json,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
from graph_worker import Worker,configuration

OWN='https://example.com/test/event/2026'
OTHER='https://example.com/other-booth'
OWN_IMAGE='https://cdn.example.com/own-sale.png'
OTHER_IMAGE='https://cdn.example.com/other-sale.png'

class Api:
    def __init__(self):self.calls=[]
    def request(self,method,path,body=None):
        self.calls.append((path,body))
        if path.endswith('/extract'):return {'id':body['extractionId'],'resultHash':'a'*64}
        return {'verdict':body['verdict']} if path.endswith('/decide') else {}

def doc(url,image,**extra):
    return {'url':url,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-24T00:00:00Z',
            'text':'Original public page','images':[{'imageUrl':image,'pageUrl':url}],**extra}

class SalesImageScopeTests(unittest.TestCase):
    def run_sale(self,*,profile_feed=False,claim_other=False,twitter_alias=False,direct_post=False,own_count=1):
        result=json.loads((Path(__file__).resolve().parents[1]/'examples/v4/sales.json').read_text(encoding='utf-8'))
        result['pageBatch']=None
        other_url='https://x.com/artist/status/999999' if direct_post else OTHER
        other_source={'url':other_url,'kind':'OTHER','access':'ORIGINAL','evidence':'Other booth reference'}
        native_profile='https://x.com/artist'
        owner=('https://twitter.com/artist' if twitter_alias else native_profile) if profile_feed or direct_post else OWN
        if direct_post:owner+='/status/123456'
        page=native_profile+'/status/123456' if profile_feed or direct_post else OWN
        if profile_feed or direct_post:result=json.loads(json.dumps(result).replace(OWN,page))
        if claim_other:result['sales']['sources'].append(other_source)
        context={'input':{},'participant':{'data':{'officialLinks':[owner]}},'event':{'data':{'sources':[other_source]}}}
        documents=[doc(page,OWN_IMAGE,**({'profileUrl':native_profile} if profile_feed or direct_post else {})),doc(other_url,OTHER_IMAGE,**({'profileUrl':native_profile} if direct_post else {}))]
        if own_count>1:documents[0]['images']=[{'imageUrl':OWN_IMAGE+'?part='+str(i),'pageUrl':page} for i in range(own_count)]
        images={};prompts={};api=Api()
        def search(cfg,directory,prompt,schema_path,**kwargs):
            images[directory.name]=[p.read_bytes().decode() for p in kwargs['images']];prompts[directory.name]=prompt
            value=result if directory.name=='extract' else {'verdict':'ENRICH' if claim_other else 'APPROVE','reason':'Independently compared source scope'}
            if directory.name.startswith('images-'):
                start=int(directory.name.split('-')[1]);value={'observations':[{'imageIndex':i,'visibleText':'Actual seller sheet','uncertainties':[]} for i in range(start,start+len(kwargs['images']))]}
            return json.dumps(value).encode(),True,{}
        def fetch(url,hosts,**kwargs):
            raw=url.encode();return raw,'image/png',hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'SALES','contextHash':'a'*64,'context':context}
            with patch('graph_worker.fetch_image',side_effect=fetch) as fetched:
                Worker(cfg,api,search,lambda urls:copy.deepcopy(documents)).process(job)
            calls=[call.args[0] for call in fetched.call_args_list]
        return api,images,prompts,calls

    def test_event_reference_booth_images_are_not_attached_to_another_seller(self):
        api,images,prompts,calls=self.run_sale()
        self.assertEqual({'extract':[OWN_IMAGE],'review':[OWN_IMAGE]},images)
        self.assertEqual([OWN_IMAGE,OWN_IMAGE],calls)
        self.assertEqual('APPROVE',api.calls[-1][1]['verdict'])
        # General event text remains fresh evidence; only unrelated attachments go.
        self.assertTrue(all(OTHER in p for p in prompts.values()))
        self.assertTrue(all(OTHER in {d['url'] for d in body['audit']['sourceDocuments']} for _,body in api.calls))

    def test_owned_posts_from_a_native_profile_feed_keep_their_images(self):
        api,images,_,calls=self.run_sale(profile_feed=True)
        self.assertEqual({'extract':[OWN_IMAGE],'review':[OWN_IMAGE]},images)
        self.assertEqual([OWN_IMAGE,OWN_IMAGE],calls)
        self.assertEqual('APPROVE',api.calls[-1][1]['verdict'])

    def test_reviewer_still_receives_counterevidence_if_extractor_claims_foreign_source(self):
        api,images,_,calls=self.run_sale(claim_other=True)
        self.assertEqual([OWN_IMAGE],images['extract'])
        self.assertEqual([OWN_IMAGE,OTHER_IMAGE],images['review'])
        self.assertEqual([OWN_IMAGE,OWN_IMAGE,OTHER_IMAGE],calls)
        self.assertEqual('ENRICH',api.calls[-1][1]['verdict'])

    def test_twitter_profile_alias_keeps_canonical_x_feed_images(self):
        api,images,_,calls=self.run_sale(profile_feed=True,twitter_alias=True)
        self.assertEqual({'extract':[OWN_IMAGE],'review':[OWN_IMAGE]},images)
        self.assertEqual([OWN_IMAGE,OWN_IMAGE],calls)
        self.assertEqual('APPROVE',api.calls[-1][1]['verdict'])

    def test_link_to_one_post_does_not_include_an_event_reference_to_another_post(self):
        api,images,_,calls=self.run_sale(direct_post=True,twitter_alias=True)
        self.assertEqual({'extract':[OWN_IMAGE],'review':[OWN_IMAGE]},images)
        self.assertEqual([OWN_IMAGE,OWN_IMAGE],calls)
        self.assertEqual('APPROVE',api.calls[-1][1]['verdict'])

    def test_all_five_owned_images_are_read_again_in_independent_review(self):
        api,images,_,calls=self.run_sale(own_count=5)
        expected=[OWN_IMAGE+'?part='+str(i) for i in range(5)]
        self.assertEqual(expected,images['extract']);self.assertEqual(expected,images['review'])
        self.assertEqual(expected+expected,calls)
        self.assertEqual('APPROVE',api.calls[-1][1]['verdict'])
