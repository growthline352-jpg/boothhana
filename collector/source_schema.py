"""Constrain NEW model output with validated current-page facts, never edit a result."""
from copy import deepcopy
import re
from urllib.parse import urlsplit
from run import canonical_audit_url

def current_documents(documents,page):
    exact=[d for d in documents if d.get('url')==page]
    return exact or [d for d in documents if canonical_audit_url(d.get('url',''))==canonical_audit_url(page)]

def constrain_source_schema(schema,documents,scope=None):
    result=deepcopy(schema);scope=scope or {};kind=scope.get('kind');page=scope.get('pageUrl','') or ''
    if kind=='CREATOR' and page:
        p=urlsplit(page)
        if p.scheme!='https' or p.hostname not in {'postype.com','www.postype.com'} or not re.fullmatch(r'/@[A-Za-z0-9_.-]+/?',p.path):return result,None
        matching=current_documents(documents,page)
        source=matching[0] if len(matching)==1 else {}
        verified=source.get('available') and not source.get('truncated') and source.get('channelPageVerified') is True and isinstance(source.get('pagination'),dict) and 'nextPageUrl' in source['pagination']
        next_url=source['pagination'].get('nextPageUrl') if verified else None
        properties=result.get('properties',{})
        if 'nextPageUrl' not in properties or 'coverage' not in properties:return result,None
        properties['nextPageUrl']['enum']=[next_url]
        if not verified:properties['coverage']['enum']=['PARTIAL','BLOCKED']
        elif next_url is not None:properties['coverage']['enum']=['PARTIAL']
        return result,{'kind':kind,'sourceUrl':page,'sourceHash':source.get('sha256'),'channelPageVerified':bool(verified),'nextPageUrl':next_url}
    if kind!='PARTICIPANTS':return result,None
    candidates=current_documents(documents,page) if page else documents
    rosters=[]
    for source in candidates:
        if not source.get('available') or source.get('truncated'):continue
        p=urlsplit(source.get('url',''))
        if p.scheme!='https' or p.hostname!='dongne.co' or not re.fullmatch(r'/events/[A-Za-z0-9_-]+/circles',p.path):continue
        rows=source.get('rosterEntries');pagination=source.get('pagination',{})
        if not isinstance(rows,list) or not 1<=len(rows)<=100:continue
        ids=[r.get('sourceEntryId') for r in rows];urls=[r.get('detailUrl') for r in rows]
        prefix='https://dongne.co'+p.path+'/'
        if any(not isinstance(i,str) or not re.fullmatch('[1-9][0-9]*',i) for i in ids):continue
        if len(set(ids))!=len(ids) or urls!=[prefix+i for i in ids] or urls!=pagination.get('entryUrls'):continue
        start,end=pagination.get('rangeStart'),pagination.get('rangeEnd')
        if type(start) is not int or type(end) is not int or start<1 or end-start+1!=len(rows):continue
        rosters.append((source,ids))
    if len(rosters)!=1:return result,None
    source,ids=rosters[0];participants=result.get('properties',{}).get('participants',{})
    item=participants.get('items',{})
    if 'sourceEntryId' not in item.get('properties',{}):return result,None
    participants['minItems']=participants['maxItems']=len(ids)
    item['properties']['sourceEntryId']['enum']=ids
    item['required']=list(dict.fromkeys(item.get('required',[])+['sourceEntryId']))
    return result,{'kind':kind,'sourceUrl':source['url'],'sourceHash':source.get('sha256'),'currentPageRows':len(ids),'sourceEntryIds':ids}
