"""Fresh anonymous rendering of TMM's public event pages, never account/map routes.

Only visible DOM is evidence. API payloads, cookies, local storage and gated venue
details are never exported. Current public tabs are partial views of a catalogue.
"""
from datetime import datetime,timezone
import hashlib,json,os,re
from urllib.parse import urlsplit,unquote,quote
from urllib.robotparser import RobotFileParser
from media_fetch import MediaError,public_addresses,PUBLIC_SOURCE_USER_AGENT

HOSTS=frozenset({'takemm.com','static.takemm.com','api.takemm.com'})
MODES=('timeline','info','store')

def tmm_route(url):
    try:
        p=urlsplit(url)
        if p.scheme!='https' or p.hostname!='takemm.com' or p.username or p.password or p.port not in (None,443) or p.query or p.fragment:return None
        m=re.fullmatch(r'/event/@([\w.-]{1,100})/(timeline|info|store)/?',unquote(p.path))
        return (m[1],m[2]) if m and m[1] not in ('.','..') else None
    except ValueError:return None

def related_public_tabs(url):
    route=tmm_route(url)
    return ['https://takemm.com/event/@'+quote(route[0],safe='_.-')+'/'+mode for mode in MODES] if route else []

def tmm_policies(blocked,fetch,cache):
    if any(h==b or h.endswith('.'+b) for h in HOSTS for b in blocked):raise MediaError('Blocked TMM rendering source')
    result={}
    for host in sorted(HOSTS):
        origin='https://'+host
        if origin not in cache:
            policy=RobotFileParser();policy.set_url(origin+'/robots.txt')
            try:
                body,_=fetch(origin+'/robots.txt',[host],timeout=10,allow_plain=True);policy.parse(body.splitlines())
            except MediaError as exc:
                # RFC 9309 §2.3.1.3: a robots.txt 4xx is unavailable, not a
                # Disallow rule. Still stop on 429, 5xx and transport errors.
                # This applies only to robots; public page/API 403 is never relaxed.
                status=re.fullmatch(r'HTML HTTP (4[0-9]{2})',str(exc))
                if not status or status[1]=='429':raise
                policy.parse([])
            cache[origin]=policy
        result[host]=cache[origin]
    return result

def request_allowed(url,method,policies):
    try:
        p=urlsplit(url)
        return (p.scheme=='https' and p.hostname in HOSTS and p.hostname in policies and
                p.port in (None,443) and not p.username and not p.password and
                method in ('GET','HEAD') and policies[p.hostname].can_fetch(PUBLIC_SOURCE_USER_AGENT,url))
    except ValueError:return False

DOM=r'''() => {
 const visible=e=>!!e.getClientRects().length;
 const date=[...document.querySelectorAll('div,span,p,dt')].filter(e=>visible(e)&&e.childElementCount===0&&e.innerText.trim()==='행사 날짜');
 if(date.length!==1) return null;
 const section=date[0].parentElement?.parentElement;
 if(!section) return null;
 return {url:location.href,title:document.title,dateText:section.innerText.trim(),
  text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].filter(visible).map(a=>a.href)};
}'''

def render_tmm_page(url,policies):
    if not tmm_route(url) or not request_allowed(url,'GET',policies):raise MediaError('Unapproved TMM event route')
    try:from playwright.sync_api import sync_playwright,Error
    except ImportError:raise MediaError('Public event browser runtime is not installed') from None
    addresses={host:public_addresses(host,443)[0] for host in HOSTS}
    rules=','.join('MAP '+host+' '+ip for host,ip in addresses.items())+',MAP * ~NOTFOUND'
    try:
        with sync_playwright() as runtime:
            environment={k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','LOCALAPPDATA','LANG','PLAYWRIGHT_BROWSERS_PATH'}}
            browser=runtime.chromium.launch(headless=True,chromium_sandbox=True,env=environment,args=['--host-resolver-rules='+rules,'--disable-quic'])
            try:
                context=browser.new_context(service_workers='block',accept_downloads=False,locale='ko-KR',timezone_id='Asia/Seoul',user_agent=PUBLIC_SOURCE_USER_AGENT)
                context.route('**/*',lambda route:route.continue_() if request_allowed(route.request.url,route.request.method,policies) else route.abort())
                context.route_web_socket('**/*',lambda socket:socket.close())
                page=context.new_page();page.set_default_timeout(20000)
                response=page.goto(url,wait_until='domcontentloaded',timeout=30000)
                if response is None or response.status>=400:raise MediaError('Public event browser HTTP '+str(response.status if response else 0))
                page.wait_for_function('() => {const p=('+DOM+')();return !!p && /[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(p.dateText);}',timeout=20000)
                page.wait_for_load_state('networkidle',timeout=10000)
                value=page.evaluate(DOM)
                if not value:raise MediaError('No verified public event date')
                value['anonymous']=True # Fresh context; no sign-in or imported credentials.
                return value
            finally:browser.close()
    except Error:raise MediaError('Public event browser unavailable or requires interaction') from None

def tmm_document(url,snapshot):
    route=tmm_route(url)
    if not route or not isinstance(snapshot,dict) or snapshot.get('anonymous') is not True or tmm_route(snapshot.get('url',''))!=route:
        raise MediaError('Public event browser identity mismatch')
    title=snapshot.get('title');text=snapshot.get('text');date=snapshot.get('dateText')
    if (not isinstance(title,str) or len(title)>1000 or any(s in title.lower() for s in ('access denied','just a moment','captcha','로그인','sign in')) or
        not isinstance(text,str) or len(text)>2*1024*1024 or not isinstance(date,str) or len(date)>2000 or
        not re.search(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',date) or date not in text):
        raise MediaError('No verified rendered event body')
    links=[]
    for link in snapshot.get('links',[]):
        if not isinstance(link,str):continue
        try:
            p=urlsplit(link)
            # The public header can link to a map gated to applicants/ticket holders.
            if p.hostname=='takemm.com' and unquote(p.path).startswith('/event/map/'):continue
            if p.scheme=='https' and p.hostname and p.port in (None,443) and not p.username and not p.password and link not in links:links.append(link)
        except ValueError:continue
    # The digest names exactly the visible excerpt supplied to extraction/review.
    evidence={'title':title,'dateText':date,'visibleText':text[:50000],'coverage':'CURRENT_PUBLIC_VIEW_ONLY',
              'warning':'현재 공개된 화면입니다. 비공개 장소·미공개 부스·다른 탭·더보기·전체 상품 목록은 확인한 것으로 취급하지 않습니다.'}
    body=json.dumps(evidence,ensure_ascii=False,sort_keys=True)
    return {'url':url,'transportUrl':snapshot['url'],'capturedAt':datetime.now(timezone.utc).isoformat(),'available':True,
            'title':title,'text':body,'links':links[:150],'sha256':hashlib.sha256(body.encode()).hexdigest(),
            'captureMethod':'ANONYMOUS_BROWSER_DOM','hashScope':'normalized rendered public event excerpt; not HTTP response bytes',
            'publicViewPartial':True,'truncated':len(text)>50000 or len(links)>150}
