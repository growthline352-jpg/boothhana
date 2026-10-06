"""Persistent official inventory reconciliation. Import stages never publish media/events."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import hashlib,json,time
from popup_http import OfficialHttp
from popup_catalog_sources import DIRECTORIES,directories,bootstrap,inventory_page,event_record
from event_queue import normalize_name
from discovery_work import _write as atomic_write,work_key
from data_quality import missing_reasons,merge_enrichment
from catalog_rules import validate_discovery
from rules import parse_date
from run import write_json
from lotte_popup_sources import DETAIL_BASE,detail_version

def now_string():return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def elapsed(value,now=None):
    if not value:return float('inf')
    return ((now or datetime.now(timezone.utc))-datetime.fromisoformat(value.replace('Z','+00:00'))).total_seconds()
def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

class InventoryState:
    def __init__(self,path):
        self.path=Path(path)
        value=json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'schemaVersion':'1','companies':{},'branches':{}}
        if value.get('schemaVersion')!='1' or not isinstance(value.get('companies'),dict) or not isinstance(value.get('branches'),dict):
            raise ValueError('Official popup state corrupt; preserve it for repair')
        self.value=value
    def save(self):atomic_write(self.path,self.value)
    def branches(self):return self.value['branches']
    def due(self,limit):
        rows=[r for r in self.branches().values() if r.get('region') in ('SEOUL','GYEONGGI') and (not r.get('nextAttemptAt') or elapsed(r['nextAttemptAt'])>=0)]
        rows.sort(key=lambda r:(bool(r.get('lastAttemptAt')),r.get('lastAttemptAt') or '',r['key']))
        return rows[:limit]
    def health(self):
        rows=[]
        for r in self.branches().values():
            if r.get('region') not in ('SEOUL','GYEONGGI'):continue
            entries=r.get('items',{}).values();counts={}
            for item in entries:counts[item.get('outcome','PENDING')]=counts.get(item.get('outcome','PENDING'),0)+1
            rows.append({'key':r['key'],'name':r['venue'],'state':r.get('state','PENDING'),
                         'lastInventorySuccessAt':r.get('lastInventorySuccessAt'),'lastSuccessAt':r.get('lastSuccessAt'),
                         'overdue':elapsed(r.get('lastInventorySuccessAt'))>86400,'cursor':r.get('cursor'),
                         'counts':counts,'issues':r.get('issues',[])[:10]})
        return rows

def matching_event(event,registered):
    """Shared weekly-news URLs cannot match every event in that news article."""
    name=normalize_name(event['name']);dates=event.get('occurrences',[])
    wanted_dates={(o.get('startDate'),o.get('endDate')) for o in dates}
    wanted_urls={s.get('url') for s in event.get('sources',[])}
    matches=[]
    for row in registered:
        old=row['event'];old_name=normalize_name(old.get('name',''))
        if not old.get('subcategory','').startswith('POPUP_') or old.get('region')!=event.get('region'):continue
        if old_name!=name or {(o.get('startDate'),o.get('endDate')) for o in old.get('occurrences',[])}!=wanted_dates:continue
        if wanted_urls.intersection(s.get('url') for s in old.get('sources',[])):matches.append(row)
    return matches[0] if len(matches)==1 else None

class OfficialInventory:
    def __init__(self,run,*,fetch=None,state_path=None,known_events=None,published_events=None,
                 max_branches=12,max_pages=0,max_details=0,max_seconds=900,deliver=True):
        self.run=run;self.scope=run.scope;self.folder=run.folder/'official-popups';self.folder.mkdir(exist_ok=True)
        path=state_path or (self.folder/'state.json' if run.dry else Path(run.cfg['stateDirectory']).expanduser()/'popup-source-state-v1.json')
        self.state=InventoryState(path);self.fetch=fetch or OfficialHttp(min(run.cfg['httpTimeoutSeconds'],30))
        self.known=known_events;self.published=published_events;self.max_branches=max_branches;self.max_pages=max_pages
        self.max_details=max_details;self.deadline=time.monotonic()+max_seconds;self.deliver=deliver
        self.report={'companies':[],'branches':[],'issues':[],'counts':{'inventoryItems':0,'staged':0,'existing':0,'researchQueued':0}}

    def read(self,url,key,body=None):
        if time.monotonic()>=self.deadline:raise TimeoutError('Official inventory runtime reached; cursor retained')
        self.run.check_budget()
        self.run.heartbeat()
        raw=self.fetch(url,body)
        if not isinstance(raw,str) or not raw or len(raw.encode('utf-8'))>4*1024*1024:raise ValueError('Invalid official document')
        path=self.folder/(digest({'url':url,'body':body})[:20]+'.txt')
        path.write_text(raw,encoding='utf-8')
        return raw

    def refresh_directories(self):
        for company,url in DIRECTORIES.items():
            checkpoint=self.state.value['companies'].setdefault(company,{})
            if elapsed(checkpoint.get('lastSuccessAt'))<7*86400:continue
            checkpoint['lastAttemptAt']=now_string()
            try:
                html=self.read(url,'directory-'+company);found=directories(company,html);present=set()
                for branch in found:
                    key=branch['key'];present.add(key);old=self.state.branches().get(key)
                    if old is None:self.state.branches()[key]={**branch,'state':'PENDING','items':{},'issues':[]}
                    else:old.update({k:v for k,v in branch.items() if v is not None})
                # Disappearing directory links require review, never erase events or history.
                for branch in self.state.branches().values():
                    if branch['company']==company:branch['directoryMissing']=branch['key'] not in present
                checkpoint.update(lastSuccessAt=now_string(),state='COMPLETE',branchCount=len(found),issues=[])
            except Exception as exc:
                checkpoint.update(state='FAILED',lastAttemptAt=now_string(),issues=[type(exc).__name__+': '+str(exc)[:200]])
                self.report['issues'].append(company+': directory read failed')
            self.report['companies'].append({'company':company,**checkpoint});self.state.save()

    def load_known(self):
        if self.known is None:self.known=[] if self.run.dry else self.run.enrichment_backlog()
        if self.published is None:
            self.published=[];after=0
            if not self.run.dry:
                while True:
                    page=self.run.request('GET',f'/image-repair-events?limit=100&afterId={after}')
                    if not isinstance(page,list) or len(page)>100:raise ValueError('Invalid public inventory page')
                    ids=[r.get('id') for r in page]
                    if any(type(i)!=int or i<=after for i in ids) or ids!=sorted(set(ids)):raise ValueError('Public inventory cursor stalled')
                    self.published.extend(page)
                    if len(page)<100:break
                    after=ids[-1]

    def research_job(self,branch,item,reason):
        name=branch['venue']+' 공식 항목 '+item['id']
        previous=self.run.discovery_work_queue.jobs.get(work_key('POPUP_SOURCE',name),{})
        previous_version=previous.get('payload',{}).get('detailSourceDigest')
        definition={'kind':'POPUP_SOURCE','category':'POPUP','subject':name,'priority':0,'cadenceDays':1,'scope':dict(self.scope),
                    'origin':'POPUP_INVENTORY_DETAIL','payload':{'sourceType':'POPUP_INVENTORY_DETAIL','region':branch['region'],
                        'inventoryId':item['id'],'branchKey':branch['key'],'branchName':branch['venue'],
                        'entryTitle':item['title'],'reason':reason,'seeds':[item['url']],'detailSourceDigest':item.get('detailSourceDigest'),
                        'queryTemplates':[], 'openingFocus':'ALL'}}
        job=self.run.discovery_work_queue.enqueue([definition])[0]
        if item.get('detailSourceDigest') and previous_version!=item['detailSourceDigest']:
            job.update(state='PENDING',nextRunAt=None,foundEventNames=[],foundTopics=[],sourceCoverage=[],routedCounts={},issues=[])
            self.run.discovery_work_queue.save()
        item.update(outcome='RESEARCH_QUEUED',researchKey=job['key'],issue=reason)
        self.report['counts']['researchQueued']+=1

    def reconcile(self,branch,item,event):
        result={'schemaVersion':'1','searchStatus':'COMPLETE','summary':'공식 지점별 개별 행사 확인',
                'queries':['공식 목록 '+branch['key']+' / '+item['id']],
                'sourceCoverage':[{'channel':'ORGANIZER_OFFICIAL','status':'CHECKED','queries':[],
                                   'checkedUrls':[branch['url'],item['url']],'notes':'목록 항목·날짜·장소·대표 이미지 확인'}],
                'events':[event]}
        accepted,rejected=validate_discovery(result,parse_date(self.scope['startDate']),parse_date(self.scope['endDate']),self.run.cfg['blockedSourceHosts'])
        if rejected or len(accepted)!=1:raise ValueError('Official event validation failed: '+str(rejected)[:150])
        event=accepted[0];known=matching_event(event,self.known)
        public=matching_event(event,self.published)
        if known:
            item.update(outcome='EXISTING',eventId=known['id'],missingReasons=missing_reasons(known['event']),
                        published=public is not None,bannerStored=bool(public and public.get('banner')))
            # Persist a link even when this run needs no new ingest. The existing
            # independent enrichment/image queues operate on this event ID.
            candidate=self.run.event_queue.enqueue_discovered([event],self.scope,origin='POPUP_INVENTORY')[0]
            self.run.event_queue.finish(candidate['key'],'FOUND',retry_hours=24,event_id=known['id'],matched_name=event['name'])
            merged=merge_enrichment(known['event'],event)
            # A dated inventory card is not evidence that an announced cancellation
            # or postponement was reversed. This path fills missing facts only.
            if known['event'].get('operationStatus'):
                merged['operationStatus']=known['event']['operationStatus']
            if self.deliver and merged!=known['event']:
                from import_manual_events import build_batch
                body=build_batch({**result,'events':[merged]},None,self.run.cfg['blockedSourceHosts'],self.scope['startDate'],self.scope['endDate'])
                receipt=self.run.deliver('official-fill-'+digest({'id':known['id'],'event':merged})[:20],body,legacy=True)
                if receipt.get('status') not in ('SUCCESS','PARTIAL','DRY_RUN') or receipt.get('rejected',0):raise ValueError('Server rejected official gap fill')
                item['gapFillStaged']=True;self.report['counts']['staged']+=1
            self.report['counts']['existing']+=1
            return
        candidate=self.run.event_queue.enqueue_discovered([event],self.scope,origin='POPUP_INVENTORY')[0]
        if 'POPUP_DAILY' not in candidate['origins']:candidate['origins'].append('POPUP_DAILY')
        self.run.event_queue.save()
        if not self.deliver:
            item.update(outcome='CANDIDATE_QUEUED',candidateKey=candidate['key']);return
        from import_manual_events import build_batch
        key='official-popup-'+digest({'branch':branch['key'],'id':item['id'],'event':event})[:20]
        receipt=self.run.deliver(key,build_batch(result,None,self.run.cfg['blockedSourceHosts'],self.scope['startDate'],self.scope['endDate']),legacy=True)
        if receipt.get('status') not in ('SUCCESS','PARTIAL','DRY_RUN') or receipt.get('rejected',0):
            raise ValueError('Server did not accept official popup')
        refs=receipt.get('candidates') or [];event_id=refs[0].get('id') if len(refs)==1 else None
        if not self.run.dry and type(event_id)!=int:raise ValueError('Official ingest receipt lacks event ID')
        item.update(outcome='STAGED' if not self.run.dry else 'DRY_RUN',candidateKey=candidate['key'],eventId=event_id,
                    published=False,bannerStored=False)
        if event_id:
            self.run.event_queue.finish(candidate['key'],'FOUND',retry_hours=24,event_id=event_id,matched_name=event['name'])
            self.known.append({'id':event_id,'event':event})
        self.report['counts']['staged']+=1

    def scan_branch(self,branch):
        branch['lastAttemptAt']=now_string();branch['issues']=[]
        self.state.save()
        detail_cache={};detail_visits=set()
        native_detail=lambda item:branch['company']=='LOTTE' and item['url']==DETAIL_BASE+item['id']
        def read(url,key,body=None):
            if body is None and url in detail_cache:return detail_cache[url]
            value=self.read(url,branch['key']+'-'+key,body)
            if body is None and url.startswith(DETAIL_BASE):detail_cache[url]=value
            return value
        try:
            html,meta=bootstrap(branch,read);branch.update(meta)
            if not branch.get('inventoryComplete') or elapsed(branch.get('lastInventorySuccessAt'))>=86400:
                if branch.get('inventoryComplete'):
                    branch.update(cursor={},inventoryComplete=False,feedTotals={},feedSeen={},feedFirstPages={},scanItems={})
                branch.setdefault('cursor',{});branch.setdefault('scanItems',{});branch.setdefault('feedTotals',{});branch.setdefault('feedSeen',{})
                branch.setdefault('feedFirstPages',{})
                # A resumed offset cursor is unsafe if newer notices shifted pages.
                # Recheck the first page of every started feed before continuation.
                if branch['scanItems'] or branch['feedTotals']:
                    for feed,previous in branch['feedTotals'].items():
                        rows,total,_=inventory_page(branch,{'page':1,'feed':int(feed)},read,html,meta)
                        if total!=previous or digest(rows)!=branch['feedFirstPages'].get(feed):
                            branch.update(cursor={},scanItems={},feedSeen={},feedTotals={},feedFirstPages={})
                            raise ValueError('Official list changed during continuation; restart snapshot next run')
                pages_read=0
                while self.max_pages==0 or pages_read<self.max_pages:
                    if time.monotonic()>=self.deadline:break
                    pages_read+=1
                    cursor=branch['cursor'] or {};feed=str(cursor.get('feed',0))
                    rows,total,nxt=inventory_page(branch,cursor,read,html,meta)
                    previous=branch['feedTotals'].get(feed)
                    if previous is not None and previous!=total:
                        branch.update(cursor={},scanItems={},feedSeen={},feedTotals={},feedFirstPages={})
                        raise ValueError('Official list changed during continuation; restart snapshot next run')
                    branch['feedTotals'][feed]=total
                    ids=[r['id'] for r in rows];seen=branch['feedSeen'].setdefault(feed,[])
                    if len(set(ids))!=len(ids) or set(seen).intersection(ids):
                        branch.update(cursor={},scanItems={},feedSeen={},feedTotals={},feedFirstPages={})
                        raise ValueError('Official list repeated IDs; restart snapshot next run')
                    seen.extend(ids)
                    if cursor.get('page',1)==1:branch['feedFirstPages'][feed]=digest(rows)
                    for row in rows:branch['scanItems'][row['id']]=row
                    if not nxt or str(nxt.get('feed',0))!=feed:
                        if len(seen)!=total:
                            branch.update(cursor={},scanItems={},feedSeen={},feedTotals={},feedFirstPages={})
                            raise ValueError('Official list ended before declared count; restart next run')
                    branch['cursor']=nxt;self.state.save()
                    if nxt is None:
                        old=branch.get('items',{});items={}
                        for key,row in branch['scanItems'].items():
                            before=old.get(key,{})
                            items[key]=before if before.get('fingerprint')==digest(row) else {**row,'fingerprint':digest(row),'outcome':'PENDING'}
                        # Retain disappearing items as history; absence alone is not cancellation.
                        branch.setdefault('history',{}).update({k:{**v,'absentSince':now_string()} for k,v in old.items() if k not in items})
                        branch.update(items=items,inventoryComplete=True,lastInventorySuccessAt=now_string(),scanItems={},
                                      inventoryRevision=int(branch.get('inventoryRevision',0))+1)
                        self.state.save();break
                if not branch.get('inventoryComplete'):branch['issues'].append('Inventory page budget reached; cursor retained')
            snapshot=int(branch.get('inventoryRevision',0))
            for item in branch.get('items',{}).values():
                # Listing cards have no detail version. Check native detail facts
                # once for each fresh inventory snapshot; unchanged completed
                # versions are never reclassified or re-ingested by a timer.
                if native_detail(item) and item.get('outcome') not in ('PENDING','FAILED','CANDIDATE_QUEUED') and item.get('detailCheckInventoryRevision')!=snapshot:
                    if time.monotonic()>=self.deadline:
                        branch['issues'].append('Detail version runtime reached; unvisited originals retained');break
                    if self.max_details and len(detail_visits)>=self.max_details:
                        branch['issues'].append('Detail version budget reached; unvisited originals retained');continue
                    detail_visits.add(item['id'])
                    try:
                        version=detail_version(read(item['url'],'version-'+item['id']),item)
                    except Exception as exc:
                        item['detailCheckIssue']=type(exc).__name__+': '+str(exc)[:200]
                        branch['issues'].append('Detail version read failed: '+item['id']);continue
                    previous=item.get('detailSourceDigest')
                    item.update(detailCheckInventoryRevision=snapshot,detailSourceDigest=version)
                    item.pop('detailCheckIssue',None)
                    if previous!=version:
                        item['previousDetailVersion']={'digest':previous,'outcome':item.get('outcome'),'reason':item.get('reason')}
                        item.update(outcome='PENDING',reason='DETAIL_SOURCE_CHANGED' if previous else 'DETAIL_SOURCE_UNTRACKED')
                        for key in ('event','researchKey','eventNames','candidateKey','eventId','gapFillStaged','issue'):item.pop(key,None)
                if item.get('outcome') in ('EXCLUDED','RESEARCH_QUEUED'):
                    if item.get('outcome')=='EXCLUDED' and item.get('reason') in ('OUTSIDE_WINDOW','NON_POPUP_OR_OUTSIDE_WINDOW'):
                        item['outcome']='PENDING'
                    elif item.get('outcome')=='RESEARCH_QUEUED':
                        job=self.run.discovery_work_queue.jobs.get(item.get('researchKey'),{})
                        if job.get('state')=='COMPLETE' and job.get('foundEventNames'):
                            if job.get('routedCounts',{}).get('POPUP'):
                                item.update(outcome='RESEARCH_FOUND',eventNames=job['foundEventNames'])
                            else:item.update(outcome='EXCLUDED',reason='RESEARCH_NON_POPUP')
                        elif job.get('state')=='NO_RESULTS':item.update(outcome='EXCLUDED',reason='RESEARCH_NO_POPUP')
                        else:continue
                    else:continue
                if item.get('outcome') in ('EXISTING','STAGED','DRY_RUN','RESEARCH_FOUND'):
                    if item.get('event'):
                        known=matching_event(item['event'],self.known);public=matching_event(item['event'],self.published)
                        if known:item.update(eventId=known['id'],missingReasons=missing_reasons(known['event']),published=public is not None,bannerStored=bool(public and public.get('banner')))
                    continue
            pending=[i for i in branch.get('items',{}).values() if i.get('outcome') in ('PENDING','FAILED','CANDIDATE_QUEUED')]
            for item in pending:
                if time.monotonic()>=self.deadline:
                    branch['issues'].append('Detail runtime reached; unvisited links retained')
                    break
                if item['id'] not in detail_visits:
                    if self.max_details and len(detail_visits)>=self.max_details:break
                    detail_visits.add(item['id'])
                try:
                    event,reason=event_record(branch,item,self.scope,read)
                except (ValueError,KeyError) as exc:
                    self.research_job(branch,item,type(exc).__name__+': '+str(exc)[:200])
                except Exception as exc:
                    item.update(outcome='FAILED',issue=type(exc).__name__+': '+str(exc)[:200])
                else:
                    if event:
                        item['event']=event
                        try:self.reconcile(branch,item,event)
                        except Exception as exc:item.update(outcome='FAILED',issue=type(exc).__name__+': '+str(exc)[:200])
                    else:item.update(outcome='EXCLUDED',reason=reason)
                if native_detail(item) and item['url'] in detail_cache and item.get('detailSourceDigest'):
                    item['detailCheckInventoryRevision']=snapshot
                    item.pop('detailCheckIssue',None)
                self.state.save()
            unresolved=[i for i in branch.get('items',{}).values() if i.get('outcome') in ('PENDING','FAILED','RESEARCH_QUEUED','CANDIDATE_QUEUED')]
            branch['state']='COMPLETE' if branch.get('inventoryComplete') and not unresolved and not branch['issues'] else 'PARTIAL'
            if branch['state']=='COMPLETE':branch['lastSuccessAt']=now_string()
            if unresolved:branch['issues'].append(f'{len(unresolved)} official entries await detail/retry')
            delay=6 if branch['state']=='PARTIAL' else 24
        except TimeoutError as exc:
            branch['state']='PARTIAL';branch['issues'].append(str(exc)[:200]);delay=6
        except Exception as exc:
            branch['state']='FAILED';branch['issues'].append(type(exc).__name__+': '+str(exc)[:200]);delay=6
        branch['nextAttemptAt']=(datetime.now(timezone.utc)+timedelta(hours=delay)).isoformat().replace('+00:00','Z')
        self.state.save()

    def collect(self):
        self.refresh_directories();self.load_known()
        for branch in self.state.due(self.max_branches):
            if time.monotonic()>=self.deadline:
                self.report['issues'].append('Official inventory budget reached; due branches retained');break
            self.scan_branch(branch)
        self.report['branches']=self.state.health()
        self.report['counts']['inventoryItems']=sum(len(r.get('items',{})) for r in self.state.branches().values())
        self.report['unmappedBranches']=[{'key':r['key'],'name':r['name'],'url':r['url']} for r in self.state.branches().values() if r.get('region') is None]
        self.report['overdueBranches']=sum(r['overdue'] for r in self.report['branches'])
        self.report['unfinishedBranches']=sum(r['state']!='COMPLETE' for r in self.report['branches'])
        write_json(self.folder/'coverage-report.json',self.report)
        return self.report
