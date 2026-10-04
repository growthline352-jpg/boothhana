#!/usr/bin/env python3
"""Independent published-banner repair. Default: read-only; --apply registers
unapproved candidates and stores ONLY already approved assets. Never publishes.
"""
from __future__ import annotations
import argparse,hashlib,json,os,time
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlsplit
from weekly import load_config
from run import run_lock,write_json,RunError
from catalog_transport import Api
from media_fetch import fetch_html,fetch_image,check_url,inspect_image
from event_detail_sources import AGENT,allowed_by_robots,collect_detail_sources,tmm_product_url
from official_site_sources import site_detail_url
from official_poster_sources import parse_official_document,PLACEHOLDER_SHA256
from detail_image_cache import approved_image,retain_images
from thumbnail_research import ThumbnailResearch
import uuid

PATH='/api/internal/subculture/v4'
class BudgetExpired(RunError):pass
RETRY_HOURS={'VERIFIED':24,'WAITING_REVIEW':12,'WAITING_HOST':24,'NO_IMAGE_FOUND':72,
             'SOURCE_BLOCKED':168,'NO_SOURCE':168,'SELECTION_BLOCKED':24,'DISCOVERED_FOR_REVIEW':12,
             'STORAGE_DISABLED':24,'APPROVED_WAIT_STORAGE':24,'RESEARCH_DEFERRED':2,
             'RESEARCH_BLOCKED':6,'RESEARCH_FAILED':2}
def now():return datetime.now(timezone.utc)
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def blocked(url,hosts):
    host=urlsplit(url).hostname or ''
    return any(host==h.removeprefix('*.') or host.endswith('.'+h.removeprefix('*.')) for h in hosts)

class RepairQueue:
    def __init__(self,path):
        self.path=path
        self.rows=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        if not isinstance(self.rows,dict) or any(not isinstance(row,dict) for row in self.rows.values()):raise RunError('Invalid image repair queue')
    def due(self,target,policy,at):
        stamp=digest([target,policy]);old=self.rows.get(str(target['id'])) or {}
        return stamp,old.get('fingerprint')!=stamp or not old.get('nextAttemptAt') or datetime.fromisoformat(old['nextAttemptAt'])<=at
    def record(self,target,stamp,state,note,at):
        old=self.rows.get(str(target['id'])) or {};attempts=old.get('attempts',0)+1
        hours=RETRY_HOURS.get(state,min(24,2**min(attempts,5)))
        row=dict(eventId=target['id'],name=target['event']['name'],fingerprint=stamp,state=state,
                 attempts=attempts,checkedAt=at.isoformat(),nextAttemptAt=(at+timedelta(hours=hours)).isoformat(),details=note)
        self.rows[str(target['id'])]=row;write_json(self.path,self.rows);return row

