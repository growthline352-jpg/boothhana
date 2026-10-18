"""Anonymous public X renderer, used only after the official API is unavailable.

No user browser profile, cookies, API credentials, login, challenge solving,
unofficial mirrors, or browser-derived account-ID claims. DOM hashes are labeled
as such. A bounded visible profile slice is always partial, never a feed cursor.
"""
from datetime import datetime,timezone,timedelta
import hashlib,json,os,re,time,uuid
from pathlib import Path
from urllib.parse import urlsplit
from media_fetch import MediaError,public_addresses

X_HOSTS={'x.com','www.x.com','twitter.com','www.twitter.com'}
RESOURCE_HOSTS=X_HOSTS|{'abs.twimg.com','pbs.twimg.com','video.twimg.com','api.x.com'}
PROFILE=re.compile(r'^/([A-Za-z0-9_]{1,15})(?:/status/([0-9]{1,25}))?/?$')
MAX_POSTS=20

class BrowserPending(RuntimeError):
 """A live browser capture is pending; do not approve an empty catalog."""

class CaptureQueue:
 """Durable request/response bridge for the desktop's public browser renderer.

 A response belongs to one fresh nonce. Extraction and review cannot share an
 old cached capture. Only DOM snapshots are accepted, never cookie/header dumps.
 """
 def __init__(self,directory,wait_seconds=60):self.directory=Path(directory);self.wait_seconds=wait_seconds
 def __call__(self,url):
  target(url);self.directory.mkdir(parents=True,exist_ok=True)
  nonce=str(uuid.uuid4());requested=datetime.now(timezone.utc)
  request={'id':nonce,'url':url,'requestedAt':requested.isoformat(),'expiresAt':(requested+timedelta(seconds=self.wait_seconds)).isoformat(),'state':'PENDING','captureMethod':'CUA_PUBLIC_DOM'}
  path=self.directory/(nonce+'.request.json')
  def save_request():
   temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(request),encoding='utf-8');temporary.replace(path)
  save_request()
  response=self.directory/(nonce+'.response.json')
  deadline=time.monotonic()+self.wait_seconds
  while time.monotonic()<deadline:
   if response.exists():
    if response.stat().st_size>2*1024*1024:raise MediaError('Browser capture response too large')
    value=json.loads(response.read_text(encoding='utf-8'))
    if value.get('id')!=nonce or value.get('requestedUrl')!=url:raise MediaError('Browser capture request mismatch')
    captured=datetime.fromisoformat(value.get('capturedAt','').replace('Z','+00:00'))
    if captured.tzinfo is None or captured<requested or captured>datetime.now(timezone.utc):raise MediaError('Browser capture is stale or invalid')
    snapshot=value.get('snapshot',{})
    if snapshot.get('anonymous') is not True:raise MediaError('Browser capture is not a verified logged-out public page')
    documents(url,snapshot)
    request.update(state='FULFILLED',capturedAt=value['capturedAt']);save_request()
    snapshot['capturedAt']=value['capturedAt'];return snapshot
   time.sleep(0.25)
  request.update(state='DEFERRED');save_request()
  raise BrowserPending('Public browser capture pending: '+nonce)

def target(url):
 p=urlsplit(url)
 if p.scheme!='https' or p.hostname not in X_HOSTS or p.username or p.password or p.port not in (None,443) or p.fragment:raise MediaError('Invalid browser source')
 m=PROFILE.fullmatch(p.path)
 if not m or m[1].lower() in {'home','search','i','intent','settings','explore'}:raise MediaError('Invalid browser source route')
 # A native API cursor must never be interpreted as a browser continuation.
 if p.query:raise MediaError('Browser cannot verify native feed cursors')
 return m[1],m[2]

def documents(url,snapshot):
 actor,pid=target(url)
 if snapshot.get('blocked'):raise MediaError('Public browser page requires login or is unavailable')
 final=snapshot.get('url','');final_actor,final_pid=target(final)
 if final_actor.lower()!=actor.lower() or final_pid!=pid:raise MediaError('Browser destination identity mismatch')
 profile='https://x.com/'+actor
 rows=[];seen=set()
 for row in snapshot.get('posts',[]):
  try:owner,post=target(row.get('url',''))
  except (ValueError,TypeError):continue
  # Author is taken from the article's author control, not a quoted link.
  if not post or owner.lower()!=actor.lower() or str(row.get('author','')).lower()!=actor.lower() or row.get('repost') or row.get('quoted'):continue
  if pid and post!=pid:continue
  if row['url'] in seen:continue
  body=row.get('text','')
  if not isinstance(body,str) or not body.strip() or len(body)>50000:continue
  links=[]
  for link in row.get('links',[]):
   p=urlsplit(link)
   if p.scheme=='https' and p.hostname and not p.username and not p.password and p.port in (None,443):links.append(link)
  images=[]
  for image in row.get('images',[]):
   p=urlsplit(image)
   if p.scheme=='https' and p.hostname=='pbs.twimg.com' and p.path.startswith('/media/') and not p.username and not p.password and p.port in (None,443):images.append({'imageUrl':image,'pageUrl':row['url']})
  rows.append({'url':row['url'],'author':actor,'text':body,'links':list(dict.fromkeys(links)),'images':images})
  seen.add(row['url'])
  if len(rows)>=MAX_POSTS:break
 if not rows:raise MediaError('No verified public posts in browser')
 if pid and len(rows)!=1:raise MediaError('Ambiguous public post')
 def doc(source,data,**extra):
  text=json.dumps(data,ensure_ascii=False,sort_keys=True)
  return {'url':source,'transportUrl':final,'capturedAt':snapshot.get('capturedAt',datetime.now(timezone.utc).isoformat()),'available':True,
   'title':'Public X browser original','sha256':hashlib.sha256(text.encode()).hexdigest(),'text':text,
   'truncated':False,'captureMethod':'ANONYMOUS_BROWSER_DOM','hashScope':'normalized rendered public DOM; not HTTP response bytes',
   'browserPartial':not bool(pid),'profileUrl':profile,**extra}
 result=[doc(url if pid else row['url'],row,images=row['images'],links=row['links']) for row in rows]
 if not pid:result.insert(0,doc(url,{'profile':snapshot.get('profile',''),'postUrls':[r['url'] for r in rows],
  'coverage':'PARTIAL','warning':'Visible browser slice only; no native account ID or feed checkpoint.'},links=[r['url'] for r in rows]))
 return result

