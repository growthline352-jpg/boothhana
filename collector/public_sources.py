"""Public HTML evidence, independent of search snippets. No cookies or private IPs.

Uses the existing pinned HTTPS transport, honors robots, and keeps provenance.
Script-only/login/challenge pages remain unavailable. Known public article data
embedded in HTML can be decoded without executing scripts or bypassing access.
Re-fetch on every extraction/review rather than reusing old evidence.
"""
from datetime import datetime,timezone
import json,re,zlib
from html import escape,unescape
from html.parser import HTMLParser
from urllib.parse import urlsplit,urljoin
from urllib.robotparser import RobotFileParser
from media_fetch import fetch_html,MediaError
from run import canonical_audit_url

class PageText(HTMLParser):
    def __init__(self,url):
        super().__init__();self.url=url;self.hidden=0;self.text=[];self.links=[];self.title=[];self.in_title=False
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript','template'):self.hidden+=1
        if tag=='title':self.in_title=True
        if not self.hidden:
            values=dict(attrs)
            if tag=='img' and values.get('alt'):self.text.append(values['alt'])
            if tag=='a' and values.get('href'):
                link=urljoin(self.url,values['href'])
                if canonical_audit_url(link) and link not in self.links:self.links.append(link)
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript','template'):self.hidden=max(0,self.hidden-1)
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_title:self.title.append(data)
        if not self.hidden and data.strip():self.text.append(data.strip())

class InlineScripts(HTMLParser):
    """Capture inline bytes only; this parser never evaluates JavaScript."""
    def __init__(self):
        super().__init__();self.current=None;self.scripts=[]
    def handle_starttag(self,tag,attrs):
        if tag=='script' and not dict(attrs).get('src'):self.current=[]
    def handle_endtag(self,tag):
        if tag=='script' and self.current is not None:
            self.scripts.append(''.join(self.current));self.current=None
    def handle_data(self,data):
        if self.current is not None:self.current.append(data)

def kakao_pr_article(url,html):
    """Decode literal article fields from this publisher's public Nuxt HTML."""
    parsed=urlsplit(url);route=re.fullmatch(r'/pr/detail/(\d+)',parsed.path)
    if parsed.hostname!='kakaoent.com' or not route:return html
    scripts=InlineScripts();scripts.feed(html)
    states=[s for s in scripts.scripts if re.match(r'^\s*window\.__NUXT__\s*=',s)]
    if not states:return html
    if len(states)!=1:raise MediaError('Ambiguous public article data')
    literal=r'"(?:\\.|[^"\\])*"'
    pattern=r'\bdetailData:\{newsIdx:(\d+),title:('+literal+r'),summary:(?:'+literal+r'|[A-Za-z][A-Za-z0-9]*),content:('+literal+r')'
    articles=list(re.finditer(pattern,states[0]))
    if len(articles)!=1:raise MediaError('Unsupported public article encoding')
    article=articles[0]
    if int(article[1])!=int(route[1]):raise MediaError('Public article identity mismatch')
    title=json.loads(article[2]);content=json.loads(article[3])
    if not isinstance(title,str) or not isinstance(content,str):raise MediaError('Invalid public article fields')
    return '<title>'+escape(unescape(title))+'</title>'+unescape(content)

