#!/usr/bin/env python3
"""Batch floorplan discovery and vision; no automatic rights grant or publication.
Weekly all due upcoming events; --imminent checks due events within 14 days only.
"""
from __future__ import annotations
import argparse,hashlib,json,os,sys,time,uuid
from pathlib import Path
from datetime import datetime
import jsonschema
from run import ROOT,SEOUL,RunError,run_lock,execute_search,utcnow,write_json
from weekly import load_config
from catalog_transport import Api
from media_fetch import fetch_image
from floorplan_geometry import tiles,merge_tiles,EXTRACTOR
from floorplan_contract import validate_payload,input_fingerprint,result_fingerprint
from rules import public_url
BASE='/api/internal/subculture/v4/floorplans'

class FloorplanBatch:
    def __init__(self,cfg,folder:Path,*,dry=False,fixtures:Path|None=None,api=None,event_file:Path|None=None):
        self.event_file=event_file;self.cfg=cfg;self.folder=folder;folder.mkdir(parents=True,exist_ok=True);self.dry=dry;self.fixtures=fixtures
        self.api=api if api is not None else (None if dry else Api(cfg['apiBaseUrl'],os.getenv(cfg['tokenEnv'],''),cfg['httpTimeoutSeconds']))
        self.started=time.monotonic();self.calls=0;self.issues=[];self.events=[]
        self.meta_path=folder/'floorplans.json';self.meta=json.loads(self.meta_path.read_text()) if self.meta_path.exists() else {'version':8,'runId':str(uuid.uuid4()),'dryRun':dry,'startedAt':utcnow(),'state':'RUNNING'}
        if self.meta['version']!=8 or self.meta['dryRun']!=dry:raise RunError('Different checkpoint version/mode')
        self.lease=self.meta['runId'];write_json(self.meta_path,self.meta)
    def request(self,method,path,data=None,**kw):return self.api.request(method,BASE+path,data,**kw)
    def budget(self,cli=False):
        if time.monotonic()-self.started>self.cfg['floorplanMaxMinutes']*60:raise RunError('Floorplan time budget exhausted; resume stored tiles in next batch')
        if cli and self.calls>=self.cfg['floorplanMaxCliCalls']:raise RunError('Floorplan CLI call budget exhausted; completed tile results are retained')
    def heartbeat(self,event):
        if self.api:self.request('POST',f'/events/{event}/heartbeat',{'leaseId':self.lease})
    def job(self,path:Path,prompt,schema,*,images=None,fixture=None):
        self.budget();path.mkdir(parents=True,exist_ok=True)
        cached=path/'result.json'
        schema_path=ROOT/'schemas'/schema
        fingerprint=input_fingerprint(prompt,schema_path,images)
        if cached.exists():
            try:
                value=json.loads(cached.read_text(encoding='utf-8'))
                audit=json.loads((path/'audit.json').read_text(encoding='utf-8'))
                validate_payload(value,schema_path)
                # The filename/version alone does not prove identical input bytes.
                # Interrupted paired writes fail closed because the result digest differs.
                if (audit.get('inputSha256')==fingerprint['inputSha256']
                    and audit.get('resultSha256')==result_fingerprint(value)
                    and (self.dry or images or audit.get('webSearchObserved') is True)
                    and value.get('status')!='ERROR'):
                    return value
            except (OSError,ValueError,TypeError,AttributeError,jsonschema.ValidationError):
                pass
            # Keep the old file until a valid replacement is available, but never reuse it.

        self.budget(cli=True);self.calls+=1
        if self.fixtures:
            raw=(self.fixtures/fixture).read_bytes();observed=False
        else:
            remaining=max(1,int(self.cfg['floorplanMaxMinutes']*60-(time.monotonic()-self.started)))
            raw,observed,_=execute_search({**self.cfg,'timeoutSeconds':min(self.cfg['timeoutSeconds'],1200,remaining)},path,prompt,ROOT/'schemas'/schema,images=images,web_search=not bool(images))
        value=json.loads(raw);validate_payload(value,schema_path)
        if not self.dry and not images and value['status']!='ERROR' and not observed:raise RunError('No completed web search record')
        # Image attachments, not OCR and not a web-search substitute, are the vision input.
        write_json(path/'audit.json',{'webSearchObserved':observed,**fingerprint,'resultSha256':result_fingerprint(value)})
        if value.get('status')!='ERROR':write_json(cached,value)
        return value
    def discover(self,target):
        event=target['eventId'];self.heartbeat(event)
        prompt=(ROOT/'prompts/floorplan-discovery.md').read_text()+'\nEVENT DATA:\n'+json.dumps(target['event'],ensure_ascii=False)
        path=self.folder/f'event-{event}'/'discovery'
        result=self.job(path,prompt,'floorplan-discovery.schema.json',fixture='discovery.json')
        for p in result['plans']:
            for k in ('imageUrl','pageUrl'):public_url(p[k]);self.check_blocked(p[k])
        if self.dry:return result
        payload_path=path/'payload.json'
        if payload_path.exists():payload=json.loads(payload_path.read_text());payload['leaseId']=self.lease
        else:
            payload={'requestId':str(uuid.uuid4()),'leaseId':self.lease,'webSearchObserved':json.loads((path/'audit.json').read_text())['webSearchObserved'],'result':result};write_json(payload_path,payload)
        receipt=self.request('POST',f'/events/{event}/observations',payload);write_json(path/'receipt.json',receipt)
        return result
    def check_blocked(self,url):
        from urllib.parse import urlsplit
        host=urlsplit(url).hostname or ''
        if any(host==h or host.endswith('.'+h) for h in self.cfg['blockedSourceHosts']):raise RunError('Source is blocked by collection policy')
    def process_source(self,event,source):
        self.budget();asset=source['asset'];self.check_blocked(asset['imageUrl']);self.check_blocked(asset['pageUrl'])
        if not source['canTransform'] or asset['rightsState']!='APPROVED':return {'assetId':asset['id'],'state':'WAITING_PERMISSION'}
        self.heartbeat(event)
        data,mime,digest=fetch_image(asset['imageUrl'],self.cfg['imageAllowedHosts'],min(30,self.cfg['httpTimeoutSeconds']))
        from PIL import Image
        import io
        with Image.open(io.BytesIO(data)) as im:
            if getattr(im,'n_frames',1)!=1 or im.getexif().get(274,1)!=1:raise RunError('Animated/EXIF-rotated source requires a normalized official source')
            width,height=im.size
        version=self.request('POST',f'/events/{event}/versions',{'leaseId':self.lease,'assetId':asset['id'],'sourceRevision':source['sourceRevision'],'sha256':digest,'width':width,'height':height,'size':len(data),'contentType':mime})
        vid=version['id'];self.heartbeat(event)
        # PUT-like idempotent source write also refreshes source hash. URL-equal bytes may have changed.
        version=self.request('POST',f'/versions/{vid}/content',raw=data,headers={'Content-Type':mime,'X-Floorplan-Lease':self.lease})
        if version['geometry'] is not None:
            value=self.request('POST',f'/versions/{vid}/remap',{'leaseId':self.lease})
            return {'assetId':asset['id'],'versionId':vid,'state':value['state'],'cachedGeometry':True}
        # Stable version cache survives later weekly/daily runs and budgets, not just --resume.
        cache=Path(self.cfg['stateDirectory']).expanduser()/'floorplan-vision-cache'/str(vid)/EXTRACTOR
        geometry=self.vision(event,data,mime,cache)
        version=self.request('POST',f'/versions/{vid}/analysis',{'leaseId':self.lease,'revision':version['revision'],'sha256':digest,'geometry':geometry})
        return {'assetId':asset['id'],'versionId':vid,'state':version['state'],'mapped':version['mapping']['matched'],'unmapped':version['mapping']['unresolved']}
    def vision(self,event,data,mime,cache):
        digest,width,height,overview,regions=tiles(data,mime,cache,max_tiles=self.cfg['floorplanMaxTiles'])
        outputs=[]
        for index,tile in enumerate(regions):
            self.budget();self.heartbeat(event)
            prompt=(ROOT/'prompts/floorplan-layout.md').read_text()+f'\n원본 {width}x{height}, 두 번째 이미지 {tile["width"]}x{tile["height"]}, 타일 {index+1}/{len(regions)}. 원본 SHA256={digest}'
            result=self.job(cache/f'analysis-{index}',prompt,'floorplan-layout.schema.json',images=[overview,tile['path']],fixture='layout.json')
            outputs.append((tile,result))
        geometry=merge_tiles(outputs,width,height);write_json(cache/'geometry.json',geometry);return geometry
    def run(self,imminent=False):
        targets=json.loads(self.event_file.read_text()) if self.event_file else json.loads((self.fixtures/'targets.json').read_text()) if self.fixtures else ([] if self.dry else self.request('GET',f'/targets?imminent={str(imminent).lower()}&limit={self.cfg["floorplanMaxEvents"]}'))
        if self.dry and not self.fixtures and not self.event_file:
            raise RunError('Live dry-run requires --event-file with sanitized event data; server reads are disabled')
        if not isinstance(targets,list) or any(not isinstance(t,dict) or type(t.get('eventId')) is not int or not isinstance(t.get('event'),dict) for t in targets):raise RunError('Expected [{eventId: number, event: object}]')
        for target in targets[:self.cfg['floorplanMaxEvents']]:
            event=target['eventId'];errors=[];entry={'eventId':event,'sources':[]};self.events.append(entry);claimed=False
            try:
                self.budget()
                if self.api:self.request('POST',f'/events/{event}/claim',{'leaseId':self.lease});claimed=True
                try:
                    entry['discovery']=self.discover(target)['status']
                    if entry['discovery']=='ERROR':errors.append('Search returned ERROR; not a successful empty result')
                except Exception as e:
                    errors.append(type(e).__name__);entry['discovery']='ERROR'
                    # A failed search must not prevent processing already-known and permitted maps.
                if self.fixtures:
                    path=self.fixtures/'map.png';entry['geometry']=self.vision(event,path.read_bytes(),'image/png',self.folder/f'event-{event}'/'vision')
                else:
                    sources=[] if self.dry else self.request('GET',f'/events/{event}/sources')
                    pending=[s for s in sources if not s['canTransform'] or s['asset']['rightsState']!='APPROVED']
                    entry['waitingPermission']=len(pending)
                    sources=[s for s in sources if s not in pending]
                    for source in sources[:self.cfg['floorplanMaxSources']]:
                        try:entry['sources'].append(self.process_source(event,source))
                        except Exception as e:
                            message=f'{type(e).__name__}: {str(e)[:120]}'
                            errors.append(f'asset-{source["asset"]["id"]}: '+message)
                            try:self.request('POST',f'/events/{event}/sources/{source["asset"]["id"]}/failure',{'leaseId':self.lease,'message':message})
                            except Exception as report:errors.append('Source failure record: '+type(report).__name__)
                    if len(sources)>self.cfg['floorplanMaxSources']:errors.append('Source limit reached; next check required')
            except Exception as e:errors.append(type(e).__name__+': '+str(e)[:160])
            finally:
                entry['issues']=errors;self.issues.extend(f'event-{event}: {s}' for s in errors)
                if claimed:
                    try:self.request('POST',f'/events/{event}/finish',{'leaseId':self.lease,'message':'; '.join(errors)[:1000]})
                    except Exception as e:self.issues.append(f'event-{event}: finish {type(e).__name__}')
                self.save()
        self.save(finished=True);print(json.dumps({'state':self.meta['state'],'cliCalls':self.calls,'events':len(self.events),'issues':self.issues,'folder':str(self.folder)},ensure_ascii=False,indent=2));return 2 if self.issues else 0
    def save(self,finished=False):
        self.meta.update({'state':('PARTIAL' if self.issues else 'SUCCESS') if finished else 'RUNNING','events':self.events,'issues':self.issues,'cliCalls':self.calls,'updatedAt':utcnow()})
        if finished:self.meta['finishedAt']=utcnow()
        write_json(self.meta_path,self.meta)

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path);p.add_argument('--imminent',action='store_true');p.add_argument('--dry-run',action='store_true');p.add_argument('--fixtures',type=Path);p.add_argument('--resume',type=Path);p.add_argument('--event-file',type=Path)
    a=p.parse_args(argv)
    if a.fixtures and not a.dry_run:raise RunError('Fictional fixtures cannot be sent to server')
    if a.event_file and (not a.dry_run or a.fixtures):raise RunError('--event-file is live discovery dry-run only')
    cfg=load_config(a.config);state=Path(cfg['stateDirectory']).expanduser().resolve()
    with run_lock(state):
        folder=a.resume or state/'floorplans-v8'/(datetime.now(SEOUL).strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
        return FloorplanBatch(cfg,folder,dry=a.dry_run,fixtures=a.fixtures,event_file=a.event_file).run(a.imminent)
if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:print(type(e).__name__+': '+str(e)[:200],file=sys.stderr);sys.exit(1)