# Read only the page's public author/post controls. Quote blocks are excluded.
DOM=r'''() => {
 const posts=[...document.querySelectorAll('article')].filter(a=>!a.parentElement?.closest('article')).map(a=>{
  const author=a.querySelector('[data-testid="User-Name"] a[href*="/"]')||[...a.querySelectorAll('a[href]')].find(x=>/^\/[A-Za-z0-9_]{1,15}\/?$/.test(new URL(x.href).pathname));
  const authorPath=author ? new URL(author.href).pathname : '';
  const time=[...a.querySelectorAll('a[href]')].find(x=>x.querySelector('time'))||[...a.querySelectorAll('a[href]')].find(x=>/^\/[A-Za-z0-9_]{1,15}\/status\/[0-9]+$/.test(new URL(x.href).pathname));
  const text=[...a.querySelectorAll('[data-testid="tweetText"],div.whitespace-pre-wrap[dir="auto"]')].find(t=>{
   const quote=t.closest('[data-testid="quoteTweet"],[role="link"]');
   return t.closest('article')===a&&(!quote||!a.contains(quote));
  });
  const postPath=time?new URL(time.href).pathname:'';
  const ownImages=[...a.querySelectorAll('a[href]')].filter(x=>new URL(x.href).pathname.startsWith(postPath+'/photo/')).flatMap(x=>[...x.parentElement.querySelectorAll('img')]);
  return {url:time?.href?.split('?')[0]||'',author:authorPath.split('/')[1]||'',text:text?.innerText||'',
   repost:!!a.querySelector('[data-testid="socialContext"]'),
   links:text?[...text.querySelectorAll('a[href]')].map(x=>x.href):[],images:ownImages.map(i=>i.src||i.currentSrc)};
 });
 const title=document.title;
 return {url:location.href,profile:document.querySelector('[data-testid="UserDescription"]')?.innerText||'',posts,
  anonymous:!!document.querySelector('a[href*="onboarding"][href*="mode=login"],a[href*="/i/flow/login"],a[href="/login"]'),
  blocked:/access denied|just a moment|captcha|something went wrong/i.test(title)||!!document.querySelector('iframe[src*="captcha"]')};
}'''

class BrowserSources:
 def __init__(self,blocked,renderer=None,capture_queue=None):self.blocked=blocked;self.renderer=renderer or self.render;self.capture_queue=capture_queue
 def __call__(self,url):
  target(url)
  if any(urlsplit(url).hostname==h or urlsplit(url).hostname.endswith('.'+h) for h in self.blocked):raise MediaError('Blocked browser source')
  try:snapshot=self.renderer(url)
  except MediaError:
   if self.capture_queue is None:raise
   snapshot=self.capture_queue(url)
  return documents(url,snapshot)
 def render(self,url):
  # Imported lazily: disabled installations and tests do not start a browser.
  try:from playwright.sync_api import sync_playwright,Error
  except ImportError:raise MediaError('Public browser runtime is not installed') from None
  addresses={host:public_addresses(host,443)[0] for host in RESOURCE_HOSTS if not any(host==b or host.endswith('.'+b) for b in self.blocked)}
  rules=','.join('MAP '+host+' '+ip for host,ip in addresses.items())+',MAP * ~NOTFOUND'
  try:
   with sync_playwright() as runtime:
    environment={k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','LOCALAPPDATA','LANG','PLAYWRIGHT_BROWSERS_PATH'}}
    browser=runtime.chromium.launch(headless=True,chromium_sandbox=True,env=environment,args=['--host-resolver-rules='+rules,'--disable-quic'])
    try:
     context=browser.new_context(service_workers='block',accept_downloads=False)
     def guard(route):
      p=urlsplit(route.request.url)
      if p.scheme!='https' or p.hostname not in addresses or p.port not in (None,443) or p.username or p.password:return route.abort()
      return route.continue_()
     context.route('**/*',guard)
     context.route_web_socket('**/*',lambda socket:socket.close())
     page=context.new_page();page.set_default_timeout(20000)
     response=page.goto(url,wait_until='domcontentloaded',timeout=30000)
     if response is None or response.status>=400:raise MediaError('Public browser HTTP '+str(response.status if response else 0))
     page.locator('article').first.wait_for(state='visible',timeout=20000)
     # Expand only public text; no other buttons, navigation, or login actions.
     for button in reversed(page.locator('[data-testid="tweet-text-show-more-link"], article div.whitespace-pre-wrap[dir="auto"] button').all()[:MAX_POSTS]):button.click()
     snapshot=page.evaluate(DOM)
     snapshot['anonymous']=True # This fresh context never signs in or imports credentials.
     return snapshot
    finally:browser.close()
  except Error:raise MediaError('Public browser unavailable or requires interaction') from None