class Repair:
    def __init__(self,cfg,api,folder,apply=False,force=False,max_events=100,max_minutes=60,store_only=False,max_searches=None):
        self.cfg=cfg;self.api=api;self.folder=folder;self.apply=apply;self.force=force
        self.deadline=time.monotonic()+max_minutes*60;self.limit=max_events;self.store_only=store_only
        if folder.is_symlink():raise RunError('Image repair state directory is a symlink')
        folder.mkdir(parents=True,exist_ok=True);folder.chmod(0o700)
        self.queue=RepairQueue(folder/('queue.json' if apply else 'dry-queue.json'))
        search_limit=cfg.get('maxThumbnailSearches',30) if max_searches is None else max_searches
        if type(search_limit) is not int or not 0<=search_limit<=100:raise RunError('Thumbnail search budget outside allowed range')
        self.robots={};self.policy=[cfg['blockedSourceHosts'],cfg['imageAllowedHosts'],cfg.get('downloadApprovedImages',True),search_limit,'event-thumbnail-v3']
        self.evidence=folder/'evidence'/uuid.uuid4().hex
        self.research=ThumbnailResearch(cfg,self.evidence/'research',search_limit)
    def budget(self):
        if time.monotonic()>=self.deadline:raise BudgetExpired('Image repair budget exhausted')
    def timeout(self):
        self.budget()
        return min(15,max(1,int(self.deadline-time.monotonic())))
    def targets(self):
        rows=[];after=0
        while True:
            self.budget();page=self.api.request('GET',f'{PATH}/image-repair-events?limit=100&afterId={after}')
            if not isinstance(page,list) or len(page)>100:raise RunError('Invalid repair page')
            ids=[row.get('id') for row in page]
            if any(type(i) is not int or i<=after for i in ids) or ids!=sorted(set(ids)):raise RunError('Non-advancing image repair cursor')
            rows.extend(page)
            if len(page)<100:return rows
            after=ids[-1]
    def permitted(self,url):
        self.budget()
        if blocked(url,self.cfg['blockedSourceHosts']):return False
        host=urlsplit(url).hostname or '';check_url(url,[host])
        return allowed_by_robots(url,[host],min(15,max(1,int(self.deadline-time.monotonic()))),self.robots)
    def verify(self,target,expected=None):
        self.budget()
        try:public=self.api.public_event(target['id'])
        except Exception as error:return 'PUBLICATION_FAILED',dict(reason='Public detail is unreadable',error=type(error).__name__)
        banner=public.get('banner')
        if not banner:
            return 'PUBLICATION_FAILED',dict(reason='No approved stored banner in public API')
        asset=next((a for a in target['assets'] if a['id']==banner['id']),None)
        expected=expected or target['storedHashes'].get(str(banner['id'])) or target['storedHashes'].get(banner['id'])
        if not asset or asset['rightsState']!='APPROVED' or asset['storageState']!='STORED' or not expected:
            return 'PUBLICATION_FAILED',dict(reason='Public banner differs from current verified asset')
        url=banner.get('url')
        if not url or url!=asset.get('storedUrl'):return 'PUBLICATION_FAILED',dict(reason='Public URL differs from stored asset URL')
        self.budget()
        try:listing=self.api.public_listing(target['event'],target['id'])
        except Exception as error:return 'PUBLICATION_FAILED',dict(reason='Public listing is unreadable',error=type(error).__name__)
        list_banner=(listing or {}).get('banner') or {}
        if list_banner.get('id')!=banner['id'] or list_banner.get('url')!=url:
            return 'PUBLICATION_FAILED',dict(reason='Public search/list banner differs from detail',assetId=banner['id'])
        try:
            raw,mime,sha=fetch_image(url,[urlsplit(url).hostname],self.timeout())
            if inspect_image(raw,mime)!=expected or sha!=expected:
                return 'PUBLICATION_FAILED',dict(reason='Public image SHA256 mismatch',assetId=banner['id'])
        except BudgetExpired:raise
        except Exception as error:
            return 'PUBLICATION_FAILED',dict(reason='Public image is unreadable',assetId=banner['id'],error=type(error).__name__)
        return 'VERIFIED',dict(assetId=banner['id'],sha256=sha,bytes=len(raw),publicUrl=url,detailVerified=True,listVerified=True)
    def store(self,target,asset):
        if asset['rightsState']!='APPROVED':raise RunError('Unapproved image cannot be stored')
        if self.apply and not self.cfg.get('downloadApprovedImages',True):
            return 'STORAGE_DISABLED',dict(assetId=asset['id'],nextAction='downloadApprovedImages 설정 확인')
        if blocked(asset['imageUrl'],self.cfg['blockedSourceHosts']):return 'SOURCE_BLOCKED',dict(assetId=asset['id'])
        try:check_url(asset['imageUrl'],self.cfg['imageAllowedHosts'])
        except ValueError:return 'WAITING_HOST',dict(assetId=asset['id'],host=urlsplit(asset['imageUrl']).hostname)
        cached=approved_image(asset,Path(self.cfg['stateDirectory']).expanduser().resolve()/'detail-image-cache-v1',self.cfg['imageAllowedHosts'],self.cfg['blockedSourceHosts'])
        if not cached and not self.permitted(asset['imageUrl']):return 'SOURCE_BLOCKED',dict(assetId=asset['id'])
        raw,mime,sha=cached or fetch_image(asset['imageUrl'],self.cfg['imageAllowedHosts'],self.timeout(),url_guard=self.permitted,user_agent=AGENT)
        if inspect_image(raw,mime)!=sha:raise RunError('Source image verification mismatch')
        if not self.apply:return 'APPROVED_WAIT_STORAGE',dict(assetId=asset['id'],sha256=sha)
        self.budget()
        stored=self.api.request('POST',f'{PATH}/assets/{asset["id"]}/content',raw=raw,
            headers={'Content-Type':mime,'X-Image-Size':str(len(raw)),'X-Image-SHA256':sha,'X-Asset-Revision':str(asset['revision'])})
        if stored.get('storageState')!='STORED':raise RunError('Server did not confirm storage')
        updated={**target,'assets':[stored if a['id']==asset['id'] else a for a in target['assets']]}
        return self.verify(updated,sha)
    def discover_sources(self,target,extra_sources=None,seen=(),remembered_sources=()):
        event=target['event']
        if extra_sources is not None:event={**event,'sources':extra_sources,'discoveryLinks':[]}
        elif remembered_sources:event={**event,'sources':[*(event.get('sources') or []),*remembered_sources]}
        urls=list(dict.fromkeys(row['url'] for row in [*(event.get('sources') or []),*(event.get('discoveryLinks') or [])]
            if row.get('kind') in ('OFFICIAL','VENUE','ORGANIZER_SOCIAL') and row.get('url') and row.get('access')!='INACCESSIBLE'))[:8]
        for row in remembered_sources:
            if row['url'] not in urls and len(urls)<12:urls.append(row['url'])
        if not urls:return 'NO_SOURCE',dict(reason='No associated official source; organizer research required')
        existing={(a['imageUrl'],a['pageUrl']) for a in target['assets']}|set(seen);observations=[];candidates=[];index=0
        def register(image,page,state,sha=None):
            candidate=dict(url=image['url'],sourceUrl=page,role=image.get('role','CONTENT'),state=state)
            if sha:candidate['sha256']=sha
            if self.apply:
                self.budget()
                asset=self.api.request('POST',f'{PATH}/events/{target["id"]}/assets',{
                    'participantId':None,'productId':None,'image':{'type':'BANNER','imageUrl':image['url'],
                    'pageUrl':page,'rightsEvidence':'공식 원문 이미지 후보. 해당 회차·사용 승인 별도 검토.',
                    'caption':event['name'][:1000]}})
                candidate['assetId']=asset['id']
                candidate['rightsState']=asset['rightsState']
            candidates.append(candidate)
            return not self.apply or asset['rightsState']=='PENDING'
        if any(tmm_product_url(u) or site_detail_url(u) for u in urls):
            self.budget()
            # A fallback source set must not reuse an earlier TMM/Sites
            # checkpoint from another phase of this event's attempt.
            detail_key=digest([event.get('sources'),event.get('discoveryLinks')])[:20]
            try:details,files=collect_detail_sources(event,self.evidence/str(target['id'])/detail_key,self.cfg['blockedSourceHosts'],timeout=self.timeout())
            except BudgetExpired:raise
            except Exception as error:
                observations.append(dict(state='FETCH_FAILED',error=type(error).__name__,sourceType='DETAIL_EXTRACTOR'))
                details,files=[],[]
            for doc in details:
                page=doc['sourceUrl'];observations.append(dict(url=page,state=doc['status']))
                for image in doc.get('images',[]):
                    key=(image['url'],page)
                    if image.get('analysisStatus')!='ATTACHED' or key in existing or len(candidates)>=8:continue
                    existing.add(key)
                    try:
                        check_url(image['url'],self.cfg['imageAllowedHosts'])
                        image_state='VERIFIED_BYTES_NOT_EDITION'
                    except ValueError:image_state='WAITING_HOST'
                    pending=register(image,page,image_state,image.get('sha256'))
                    if self.apply and pending:
                        retain_images([{**doc,'images':[image]}],files,Path(self.cfg['stateDirectory']).expanduser().resolve()/'detail-image-cache-v1')
        # Leave room for linked notice pages even with eight initial sources.
        while index<len(urls) and index<12 and len(candidates)<8:
            page=urls[index];index+=1;self.budget();host=urlsplit(page).hostname or ''
            if blocked(page,self.cfg['blockedSourceHosts']):observations.append(dict(url=page,state='SOURCE_BLOCKED'));continue
            try:
                if not self.permitted(page):observations.append(dict(url=page,state='SOURCE_BLOCKED'));continue
                html,_=fetch_html(page,[host],min(15,max(1,int(self.deadline-time.monotonic()))))
                doc=parse_official_document(html,page,now().date().isoformat(),event['name'])
                for child in [*doc.get('officialUrls',[]),*doc['childUrls']]:
                    if child not in urls and len(urls)<12:urls.append(child)
                observations.append(dict(url=page,state='READ',images=len(doc['images'])))
                hints=next((s.get('imageUrls',[]) for s in [*(extra_sources or []),*remembered_sources] if s['url']==page),[])
                actual={image['url'] for image in doc['images']}
                if any(url not in actual for url in hints):
                    observations.append(dict(url=page,state='RESEARCH_IMAGE_NOT_IN_PAGE'))
                # A researched poster must actually be in the fetched page.
                # Do not replace a missing requested image with another ad.
                images=[image for image in doc['images'] if not hints or image['url'] in hints]
                for image in images:
                    key=(image['url'],page)
                    if key in existing:continue
                    if blocked(image['url'],self.cfg['blockedSourceHosts']):
                        observations.append(dict(url=image['url'],state='SOURCE_BLOCKED'));continue
                    existing.add(key)
                    if len(candidates)>=8:break
                    try:
                        check_url(image['url'],self.cfg['imageAllowedHosts'])
                    except ValueError:
                        register(image,page,'WAITING_HOST');continue
                    try:
                        if not self.permitted(image['url']):
                            observations.append(dict(url=image['url'],state='SOURCE_BLOCKED'));continue
                        trace=[]
                        raw,mime,sha=fetch_image(image['url'],self.cfg['imageAllowedHosts'],self.timeout(),source_trace=trace,url_guard=self.permitted,user_agent=AGENT)
                        if inspect_image(raw,mime)!=sha:raise RunError('Candidate bytes mismatch')
                        if sha in PLACEHOLDER_SHA256:continue
                    except BudgetExpired:raise
                    except Exception as error:
                        observations.append(dict(url=image['url'],state='IMAGE_FETCH_FAILED',error=type(error).__name__));continue
                    pending=register(image,page,'VERIFIED_BYTES_NOT_EDITION',sha)
                    if self.apply and pending:
                        # Keep exact source bytes privately while review is pending;
                        # later storage need not depend on a signed URL staying alive.
                        root=self.evidence/str(target['id']);root.mkdir(parents=True,exist_ok=True);root.chmod(0o700)
                        blob=root/(sha+'.image')
                        with blob.open('wb') as output:blob.chmod(0o600);output.write(raw)
                        evidence={**image,'analysisStatus':'ATTACHED','imageFile':blob.name,'contentType':mime,'sha256':sha,'fetchedUrls':trace}
                        retain_images([dict(sourceUrl=page,status='READ',images=[evidence])],[blob],Path(self.cfg['stateDirectory']).expanduser().resolve()/'detail-image-cache-v1')
            except BudgetExpired:raise
            except Exception as error:observations.append(dict(url=page,state='FETCH_FAILED',error=type(error).__name__))
        note=dict(sources=observations,candidates=candidates,needsSourceResearch=not any(c.get('sha256') and c['state']=='VERIFIED_BYTES_NOT_EDITION' for c in candidates),
                  nextAction='회차·행사 일치와 사용 검토' if candidates else '다른 주최자 공식 원문 추가 조사')
        if candidates:
            if self.apply and not any(c['rightsState']=='PENDING' for c in candidates):
                note['nextAction']='다른 작업에서 변경한 이미지 상태를 다음 조회에서 다시 확인'
                return 'ASSET_STATE_CHANGED',note
            return ('WAITING_REVIEW' if self.apply else 'DISCOVERED_FOR_REVIEW'),note
        if any(o['state']=='SOURCE_BLOCKED' for o in observations):return 'SOURCE_BLOCKED',note
        if any(o['state'] in ('FETCH_FAILED','IMAGE_FETCH_FAILED','INACCESSIBLE') for o in observations):return 'FETCH_FAILED',note
        return 'NO_IMAGE_FOUND',note
    def discover(self,target):
        event=target['event']
        identity=digest([event.get(key) for key in ('name','organizer','edition','occurrences')])
        previous=self.queue.rows.get(str(target['id']),{}).get('details') or {}
        remembered=previous.get('sourceLeads',[]) if previous.get('researchTarget')==identity else []
        state,note=self.discover_sources(target,remembered_sources=remembered)
        note.update(researchTarget=identity,sourceLeads=remembered)
        # Host-blocked candidates still have no usable bytes. Research another
        # official source for this exact event, not a whole-event weekly job.
        if any(c.get('sha256') and c['state']=='VERIFIED_BYTES_NOT_EDITION' for c in note.get('candidates',[])):return state,note
        research=self.research.search(target,note.get('sources',[]),self.deadline-time.monotonic())
        note['research']=research
        if research['state']=='DISABLED':return state,note
        if research['sources']:
            leads={}
            for row in [*research['sources'],*remembered]:
                if row['url'] not in leads:leads[row['url']]=row
            note['sourceLeads']=list(leads.values())[:4]
            seen={(c['url'],c['sourceUrl']) for c in note.get('candidates',[])}
            alternative_state,alternative=self.discover_sources(target,research['sources'],seen)
            note['sources']=note.get('sources',[])+alternative.get('sources',[])
            note['candidates']=note.get('candidates',[])+alternative.get('candidates',[])
            note['needsSourceResearch']=not any(c.get('sha256') and c['state']=='VERIFIED_BYTES_NOT_EDITION' for c in note['candidates'])
            note['nextAction']=alternative.get('nextAction','다른 공식 썸네일 출처 재조사')
            if alternative.get('candidates'):return alternative_state,note
            if note['candidates']:return state,note
            # A found page that failed extraction/download is not NO_RESULT.
            return alternative_state,note
        if research['state'] in ('RESEARCH_DEFERRED','RESEARCH_BLOCKED','RESEARCH_FAILED'):
            note['discoveryState']=state
            note['nextAction']='썸네일 별도 조사 재시도 · 조사 예산/인증/실행 오류 확인'
            return research['state'],note
        if research['state']=='INACCESSIBLE':
            note['nextAction']='접근 가능한 다른 공식 포스터 출처 재조사'
            return 'SOURCE_BLOCKED',note
        return state,note
    def repair(self,target):
        banner=target.get('banner')
        if banner:return self.verify(target)
        selected=target.get('selectedBannerAssetId')
        approved=[a for a in target['assets'] if a['rightsState']=='APPROVED' and (selected is None or a['id']==selected)]
        stored=[a for a in approved if a['storageState']=='STORED']
        if stored:
            return 'PUBLICATION_FAILED',dict(selectedAssetId=selected,availableAssetIds=[a['id'] for a in stored],nextAction='공개 저장소 설정 또는 저장 파일 확인')
        if selected is not None and not approved:
            return 'SELECTION_BLOCKED',dict(selectedAssetId=selected,nextAction='선택한 대표 이미지의 사용 승인 상태 확인')
        if approved:
            notes=[]
            for asset in approved[:8]:
                try:state,note=self.store(target,asset)
                except BudgetExpired:raise
                except Exception as error:
                    state,note='STORAGE_FAILED',dict(assetId=asset['id'],error=type(error).__name__)
                    if self.apply:
                        try:self.api.request('POST',f'{PATH}/assets/{asset["id"]}/failure',{'revision':asset['revision'],'reason':type(error).__name__})
                        except Exception as delivery:note['failureReportError']=type(delivery).__name__
                if state=='VERIFIED':return state,note
                notes.append(dict(state=state,**note))
            if any(n['state']=='APPROVED_WAIT_STORAGE' for n in notes):return 'APPROVED_WAIT_STORAGE',dict(attempts=notes)
            if any(n['state']=='STORAGE_DISABLED' for n in notes):return 'STORAGE_DISABLED',dict(attempts=notes)
            if self.store_only:return notes[-1]['state'],dict(attempts=notes)
            # A broken approved source does not stop research for a replacement.
            # Explicit selections and use rights stay unchanged; replacements are pending.
            state,note=self.discover(target)
            note['storageAttempts']=notes
            if state in ('NO_IMAGE_FOUND','NO_SOURCE'):return notes[-1]['state'],note
            return state,note
        pending=[a for a in target['assets'] if a['rightsState']=='PENDING']
        if pending:
            # A pending old/irrelevant candidate must not freeze source research.
            # Existing candidates (including rejections) are never re-registered.
            state,note=self.discover(target)
            action='기존·새 후보의 회차·행사 일치와 사용 검토'
            if state in ('SOURCE_BLOCKED','NO_SOURCE','NO_IMAGE_FOUND','FETCH_FAILED'):action='기존 후보 검토 · 수집 가능한 다른 공식 출처 추가'
            if state in ('RESEARCH_DEFERRED','RESEARCH_BLOCKED','RESEARCH_FAILED'):action=note['nextAction']
            note.update(assetIds=[a['id'] for a in pending],discoveryState=state,nextAction=action)
            return 'WAITING_REVIEW',note
        return self.discover(target)
    def run(self):
        run_id=None
        targets=self.targets() if self.store_only else None
        storage_due=not self.store_only or any(self.force or self.queue.due(t,self.policy,now())[1] for t in self.storage_targets(targets))
        if self.apply and storage_due:
            run_id=str(uuid.uuid4());today=now().astimezone(timezone(timedelta(hours=9))).date().isoformat()
        try:
            if run_id:self.api.request('POST',PATH+'/pipelines',dict(runId=run_id,weekKey=today,
                scope=dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate=today,endDate=today)))
            report=self.run_batch(run_id,targets)
            result=0 if all(r['state']=='VERIFIED' for r in report['events']) else 2
            if run_id:self.api.request('POST',f'{PATH}/pipelines/{run_id}/finish',dict(state='SUCCESS' if result==0 else 'PARTIAL',summary=self.summary(report)))
            return result
        except Exception as error:
            if run_id:
                try:self.api.request('POST',f'{PATH}/pipelines/{run_id}/finish',dict(state='FAILED',summary=dict(job=self.job_name(),issues=[type(error).__name__])))
                except Exception:pass  # local log remains authoritative when API is unreachable
            raise
    def job_name(self):return 'IMAGE_STORAGE' if self.store_only else 'IMAGE_REPAIR'
    def storage_targets(self,targets):
        return [t for t in targets if not t.get('banner') and any(a['rightsState']=='APPROVED' and a['storageState']!='STORED'
            and (t.get('selectedBannerAssetId') is None or a['id']==t['selectedBannerAssetId']) for a in t['assets'])]
    def summary(self,report):
        unresolved=[r for r in report['events'] if r['state']!='VERIFIED']
        # Bound the payload below the server's 20,000-character ceiling. Do not
        # upload signed source URLs, private evidence or full error messages.
        priority={'PUBLICATION_FAILED':0,'STORAGE_FAILED':1,'REPAIR_FAILED':1,'SELECTION_BLOCKED':2,'WAITING_REVIEW':3}
        unresolved.sort(key=lambda r:(priority.get(r['state'],4),r['eventId']))
        return dict(job=self.job_name(),counts=report['counts'],publishedEvents=report['publishedEvents'],
            processed=report['processed'],dueDeferred=report['dueDeferred'],unresolvedCount=len(unresolved),
            thumbnailSearches=report.get('thumbnailSearches',0),researchBlockedReason=report.get('researchBlockedReason'),
            issues=[f'{r["state"]}: {r["eventId"]}' for r in unresolved[:20]],
            imageTasks=[dict(eventId=r['eventId'],name=r['name'][:120],state=r['state'],
                nextAction=r.get('details',{}).get('nextAction','공개 대표 이미지·원문 확인')[:160]) for r in unresolved[:40]])
    def run_batch(self,run_id=None,targets=None):
        if targets is None:targets=self.targets()
        at=now();eligible=[];stamps={}
        published_count=len(targets)
        if self.store_only:
            targets=self.storage_targets(targets)
        for target in targets:
            stamp,due=self.queue.due(target,self.policy,at)
            stamps[str(target['id'])]=stamp
            if self.force or due:eligible.append((target,stamp))
        # Never attempted and oldest attempted first; failing early IDs cannot
        # monopolize every bounded daily batch. Reserve a fifth of each batch
        # for existing posters so a large missing queue cannot starve delivery checks.
        eligible.sort(key=lambda pair:(bool(pair[0].get('banner')),self.queue.rows.get(str(pair[0]['id']),{}).get('checkedAt',''),pair[0]['id']))
        missing=[pair for pair in eligible if not pair[0].get('banner')]
        visible=[pair for pair in eligible if pair[0].get('banner')]
        verify_slots=min(len(visible),max(1,self.limit//5)) if self.limit>1 else 0
        batch=missing[:self.limit-verify_slots]+visible[:verify_slots]
        chosen={pair[0]['id'] for pair in batch}
        batch += [pair for pair in eligible if pair[0]['id'] not in chosen][:max(0,self.limit-len(batch))]
        processed=0
        for target,stamp in batch:
            if time.monotonic()>=self.deadline:break
            if run_id:self.api.request('POST',f'{PATH}/pipelines/{run_id}/heartbeat',{})
            try:state,note=self.repair(target)
            except BudgetExpired:break
            except Exception as error:state,note='REPAIR_FAILED',dict(error=type(error).__name__)
            self.queue.record(target,stamp,state,note,now());processed+=1
        records=[]
        for target in targets:
            old=self.queue.rows.get(str(target['id']))
            if old and old.get('fingerprint')==stamps[str(target['id'])]:
                expired=old['state']=='VERIFIED' and datetime.fromisoformat(old['nextAttemptAt'])<=at
                records.append({**old,'state':'VERIFICATION_DUE'} if expired else old)
            else:records.append(dict(eventId=target['id'],name=target['event']['name'],state='NEEDS_RECHECK' if old else 'NOT_ATTEMPTED'))
        counts={state:sum(r['state']==state for r in records) for state in sorted({r['state'] for r in records})}
        report=dict(job=self.job_name(),mode='APPLY' if self.apply else 'READ_ONLY',publishedEvents=published_count,processed=processed,
                    dueDeferred=max(0,len(eligible)-processed),counts=counts,events=records,
                    thumbnailSearches=self.research.calls,researchBlockedReason=self.research.blocked_reason)
        write_json(self.folder/('report.json' if self.apply else 'dry-report.json'),report)
        print(json.dumps({k:v for k,v in report.items() if k!='events'},ensure_ascii=False))
        return report

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--force',action='store_true')
    parser.add_argument('--store-only',action='store_true',help='Store approved missing banners only; no discovery or approval')
    parser.add_argument('--max-searches',type=int,help='Separate per-event thumbnail searches, 0..100 (default: config/30)')
    parser.add_argument('--max-events',type=int,default=100);parser.add_argument('--max-minutes',type=int,default=60)
    args=parser.parse_args(argv)
    if not 1<=args.max_events<=200 or not 1<=args.max_minutes<=180:raise RunError('Image repair budget outside allowed range')
    cfg=load_config(args.config);state=Path(cfg['stateDirectory']).expanduser().resolve()
    with run_lock(state):
        folder=state/('image-storage-v1' if args.store_only else 'image-repair-v1')
        job=Repair(cfg,Api(cfg['apiBaseUrl'],os.getenv(cfg['tokenEnv'],''),cfg['httpTimeoutSeconds']),folder,args.apply,args.force,args.max_events,args.max_minutes,args.store_only,args.max_searches)
        return job.run()
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:print(type(error).__name__+': '+str(error)[:300]);raise SystemExit(1)
