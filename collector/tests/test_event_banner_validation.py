"""Real collector delivery regressions with fake HTTP, CLI and ingest boundaries."""
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

import event_banner_validation as banners
import import_manual_events
import run
import weekly
from official_poster_sources import parse_official_document, IMAGE_CONTEXT_POLICY

PAGE = 'https://official.example/event/2026'
IMAGE = 'https://official.example/poster.png'
SCOPE = dict(region='SEOUL_GYEONGGI', timezone='Asia/Seoul', startDate='2026-10-01', endDate='2026-12-31')


class EventBannerValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = weekly.load_config(None)
        self.cfg.update(stateDirectory=str(self.root/'state'), blockedSourceHosts=[], autoApproveCollectedData=True)
        result = json.loads((run.ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))
        self.result = deepcopy(result)
        self.result.pop('eventEvidence', None)
        self.event = deepcopy(result['events'][0])
        self.event.update(name='2026 테스트 문구 행사', edition='2026', organizer='테스트 주최',
                          venueName='코엑스', address='서울특별시 강남구 영동대로 513',
                          description='문구 행사 안내', subjects=['문구'], eventFormat='SINGLE_HOST')
        self.event['occurrences'] = [dict(startDate='2026-10-10', endDate='2026-10-11', startTime='12:00', endTime='17:00')]
        self.event['sources'] = [dict(url=PAGE, kind='OFFICIAL', access='ORIGINAL', evidence='행사 공식 안내')]
        self.event['banners'] = [dict(imageUrl=IMAGE, pageUrl=PAGE, rights='UNKNOWN', rightsEvidence=None, matchesEdition=True)]
        self.event['warnings'] = []; self.event['discoveryLinks'] = []
        self.result['events'] = [deepcopy(self.event)]
        self.result['sourceCoverage'] = [dict(channel='ORGANIZER_OFFICIAL', status='CHECKED',
                                              queries=['테스트 행사 포스터'], checkedUrls=[PAGE], notes='공식 안내')]
        self.env = patch.dict(os.environ, {'BOOTH_COLLECTOR_TOKEN': 'local-test-'*4})
        self.env.start(); self.addCleanup(self.env.stop)

    def html(self, name='2026 테스트 문구 행사', image='/poster.png'):
        return '<main><h1>'+name+'</h1><p>행사 개최일: 2026.10.10 ~ 2026.10.11</p><img src="'+image+'" alt="'+name+' 포스터"></main>'

    def body(self):
        return dict(schemaVersion='1', runId=str(uuid.uuid4()), startedAt=run.utcnow(), finishedAt=run.utcnow(),
                    executionMode='CLI', webSearchObserved=True, scope=SCOPE, result=deepcopy(self.result))

    def source(self, html=None, page=PAGE, event=None):
        return {**parse_official_document(html or self.html(), page, '2026-10-06', (event or self.event)['name']), 'status':'READ'}

    def validate(self, event=None, html=None, **kwargs):
        value = deepcopy(event or self.event)
        with patch.object(banners, 'allowed_by_robots', return_value=True), patch.object(banners, 'fetch_html', return_value=(html or self.html(), '')):
            return banners.validate_event_banners([value], self.cfg, self.root/'source', **kwargs)

    def test_another_event_or_edition_and_missing_original_image_are_excluded_but_facts_stay(self):
        for html, state in [(self.html('2026 연말 채용 설명회'), 'EVENT_OR_EDITION_MISMATCH'),
                            (self.html().replace('2026','2025'), 'EVENT_OR_EDITION_MISMATCH'),
                            (self.html(image='/other.png'), 'IMAGE_NOT_IN_ORIGINAL')]:
            with self.subTest(state=state):
                events, report = self.validate(html=html)
                self.assertEqual(events[0], {**self.event, 'banners':[]})
                self.assertEqual(report[0]['state'], state)
        self.assertTrue(self.event['banners'])

    def test_native_alias_and_numbered_edition_checks_survive_model_boolean(self):
        for name, title in [('2026 테스트 문구 행사','테스트-문구 행사 2026'),
                            ('제38회 플래툰 컨벤션','38회 플래툰 컨벤션 2026'), ('AGF 2026','AGF2026')]:
            event = {**deepcopy(self.event), 'name':name}
            event['banners'][0]['matchesEdition'] = False
            with self.subTest(name=name):
                events, report = self.validate(event, self.html(title))
                self.assertTrue(events[0]['banners'][0]['matchesEdition'])
                self.assertEqual(report[0]['state'], 'VERIFIED_ORIGINAL')
        event = {**deepcopy(self.event), 'name':'제38회 플래툰 컨벤션'}
        self.assertEqual(self.validate(event, self.html('37회 플래툰 컨벤션 2026'))[0][0]['banners'], [])

    def test_unread_blocked_or_unofficial_sources_defer_only_banner_without_fetching(self):
        for edit, state in [({'kind':'COMMUNITY'}, 'NO_OFFICIAL_ORIGINAL_SOURCE'),
                            ({'access':'SEARCH_SNIPPET'}, 'NO_OFFICIAL_ORIGINAL_SOURCE')]:
            event=deepcopy(self.event);event['sources'][0].update(edit)
            with patch.object(banners,'fetch_html') as fetch:
                events,report=banners.validate_event_banners([event],self.cfg,self.root/'source')
                self.assertEqual(events[0],{**event,'banners':[]});self.assertEqual(report[0]['state'],state);fetch.assert_not_called()
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',side_effect=TimeoutError('temporary')):
            events,report=banners.validate_event_banners([self.event],self.cfg,self.root/'source')
        self.assertEqual(events[0],{**self.event,'banners':[]});self.assertEqual(report[0]['state'],'ORIGINAL_NOT_READ')
        cfg={**self.cfg,'blockedSourceHosts':['official.example']}
        with patch.object(banners,'fetch_html') as fetch:
            events,report=banners.validate_event_banners([self.event],cfg,self.root/'source')
            self.assertEqual(report[0]['state'],'SOURCE_POLICY_DENIED');fetch.assert_not_called()
        dotted=deepcopy(self.event);dotted['sources'][0]['url']='https://official.example./event/2026'
        dotted['banners'][0].update(pageUrl=dotted['sources'][0]['url'],imageUrl='https://cdn.example/poster.png')
        with patch.object(banners,'fetch_html') as fetch:
            events,report=banners.validate_event_banners([dotted],cfg,self.root/'source')
            self.assertEqual(report[0]['state'],'SOURCE_POLICY_DENIED');fetch.assert_not_called()

    def test_native_sites_and_tmm_originals_and_linked_notice_are_supported(self):
        for source_type, page in [('GOOGLE_SITES','https://sites.google.com/view/event'),
                                  ('TMM_PUBLIC_PRODUCT','https://takemm.com/prod/view/71267')]:
            event=deepcopy(self.event);event['sources'][0]['url']=page;event['banners'][0]['pageUrl']=page
            doc=dict(sourceUrl=page,status='READ',sourceType=source_type,title='공식 안내',bodyText='2026 테스트 문구 행사',
                     imageContextPolicy=IMAGE_CONTEXT_POLICY,images=[dict(url=IMAGE,role='PAGE_PREVIEW',nativeLabels=[],sectionHeadings=[])])
            with self.subTest(source_type=source_type),patch.object(banners,'fetch_html') as fetch:
                events,report=banners.validate_event_banners([event],self.cfg,self.root/'source',source_documents=[doc])
                self.assertEqual(report[0]['state'],'VERIFIED_ORIGINAL');self.assertTrue(events[0]['banners']);fetch.assert_not_called()
        event=deepcopy(self.event);child=PAGE+'/notice';event['banners'][0]['pageUrl']=child
        root=self.source();root['childUrls']=[child];child_doc=self.source(page=child)
        events,report=banners.validate_event_banners([event],self.cfg,self.root/'source',source_documents=[root,child_doc],allow_fetch=False)
        self.assertTrue(events[0]['banners']);self.assertEqual(report[0]['state'],'VERIFIED_ORIGINAL')

    def test_display_venue_suffix_is_only_removed_when_bound_to_the_registered_venue(self):
        event=deepcopy(self.event);event.update(name='아스토믹 Pop-Up Open! · 롯데월드몰',venueName='롯데월드몰 B1F')
        events,report=self.validate(event,self.html('아스토믹 Pop-Up Open!'))
        self.assertTrue(events[0]['banners']);self.assertEqual(report[0]['matchedName'],'아스토믹 Pop-Up Open!')
        event['venueName']='코엑스'
        self.assertEqual(self.validate(event,self.html('아스토믹 Pop-Up Open!'))[0][0]['banners'],[])
        event['venueName']='롯데월드몰 B1F'
        self.assertEqual(self.validate(event,self.html('다른 캐릭터 Pop-Up Open!'))[0][0]['banners'],[])

    def test_tmm_tracking_url_uses_the_native_product_identity_not_another_product(self):
        event=deepcopy(self.event);page='https://takemm.com/prod/view/71267/?utm_source=test'
        event['sources'][0]['url']=page;event['banners'][0]['pageUrl']=page
        doc=dict(sourceUrl='https://takemm.com/prod/view/71267',status='READ',sourceType='TMM_PUBLIC_PRODUCT',title='공식 안내',
                 bodyText='2026 테스트 문구 행사',images=[dict(url=IMAGE,role='PAGE_PREVIEW')])
        events,report=banners.validate_event_banners([event],self.cfg,self.root/'source',source_documents=[doc],allow_fetch=False)
        self.assertTrue(events[0]['banners']);self.assertEqual(report[0]['state'],'VERIFIED_ORIGINAL')
        event['banners'][0]['pageUrl']='https://takemm.com/prod/view/99999'
        self.assertEqual(banners.validate_event_banners([event],self.cfg,self.root/'source',source_documents=[doc],allow_fetch=False)[0][0]['banners'],[])

    def test_section_parsed_for_another_event_cannot_be_reused(self):
        doc=self.source(self.html('2026 다른 행사'));doc['sourceScope']='EVENT_SECTION'
        events,report=banners.validate_event_banners([self.event],self.cfg,self.root/'source',source_documents=[doc],allow_fetch=False)
        self.assertEqual(events[0]['banners'],[]);self.assertEqual(report[0]['state'],'EVENT_OR_EDITION_MISMATCH')

    def test_fact_only_document_is_not_mistaken_for_a_complete_image_inventory(self):
        fact=dict(sourceUrl=PAGE,status='READ',bodyText='2026 테스트 문구 행사 행사 개최일 2026.10.10 ~ 2026.10.11')
        events,report=self.validate(source_documents=[fact])
        self.assertTrue(events[0]['banners']);self.assertEqual(report[0]['state'],'VERIFIED_ORIGINAL')

    def test_real_enrichment_job_and_delivery_drop_wrong_banner_without_losing_event_facts(self):
        target=deepcopy(self.event);target['banners']=[];target['admission']=None
        observed=deepcopy(self.result);observed['events'][0]['admission']='무료'
        wrong=self.html('2026 연말 채용 설명회')
        sent=[]
        class Api:
            def request(self,method,path,data=None,**kwargs):
                if path.endswith('/heartbeat'):return {}
                sent.append((path,deepcopy(data)))
                return dict(runId=data['runId'],status='SUCCESS',inserted=0,changed=1,unchanged=0,rejected=0)
        def cli(cfg,folder,prompt,schema,**kwargs):
            audit=dict(type='item.completed',item=dict(type='web_search',action=dict(type='open',url=PAGE)))
            (folder/'codex.jsonl').write_text(json.dumps(audit)+'\n',encoding='utf-8')
            return json.dumps(observed,ensure_ascii=False).encode(),True,{}
        pipeline=weekly.Pipeline(self.cfg,self.root/'enrich',SCOPE);pipeline.api=Api()
        # Actual collected original describes another event's poster; the CLI
        # still claims matchesEdition=true for that exact native image URL.
        wrong_doc=self.source(wrong)
        with patch.object(weekly,'collect_detail_sources',return_value=([wrong_doc],[])),patch.object(weekly,'execute_search',side_effect=cli),redirect_stdout(io.StringIO()):
            receipt=pipeline.enrich_event(dict(id=1,revision=1,event=target))
        saved=sent[0][1]['result']['events'][0]
        self.assertEqual(receipt['status'],'SUCCESS');self.assertEqual(saved['banners'],[])
        self.assertEqual(saved['admission'],'무료');self.assertEqual(saved['occurrences'],target['occurrences'])
        report=json.loads((self.root/'enrich/jobs/enrichment-1-1/banner-validation.json').read_text(encoding='utf-8'))
        self.assertEqual(report['rejected'],1);self.assertEqual(report['observations'][0]['state'],'EVENT_OR_EDITION_MISMATCH')
        self.assertEqual([path for path,_ in sent],['/api/internal/subculture/batches'])

    def test_all_pipeline_event_batch_keys_share_the_final_native_gate(self):
        pipeline=weekly.Pipeline(self.cfg,self.root/'keys',SCOPE,dry_run=True)
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(self.html('2026 연말 채용 설명회'),'')),redirect_stdout(io.StringIO()):
            for key in ('candidate-tested-1','discovery','official-popup-tested','official-fill-tested','lotte-worldmall-official'):
                pipeline.deliver(key,self.body(),legacy=True)
                saved=json.loads((pipeline.job_dir(key)/'payload.json').read_text(encoding='utf-8'))
                self.assertEqual(saved['result']['events'][0],{**self.event,'banners':[]})

    def test_old_unsent_payload_gets_new_deterministic_id_and_response_loss_replays_exact_bytes(self):
        pipeline=weekly.Pipeline(self.cfg,self.root/'replay',SCOPE)
        original=self.body();job=pipeline.job_dir('old');run.write_json(job/'payload.json',original)
        sent=[]
        class Api:
            def request(self,method,path,data=None,**kwargs):
                sent.append(deepcopy(data))
                if len(sent)==1:raise OSError('response lost')
                return dict(runId=data['runId'],status='SUCCESS',inserted=1,changed=0,unchanged=0,rejected=0)
        pipeline.api=Api()
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(self.html('2026 연말 채용 설명회'),'')) as fetch,redirect_stdout(io.StringIO()):
            with self.assertRaises(weekly.DeliveryError):pipeline.deliver('old',original,legacy=True)
            pipeline.replay_pending()
            self.assertEqual(fetch.call_count,1)
        self.assertEqual(sent[0],sent[1]);self.assertNotEqual(sent[0]['runId'],original['runId'])
        report=json.loads((job/'banner-validation.json').read_text(encoding='utf-8'))
        self.assertEqual(json.loads((job/report['originalPayload']).read_text(encoding='utf-8')),original)
        repeat,_=banners.guard_batch_banners(original,self.cfg,self.root/'deterministic',allow_fetch=False)
        self.assertEqual(repeat['runId'],sent[0]['runId'])
        with patch.object(banners,'fetch_html',side_effect=AssertionError('completed request reopened')):
            pipeline.deliver('old',self.body(),legacy=True)
        self.assertEqual(len(sent),2)

    def test_standalone_run_and_retry_batch_apply_gate_and_keep_receipted_request_complete(self):
        cfg=dict(apiBaseUrl='http://localhost:8080',tokenEnv='BOOTH_COLLECTOR_TOKEN',stateDirectory=str(self.root/'old-run'),
                 codexExecutable='unused',codexHome=None,model=None,timeoutSeconds=900,httpTimeoutSeconds=15)
        config=self.root/'run-config.json';run.write_json(config,cfg)
        result=deepcopy(self.result);result.pop('sourceCoverage',None)
        for event in result['events']:
            event.pop('eventFormat',None);event.pop('discoveryLinks',None)
        input_file=self.root/'input.json';run.write_json(input_file,result)
        sent=[]
        def send(base,token,batch,timeout):
            sent.append(deepcopy(batch));return dict(runId=batch['runId'],status='SUCCESS')
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(self.html('2026 연말 채용 설명회'),'')),patch.object(run,'send_batch',side_effect=send),redirect_stdout(io.StringIO()):
            self.assertEqual(run.main(['--config',str(config),'--input',str(input_file),'--start','2026-10-01','--end','2026-12-31']),0)
            self.assertEqual(sent[0]['result']['events'][0]['banners'],[])
            old=self.root/'retry';old.mkdir();batch=self.body();batch['result']=deepcopy(result);run.write_json(old/'batch.json',batch)
            self.assertEqual(run.main(['--config',str(config),'--retry-batch',str(old/'batch.json')]),0)
            self.assertEqual(sent[1]['result']['events'][0]['banners'],[])
            self.assertEqual(run.main(['--config',str(config),'--retry-batch',str(old/'batch.json')]),0)
        self.assertEqual(len(sent),2)

    def test_manual_import_transport_also_uses_native_banner_gate(self):
        config=self.root/'import-config.json';run.write_json(config,self.cfg)
        input_file=self.root/'import-events.json';run.write_json(input_file,self.result)
        sent=[]
        class Api:
            def __init__(self,*args):pass
            def request(self,method,path,data):
                sent.append(deepcopy(data));return dict(runId=data['runId'],status='SUCCESS')
        with patch.object(banners,'allowed_by_robots',return_value=True),patch.object(banners,'fetch_html',return_value=(self.html('2026 연말 채용 설명회'),'')),patch.object(import_manual_events,'Api',Api):
            receipt=import_manual_events.ingest(config,input_file,None,'local-token'*4,'2026-10-01','2026-12-31')
        self.assertEqual(receipt['status'],'SUCCESS');self.assertEqual(sent[0]['result']['events'][0],{**self.event,'banners':[]})


if __name__=='__main__':
    unittest.main()
