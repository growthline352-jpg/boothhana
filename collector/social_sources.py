"""Official SNS originals. Credentials stay in the collector, never in LLM input.

One five-post page per durable creator lease. Public web pages use PublicSources;
X uses its authenticated API and Bluesky its documented public AppView API.
No login scraping, unofficial mirrors, redirects with bearer credentials or repost
attribution. All hashes describe the exact transport response, not synthesized text.
"""
from datetime import datetime, timezone
import hashlib, json, os, re
from urllib.parse import urlsplit, parse_qs, urlencode, quote
from media_fetch import MediaError, fetch_html, check_url, public_addresses, PinnedHTTPS, request_target, PUBLIC_SOURCE_USER_AGENT
from public_sources import PublicSources

PAGE_SIZE = 5
MAX_BYTES = 4 * 1024 * 1024

def social_route(url):
    p=urlsplit(url)
    if p.scheme!='https' or p.username or p.password or p.port not in (None,443) or p.fragment:return None
    host=(p.hostname or '').lower()
    if host in ('x.com','www.x.com','twitter.com','www.twitter.com'):
        m=re.fullmatch(r'/([A-Za-z0-9_]{1,15})(?:/status/([0-9]{1,25}))?/?',p.path)
        if m and m[1].lower() not in ('home','search','explore','intent','i','settings'):return ('X',m[1],m[2],p)
    if host=='bsky.app':
        m=re.fullmatch(r'/profile/((?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+|did:plc:[a-z0-9]+)(?:/post/([A-Za-z0-9]+))?/?',p.path)
        if m:return ('BLUESKY',m[1],m[2],p)
    return None

def feed_url(profile,cursor=None):
    p=urlsplit(profile)
    params={'bh_feed':'1'}
    if cursor:params['bh_cursor']=cursor
    return 'https://'+p.netloc+p.path.rstrip('/')+'?'+urlencode(params)

def profile_key(url):
    route=social_route(url)
    if not route:return url.rstrip('/')
    platform,actor,_,_=route
    return 'https://x.com/'+actor.lower() if platform=='X' else 'https://bsky.app/profile/'+actor

def x_json(url, token):
    # Fixed official API only. A redirect is an error, not a new authenticated request.
    p,host=check_url(url,['api.x.com'])
    if host!='api.x.com' or not p.path.startswith('/2/'):raise MediaError('Invalid X API route')
    address=public_addresses(host,443)[0];connection=PinnedHTTPS(host,address,15)
    try:
        connection.request('GET',request_target(p),headers={'Authorization':'Bearer '+token,'Accept':'application/json','Accept-Encoding':'identity','User-Agent':PUBLIC_SOURCE_USER_AGENT})
        response=connection.getresponse()
        if response.status!=200:raise MediaError('X API HTTP '+str(response.status))
        if response.getheader('Content-Type','').split(';')[0].strip()!='application/json' or response.getheader('Content-Encoding','identity') not in ('','identity'):raise MediaError('Invalid X API content')
        raw=response.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES:raise MediaError('X API response too large')
        length=response.getheader('Content-Length')
        if length is not None and (not length.isdecimal() or int(length)!=len(raw)):raise MediaError('Truncated X API response')
        return raw.decode('utf-8'),hashlib.sha256(raw).hexdigest()
    finally:connection.close()

