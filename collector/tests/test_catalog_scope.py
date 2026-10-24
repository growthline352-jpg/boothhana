import copy,json,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
from catalog_scope import comiverse_regions,model_documents,image_reading_prompt
from public_sources import PageText,PublicSources
from graph_worker import Worker,configuration,research_plan

URL='https://app.comiverse.kr/'
IMAGE=URL+'uploads/target.png'
PROFILE='https://x.com/target'

def booth(name='대상',image=IMAGE,profile=PROFILE):
    return '<div class="booth-item" data-booth-name="'+name+'" data-catalog-image="'+image+'" data-info-images="[&quot;'+URL+'uploads/sheet.png&quot;]"><div>'+name+'</div><p>포토카드 3종 1000원 세트가격 아님</p><a href="'+profile+'">작가</a></div>'

def document(html=None):
    html=html or '<h1>코미버스 2026 가을</h1>'+booth()+booth('다른 부스',URL+'uploads/other.png','https://x.com/other')
    p=PageText(URL);p.feed(html)
    return {'url':URL,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-25T00:00:00Z','text':'\n'.join(p.text),'links':p.links,'truncated':False,**comiverse_regions(URL,html,PageText)}

def scope(**data):
    return {'kind':'SALES','participant':{'data':{'registrationName':'대상','images':[{'pageUrl':URL,'imageUrl':IMAGE}],**data}}}

class CatalogScopeTests(unittest.TestCase):
    def test_exact_name_and_unique_anchor_select_all_target_facts_and_images_without_changing_snapshot(self):
        doc=document();saved=copy.deepcopy(doc);views,proof=model_documents([doc],scope())
        self.assertEqual(saved,doc);view=views[0]
        self.assertIn('코미버스 2026 가을',view['text']);self.assertIn('3종 1000원 세트가격 아님',view['text'])
        self.assertNotIn('다른 부스',view['text']);self.assertEqual([PROFILE],view['links'])
        self.assertEqual([IMAGE,URL+'uploads/sheet.png'],[i['imageUrl'] for i in view['images']])
        self.assertEqual('a'*64,view['sha256']);self.assertFalse(view['evidenceScope']['wholeCatalogProvided'])
        self.assertEqual(2,proof[0]['observedCatalogRows']);self.assertNotIn('catalogRegions',view)

    def test_unique_profile_can_anchor_but_name_alone_or_shared_anchor_cannot(self):
        for data in ({'images':[]},{'registrationName':'다른 이름'},
                     {'images':[],'officialLinks':[URL]}):
            views,proof=model_documents([document()],scope(**data));self.assertFalse(proof)
            self.assertIn('다른 부스',views[0]['text'])
        views,proof=model_documents([document()],scope(images=[],officialLinks=[PROFILE]));self.assertTrue(proof)
        shared=document('<h1>회차</h1>'+booth()+booth('동명이인',IMAGE,PROFILE))
        self.assertFalse(model_documents([shared],scope())[1])
        separate_days=document('<h1>회차</h1>'+booth()+booth('대상',URL+'sunday.png','https://x.com/sunday'))
        self.assertFalse(model_documents([separate_days],scope())[1])

    def test_shared_booth_is_one_complete_region_and_member_names_never_select_a_fragment(self):
        doc=document('<h1>행사</h1>'+booth('프오, 하루')+'<p>공통 안내</p>')
        self.assertFalse(model_documents([doc],scope(registrationName='프오'))[1])
        views,proof=model_documents([doc],scope(registrationName='프오, 하루'))
        self.assertTrue(proof);self.assertIn('프오, 하루',views[0]['text'])

    def test_unavailable_truncated_and_other_kinds_keep_full_source(self):
        for change,kind in [({'available':False},'SALES'),({'truncated':True},'SALES'),({},'CREATOR'),({},'PARTICIPANTS')]:
            doc={**document(),**change};s={**scope(),'kind':kind}
            views,proof=model_documents([doc],s);self.assertFalse(proof)
            self.assertEqual(doc['text'],views[0]['text']);self.assertNotIn('catalogRegions',views[0])

    def test_changed_nested_or_incomplete_markup_never_enables_projection(self):
        for html in [booth()[:-6],booth().replace('<p>','<div class="booth-item"><p>'),booth().replace('[&quot;','[broken&quot;')]:
            self.assertEqual({},comiverse_regions(URL,html,PageText))
        for url in ['https://app.comiverse.kr.evil.test/','https://app.comiverse.kr/start/','https://app.comiverse.kr/?event=2']:
            self.assertEqual({},comiverse_regions(url,booth(),PageText))

    def test_native_parser_retains_full_text_and_original_hash(self):
        html='<h1>행사</h1><p>'+('공개 행사 안내 '*20)+'</p>'+booth()+booth('다른 부스',URL+'other.png','https://x.com/other')
        def fetch(url,hosts,**kwargs):return ('User-agent: *\nAllow: /','robots') if url.endswith('/robots.txt') else (html,'full-http-sha')
        doc=PublicSources([],fetch=fetch)([URL])[0]
        self.assertEqual('full-http-sha',doc['sha256']);self.assertIn('다른 부스',doc['text'])
        self.assertEqual(2,len(doc['catalogRegions']))

    def test_public_modal_fields_are_included_without_order_or_private_attributes(self):
        html=booth().replace('data-booth-name=', 'data-order-number="PRIVATE_SENTINEL" data-description="소개 &amp; 옵션" data-x="https://x.com/target" data-shop="https://shop.example/target" data-booth-name=')
        doc=document('<h1>행사</h1>'+html);view=model_documents([doc],scope())[0][0]
        self.assertIn('소개 & 옵션',view['text']);self.assertIn('https://shop.example/target',view['links'])
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(doc,ensure_ascii=False))

    def test_card_body_images_are_not_lost_when_modal_also_has_images(self):
        html=booth().replace('<p>', '<img src="/extra-sale-sheet.png"><p>')
        doc=document('<h1>행사</h1>'+html);view=model_documents([doc],scope())[0][0]
        self.assertEqual([IMAGE,URL+'uploads/sheet.png',URL+'extra-sale-sheet.png'],[i['imageUrl'] for i in view['images']])

    def test_scoped_extraction_and_review_refetch_originals_and_keep_every_target_image(self):
        seen=[];loads=[]
        def loader(urls):
            loads.append(list(urls));doc=document();doc['sha256']=str(len(loads))*64;return [doc]
        def search(cfg,directory,prompt,schema_path,**kwargs):
            seen.append((prompt,len(kwargs.get('images',[]))))
            return '{"verdict":"ENRICH","reason":"unverified"}',False,{}
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;worker=Worker(cfg,object(),search,loader)
            with patch('graph_worker.fetch_image',return_value=(b'bytes','image/png','b'*64)):
                audits=[worker.call(Path(temp)/phase,'CANDIDATE',{'type':'object'},[],[URL],auto_sns_images=True,source_scope=scope(),review=phase=='review')[1] for phase in ['extract','review']]
            self.assertEqual([[URL],[URL]],loads)
            self.assertEqual(['1'*64,'2'*64],[a['sourceDocuments'][0]['sha256'] for a in audits])
            self.assertTrue(all(count==2 and '다른 부스' not in prompt for prompt,count in seen))

    def test_event_only_venue_is_deferred_but_required_sources_and_creator_anchors_survive(self):
        venue='https://official.example/venue'
        context={'event':{'data':{'sources':[{'url':venue,'kind':'VENUE','access':'ORIGINAL'},{'url':URL,'kind':'OFFICIAL','access':'ORIGINAL'}]}}}
        for kind in ['SALES','CREATOR']:
            self.assertNotIn(venue,research_plan(kind,context)['urls'])
            self.assertIn(venue,research_plan(kind,context,[venue])['urls'])
            for key,value in [('input',{'pageUrl':venue}),('creatorProvenance',[{'sources':[{'url':venue,'access':'ORIGINAL'}]}]),('participant',{'data':{'officialLinks':[venue]}})]:
                self.assertIn(venue,research_plan(kind,{**context,key:value})['urls'])
        self.assertIn(venue,research_plan('EVENT',context)['urls'])
        for event_extra in [{'officialUrl':venue},{'sources':context['event']['data']['sources']+[{'url':venue,'kind':'OFFICIAL','access':'ORIGINAL'}]}]:
            c={'event':{'data':{**context['event']['data'],**event_extra}}}
            self.assertIn(venue,research_plan('SALES',c)['urls'])

    def test_resumed_sales_review_reopens_candidate_only_venue_reference(self):
        venue='https://official.example/venue';loads=[];deliveries=[]
        context={'event':{'data':{'sources':[{'url':venue,'kind':'VENUE','access':'ORIGINAL'}]}}}
        candidate={'sources':[{'url':venue,'access':'ORIGINAL','evidence':'Candidate sales fact'}]}
        def loader(urls):
            loads.append(list(urls));return [{'url':venue,'available':True,'sha256':'c'*64,'capturedAt':'2026-10-25T00:00:00Z','text':'Current original contradicts candidate'}]
        class Api:
            def request(self,method,path,body):deliveries.append(body);return {'verdict':body['verdict']}
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            worker=Worker(cfg,Api(),lambda *a,**kw:('{"verdict":"ENRICH","reason":"Original contradicts candidate"}',False,{}),loader)
            job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'SALES','context':context,
                 'extraction':{'id':str(uuid.uuid4()),'resultHash':'b'*64,'contextHash':'a'*64,'context':context,'result':candidate,'audit':{'imageHashes':[]}}}
            worker.process(job)
            self.assertEqual([[venue]],loads);self.assertEqual('ENRICH',deliveries[-1]['verdict'])

    def test_batch_transcription_does_not_repeat_context_or_candidate_but_final_receives_full_evidence(self):
        calls=[];doc=document();doc['text']+='\nFULL_CONTEXT_SENTINEL'
        def search(cfg,directory,prompt,schema_path,**kwargs):
            calls.append((directory.name,prompt,len(kwargs.get('images',[]))))
            if directory.name.startswith('images-'):
                start=int(directory.name.split('-')[1]);return json.dumps({'observations':[{'imageIndex':i,'visibleText':'가격과 단위','uncertainties':[]} for i in range(start,min(start+4,5))]}),False,{}
            return '{"verdict":"ENRICH","reason":"candidate mismatch"}',False,{}
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp;paths=[]
            for n in range(5):
                p=Path(temp)/f'{n}.png';p.write_bytes(b'original');paths.append(p)
            Worker(cfg,object(),search,lambda urls:[doc]).call(Path(temp)/'review','CANDIDATE_SENTINEL',{'type':'object'},paths,[URL],review=True)
            self.assertEqual([4,1,5],[n for _,_,n in calls])
            for _,prompt,_ in calls[:-1]:
                self.assertNotIn('FULL_CONTEXT_SENTINEL',prompt);self.assertNotIn('CANDIDATE_SENTINEL',prompt)
            self.assertIn('FULL_CONTEXT_SENTINEL',calls[-1][1]);self.assertIn('CANDIDATE_SENTINEL',calls[-1][1])
            self.assertIn('가격과 단위',calls[-1][1]);self.assertEqual(doc,json.loads((Path(temp)/'review/source-documents.json').read_text(encoding='utf-8'))['documents'][0])

if __name__=='__main__':unittest.main()