class PublicSources:
    def __init__(self,blocked,fetch=fetch_html):self.blocked=blocked;self.fetch=fetch
    def __call__(self,urls):
        documents=[];robots={}
        requested=list(dict.fromkeys(urls))
        if any(urlsplit(u).hostname=='illustar.net' for u in requested):
            listing='https://api.illustar.net/v1/event/list'
            if listing not in requested:requested.append(listing)
        for url in requested:
            value={'url':url,'capturedAt':datetime.now(timezone.utc).isoformat(),'available':False}
            try:
                parsed=urlsplit(url);host=(parsed.hostname or '').lower()
                if parsed.scheme!='https' or not host or any(host==b or host.endswith('.'+b) for b in self.blocked):raise MediaError('Blocked source')
                origin='https://'+host
                if origin not in robots:
                    policy=RobotFileParser();policy.set_url(origin+'/robots.txt')
                    try:
                        body,_=self.fetch(origin+'/robots.txt',[host],timeout=10,allow_plain=True);policy.parse(body.splitlines())
                    except MediaError as exc:
                        if str(exc) not in ('HTML HTTP 404','HTML HTTP 410'):raise
                        policy.parse([])
                    robots[origin]=policy
                if not robots[origin].can_fetch('BoothHana-Approved-Floorplan-Fetcher',url):raise MediaError('robots disallows collection')
                event_list=host=='api.illustar.net' and parsed.path=='/v1/event/list' and not parsed.query
                html,digest=self.fetch(url,[host],timeout=15,**({'allow_json':True} if event_list else {}))
                if event_list:
                    data=illustar_data(html)
                    if not isinstance(data,dict) or not isinstance(data.get('eventInfo'),list):raise MediaError('Official event list format changed')
                    fields=('id','round','event_type','name','status','place','start_date','end_date','show_date','ticket_open_date','ticket_close_date')
                    rows=[{k:row.get(k) for k in fields} for row in data['eventInfo'] if isinstance(row,dict)]
                    html='<title>일러스타 공식 행사 목록</title><pre>'+escape(json.dumps(rows,ensure_ascii=False))+'</pre>'
                html=kakao_pr_article(url,html)
                parser=PageText(url);parser.feed(html);title=' '.join(parser.title);text='\n'.join(parser.text)
                # The official web bundle reads this public, unauthenticated API.
                # Exact notice routes only: no account endpoints or arbitrary URL proxy.
                notice=re.fullmatch(r'/notice/([A-Za-z0-9]+)',parsed.path)
                if len(text)<100 and host=='illustar.net' and notice:
                    api='https://api.illustar.net/v1/notice/'+notice[1]
                    if any('api.illustar.net'==b or 'api.illustar.net'.endswith('.'+b) for b in self.blocked):raise MediaError('Blocked API source')
                    policy=RobotFileParser()
                    try:
                        body,_=self.fetch('https://api.illustar.net/robots.txt',['api.illustar.net'],timeout=10,allow_plain=True);policy.parse(body.splitlines())
                    except MediaError as exc:
                        if str(exc) not in ('HTML HTTP 404','HTML HTTP 410'):raise
                        policy.parse([])
                    if not policy.can_fetch('BoothHana-Approved-Floorplan-Fetcher',api):raise MediaError('API robots disallows collection')
                    body,digest=self.fetch(api,['api.illustar.net'],timeout=15,allow_json=True)
                    html=illustar_notice(body);parser=PageText(url);parser.feed(html);title=' '.join(parser.title);text='\n'.join(parser.text)
                    value['transportUrl']=api
                if len(text)<100 or any(s in title.lower() for s in ('access denied','just a moment','captcha','로그인','login','sign in')):raise MediaError('No usable public page body')
                value.update(available=True,title=title,sha256=digest,text=text[:50000],links=parser.links[:150],truncated=len(text)>50000)
            except (ValueError,OSError) as exc:value['failure']=str(exc)[:200]
            documents.append(value)
        return documents

def illustar_data(body):
    """Decode the site's public zlib JSON representation with a hard expansion bound."""
    envelope=json.loads(body)
    if not isinstance(envelope,dict) or envelope.get('errorCode')!=0:raise MediaError('Official notice API error')
    data=envelope.get('data')
    if isinstance(data,dict) and data and all(k.isdecimal() for k in data):
        if len(data)>4*1024*1024 or set(data)!=set(map(str,range(len(data)))):raise MediaError('Invalid public notice encoding')
        if any(type(v) is not int or not 0<=v<=255 for v in data.values()):raise MediaError('Invalid public notice byte')
        decoder=zlib.decompressobj()
        try:raw=decoder.decompress(bytes(data[str(i)] for i in range(len(data))),4*1024*1024+1)
        except zlib.error as exc:raise MediaError('Invalid public notice compression') from exc
        if len(raw)>4*1024*1024 or not decoder.eof or decoder.unused_data:raise MediaError('Public notice expansion limit or truncated content')
        data=json.loads(raw)
    return data

def illustar_notice(body):
    data=illustar_data(body)
    info=data.get('info') if isinstance(data,dict) else None
    if not isinstance(info,dict) or not isinstance(info.get('title'),str) or not isinstance(info.get('body'),str):raise MediaError('Official notice format changed')
    return '<title>'+escape(info['title'])+'</title>'+info['body']

def context_urls(context):
    result=[]
    def add(value):
        if isinstance(value,str) and canonical_audit_url(value) and value not in result:result.append(value)
    for field in ('pageUrl','leadUrl'):add(context.get('input',{}).get(field))
    for key in ('creator','product','event','participant'):
        data=context.get(key,{}).get('data',{})
        for field in ('profileUrl','productUrl','officialUrl'):add(data.get(field))
        for s in data.get('sources',[]):
            if s.get('access')=='ORIGINAL':add(s.get('url'))
        for link in data.get('officialLinks',[]):add(link if isinstance(link,str) else link.get('url'))
    return result