class SocialSources:
    def __init__(self,blocked,*,public=None,fetch=fetch_html,x_fetch=x_json,token_env='X_BEARER_TOKEN'):
        self.blocked=blocked;self.public=public or PublicSources(blocked);self.fetch=fetch;self.x_fetch=x_fetch;self.token_env=token_env;self.expected_accounts={};self.stop_posts={}
    def api(self,url,platform):
        host=urlsplit(url).hostname
        if any(host==b or host.endswith('.'+b) for b in self.blocked):raise MediaError('Blocked SNS API')
        if platform=='X':
            token=os.environ.get(self.token_env,'').strip()
            if not token:raise MediaError('X API credential is not configured')
            raw,digest=self.x_fetch(url,token)
        else:raw,digest=self.fetch(url,[host],timeout=15,allow_json=True)
        payload=json.loads(raw)
        if not isinstance(payload,dict) or payload.get('error') or payload.get('errors'):raise MediaError('SNS API returned an error')
        return payload,digest
    def document(self,url,api,data,digest,*,images=None,links=None,next_page=None):
        text=json.dumps(data,ensure_ascii=False)
        if len(text)>50000:raise MediaError('SNS page must be split, not truncated')
        return {'url':url,'transportUrl':api,'capturedAt':datetime.now(timezone.utc).isoformat(),'available':True,'title':'Official SNS original','sha256':digest,'text':text,'truncated':False,'images':images or [],'links':links or [],'nextPageUrl':next_page}
    def __call__(self,urls):
        docs=[]
        for url in dict.fromkeys(urls):
            route=social_route(url)
            if not route:docs.extend(self.public([url]));continue
            try:
                host=urlsplit(url).hostname
                if any(host==b or host.endswith('.'+b) for b in self.blocked):raise MediaError('Blocked SNS source')
                docs.extend(self.read(url,route))
            except (ValueError,OSError) as exc:
                # Never include request/response headers, token values or arbitrary exception strings.
                message=str(exc) if isinstance(exc,MediaError) else type(exc).__name__
                docs.append({'url':url,'available':False,'capturedAt':datetime.now(timezone.utc).isoformat(),'failure':message[:200]})
        return docs
    def read(self,url,route):
        platform,actor,post_id,p=route;params=parse_qs(p.query,keep_blank_values=True)
        for tracking in ('s','t','ref','ref_src','utm_source','utm_medium','utm_campaign'):params.pop(tracking,None)
        if set(params)-{'bh_feed','bh_cursor'} or any(len(v)!=1 for v in params.values()):raise MediaError('Invalid SNS page parameters')
        cursor=params.get('bh_cursor',[None])[0]
        if cursor is not None and (not cursor or len(cursor)>2000):raise MediaError('Invalid SNS cursor')
        feed=params.get('bh_feed')==['1']
        if cursor and not feed or post_id and params:raise MediaError('Invalid SNS page route')
        base=profile_key(url)
        if platform=='BLUESKY':
            api='https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?'+urlencode({'actor':actor})
            profile_api=api;profile,phash=self.api(api,platform);did=profile.get('did');handle=profile.get('handle')
            if not isinstance(did,str) or not did.startswith('did:') or actor not in (did,handle):raise MediaError('Bluesky account identity mismatch')
            account_id=did
            if self.expected_accounts.get(base) not in (None,did):
                doc={**self.document(base,api,profile,phash),'profileUrl':base,'platformAccountId':did,'identityMismatch':True}
                return [doc] if not feed and not post_id else [doc,{'url':url,'available':False,'failure':'Bluesky account owner changed'}]
            if not feed and not post_id:return [{**self.document(url,api,profile,phash),'profileUrl':base,'platformAccountId':did}]
            if post_id:
                uri='at://'+did+'/app.bsky.feed.post/'+post_id
                api='https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?'+urlencode({'uris':uri})
                data,digest=self.api(api,platform);posts=data.get('posts',[])
                if len(posts)!=1 or posts[0].get('uri')!=uri:raise MediaError('Bluesky post identity mismatch')
                rows=posts;next_page=None
            else:
                args={'actor':did,'limit':PAGE_SIZE,'filter':'posts_no_replies','includePins':'false'}
                if cursor:args['cursor']=cursor
                api='https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?'+urlencode(args)
                data,digest=self.api(api,platform)
                if not isinstance(data.get('feed'),list):raise MediaError('Invalid Bluesky feed')
                # Ignore reposts, even if their text mentions the artist.
                rows=[r.get('post',{}) for r in data['feed'] if not r.get('reason') and r.get('post',{}).get('author',{}).get('did')==did]
                next_page=feed_url(base,data['cursor']) if data.get('cursor') else None
            docs=[];summary=[]
            for post in rows:
                if post.get('author',{}).get('did')!=did:raise MediaError('Bluesky post author mismatch')
                uri=post.get('uri','');match=re.fullmatch(re.escape('at://'+did+'/app.bsky.feed.post/')+r'([A-Za-z0-9]+)',uri)
                if not match:raise MediaError('Invalid Bluesky post URI')
                post_url=base+'/post/'+match[1];record=post.get('record',{});embed=post.get('embed',{})
                own_embed=embed.get('media',{}) if embed.get('$type')=='app.bsky.embed.recordWithMedia#view' else embed
                images=[{'imageUrl':i['fullsize'],'pageUrl':post_url} for i in own_embed.get('images',[]) if isinstance(i.get('fullsize'),str)]
                links=[f['uri'] for facet in record.get('facets',[]) for f in facet.get('features',[]) if f.get('$type')=='app.bsky.richtext.facet#link' and isinstance(f.get('uri'),str)]
                external=own_embed.get('external',{}).get('uri')
                if isinstance(external,str):links.append(external)
                # Quoted/reposted authors are not part of this creator's sale catalog.
                value={'author':post['author'],'uri':uri,'text':record.get('text',''),'createdAt':record.get('createdAt'),'linkedUrls':links,'images':images}
                docs.append(self.document(url if post_id else post_url,api,value,digest,images=images,links=links));summary.append(value)
        else:
            api='https://api.x.com/2/users/by/username/'+quote(actor)+'?'+urlencode({'user.fields':'description,url,entities,profile_image_url'})
            profile_api=api;envelope,phash=self.api(api,platform);profile=envelope.get('data',{});author=profile.get('id')
            if not isinstance(author,str) or not author.isdecimal() or str(profile.get('username','')).lower()!=actor.lower():raise MediaError('X account identity mismatch')
            account_id=author
            if self.expected_accounts.get(base.lower()) not in (None,author):
                doc={**self.document(base,api,profile,phash),'profileUrl':base,'platformAccountId':author,'identityMismatch':True}
                return [doc] if not feed and not post_id else [doc,{'url':url,'available':False,'failure':'X account owner changed'}]
            if not feed and not post_id:return [{**self.document(url,api,profile,phash),'profileUrl':base,'platformAccountId':author}]
            args={'tweet.fields':'created_at,author_id,entities,attachments,referenced_tweets,note_post','expansions':'attachments.media_keys','media.fields':'url,type,alt_text'}
            if post_id:api='https://api.x.com/2/tweets/'+post_id+'?'+urlencode(args)
            else:
                args.update(max_results=PAGE_SIZE,exclude='retweets,replies')
                if cursor:args['pagination_token']=cursor
                api='https://api.x.com/2/users/'+author+'/tweets?'+urlencode(args)
            data,digest=self.api(api,platform);rows=[data.get('data',{})] if post_id else data.get('data',[])
            if not isinstance(rows,list):raise MediaError('Invalid X feed')
            if post_id and (not rows[0] or rows[0].get('id')!=post_id):raise MediaError('X post identity mismatch')
            next_page=feed_url(base,data.get('meta',{}).get('next_token')) if data.get('meta',{}).get('next_token') else None
            media={m.get('media_key'):m for m in data.get('includes',{}).get('media',[])};docs=[];summary=[]
            for post in rows:
                if post.get('author_id')!=author:raise MediaError('X post author mismatch')
                if any(r.get('type')=='retweeted' for r in post.get('referenced_tweets',[])):continue
                pid=str(post.get('id',''))
                if not pid.isdecimal():raise MediaError('Invalid X post ID')
                post_url=base+'/status/'+pid;note=post.get('note_post') or post.get('note_tweet') or post
                links=[l['expanded_url'] for l in note.get('entities',{}).get('urls',[]) if isinstance(l.get('expanded_url'),str)]
                images=[{'imageUrl':media[k]['url'],'pageUrl':post_url} for k in post.get('attachments',{}).get('media_keys',[]) if media.get(k,{}).get('type')=='photo' and isinstance(media[k].get('url'),str)]
                value={'authorId':author,'username':actor,'id':pid,'text':note.get('text',''),'createdAt':post.get('created_at'),'linkedUrls':links,'images':images,'referencedTweets':post.get('referenced_tweets',[])}
                docs.append(self.document(url if post_id else post_url,api,value,digest,images=images,links=links));summary.append(value)
        if not post_id:
            ids=[v.get('id') or v['uri'].rsplit('/',1)[-1] for v in summary]
            head=ids[0] if ids else None;stop=self.stop_posts.get(base)
            if stop in ids:
                count=ids.index(stop);docs=docs[:count];summary=summary[:count];ids=ids[:count];next_page=None
            receipt={'profileUrl':base,'accountId':account_id,'sourceUrl':url,'headPostId':head,'postIds':ids,'nextPageUrl':next_page}
            docs.insert(0,{**self.document(url,api,{'authorId':account_id,'postUrls':[d['url'] for d in docs],'nextPageUrl':next_page},digest,next_page=next_page),'socialPageReceipt':receipt})
        docs.append(self.document(base,profile_api,profile,phash))
        for doc in docs:doc.update(profileUrl=base,platformAccountId=account_id)
        return docs
