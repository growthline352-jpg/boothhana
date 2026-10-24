"""Attended, logged-out channel cards only. No API, post body or access bypass."""
from datetime import datetime,timezone
import hashlib,json,re
from html import escape
from urllib.parse import urlsplit,parse_qsl
from media_fetch import MediaError
from postype_sources import postype_pagination


def channel_route(url):
 try:
  p=urlsplit(url)
  if p.scheme!='https' or p.hostname not in {'postype.com','www.postype.com'} or p.username or p.password or p.port not in (None,443) or p.fragment:return None
  actor=re.fullmatch(r'/@([A-Za-z0-9_.-]+)/?',p.path)
  query=parse_qsl(p.query,keep_blank_values=True);keys=[k for k,_ in query];params=dict(query)
  if not actor or len(keys)!=len(set(keys)) or any(k not in {'page','activity-type'} for k in keys):return None
  if not re.fullmatch('[1-9][0-9]{0,4}',params.get('page','1')) or params.get('activity-type','all') not in {'all','post'}:return None
  return actor[1],int(params.get('page','1')),params.get('activity-type','all')
 except (ValueError,TypeError):return None


def postype_document(url,snapshot):
 route=channel_route(url)
 if not route or not isinstance(snapshot,dict) or snapshot.get('anonymous') is not True or snapshot.get('blocked') or channel_route(snapshot.get('url',''))!=route:
  raise MediaError('Public Postype channel identity mismatch or login required')
 activities=snapshot.get('activities')
 if not isinstance(activities,list) or len(activities)!=1:raise MediaError('Ambiguous public Postype activity region')
 activity=activities[0];text=activity.get('text');posts=activity.get('posts');navs=activity.get('navs')
 if not isinstance(text,str) or len(text)>40000 or not isinstance(posts,list) or len(posts)>12 or not isinstance(navs,list) or len(navs)>1:
  raise MediaError('Invalid public Postype inventory')
 normalized=[];seen=set();html='<div id="activity-content">'+escape(text)
 for post in posts:
  if not isinstance(post,dict):raise MediaError('Invalid public Postype card')
  source=post.get('url');title=post.get('title');body=post.get('text')
  if not isinstance(source,str) or not isinstance(title,str) or not title.strip() or len(title)>1000 or not isinstance(body,str) or not body.strip() or len(body)>5000:
   raise MediaError('Invalid public Postype card text')
  p=urlsplit(source)
  if p.scheme!='https' or p.hostname!='www.postype.com' or p.username or p.password or p.port not in (None,443) or p.query or p.fragment or not re.fullmatch(re.escape('/@'+route[0])+r'/post/[1-9][0-9]*',p.path) or source in seen:
   raise MediaError('Public Postype card belongs to another channel or is duplicated')
  seen.add(source);normalized.append({'url':source,'title':title,'text':body})
  html+='<a href="'+escape(source,quote=True)+'">'+escape(title)+'</a>'
 for nav in navs:
  buttons=nav.get('buttons') if isinstance(nav,dict) else None
  if not isinstance(buttons,list) or len(buttons)>30:raise MediaError('Invalid public Postype controls')
  html+='<div data-sentry-component="Pagination">'
  for button in buttons:
   if not isinstance(button,dict) or any(not isinstance(button.get(k),str) or len(button[k])>100 for k in ('label','text')) or any(type(button.get(k)) is not bool for k in ('selected','disabled')):
    raise MediaError('Invalid public Postype page button')
   html+='<button aria-label="'+escape(button['label'],quote=True)+'"'+(' class="pt-IconButton-variantSoft"' if button['selected'] else '')+(' disabled' if button['disabled'] else '')+'>'+escape(button['text'])+'</button>'
  html+='</div>'
 html+='</div>'
 # Reuse exactly the HTTP inventory rules: current selection, count, own links,
 # previous/next controls and the observed twelve-card page protocol must agree.
 scope=postype_pagination(url,html)
 if scope.get('channelPageVerified') is not True:raise MediaError('Public Postype channel inventory is incomplete or changed')
 data={'posts':normalized,'inventory':scope['pagination'],
       'warning':'Public card metadata only. No paid or age-restricted post body was opened. A card is not automatically a sale product, and points are not physical-goods KRW prices.'}
 rendered=json.dumps(data,ensure_ascii=False,sort_keys=True)
 links=[post['url'] for post in normalized]
 if scope['pagination']['nextPageUrl']:links.append(scope['pagination']['nextPageUrl'])
 return {'url':url,'transportUrl':snapshot['url'],'capturedAt':snapshot.get('capturedAt',datetime.now(timezone.utc).isoformat()),
         'available':True,'title':'Public Postype channel card metadata','text':rendered,'sha256':hashlib.sha256(rendered.encode()).hexdigest(),
         'truncated':False,'links':links,'captureMethod':'ANONYMOUS_BROWSER_DOM',
         'hashScope':'normalized rendered public channel metadata; not HTTP response bytes',**scope}


DOM=r'''() => {
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"],form,iframe');
 const headers=[...document.querySelectorAll('header[data-sentry-component="MainTopNavigation"]')].filter(e=>visible(e)&&!e.closest('#activity-content,article'));
 const links=headers.length===1?[...headers[0].querySelectorAll('nav a[href]')].filter(visible):[];
 const channelPath=location.pathname.replace(/\/$/,'');
 const publicPaths=['/','/explore','/rewards','/login','/signup',channelPath];
 const publicNavigation=links.length>0&&links.every(a=>{const u=new URL(a.href);return u.origin===location.origin&&!u.search&&!u.hash&&publicPaths.includes(u.pathname);});
 const anonymous=publicNavigation&&links.some(a=>new URL(a.href).pathname==='/login'&&a.innerText.trim()==='로그인')&&links.some(a=>new URL(a.href).pathname==='/signup'&&/^회원\s*가입$/.test(a.innerText.trim()));
 const blocked=/access denied|just a moment|captcha|로그인|sign in/i.test(document.title)||!!document.querySelector('iframe[src*="captcha"]');
 if(!anonymous||blocked)return {url:location.href,title:document.title,activities:[],anonymous,blocked};
 const publicText=e=>[e,...e.querySelectorAll('*')].filter(visible).flatMap(n=>[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).filter(Boolean)).join(' ');
 const activities=[...document.querySelectorAll('#activity-content')].filter(root=>visible(root)&&!root.querySelector('form,iframe,input,textarea')).map(root=>({
  text:publicText(root),
  posts:[...root.querySelectorAll('article[data-sentry-component="FeedPostItem"]')].filter(visible).map(card=>{
   const links=[...card.querySelectorAll('a[href]')].filter(a=>visible(a)&&/^\/@[A-Za-z0-9_.-]+\/post\/[1-9][0-9]*$/.test(new URL(a.href).pathname));
   return {url:links.length===1?links[0].href:'',title:links.length===1?publicText(links[0]):'',text:publicText(card)};
  }),
  navs:[...root.querySelectorAll('[data-sentry-component="Pagination"]')].filter(visible).map(nav=>({buttons:[...nav.querySelectorAll('button')].filter(visible).map(button=>({
   text:button.innerText.trim(),label:button.getAttribute('aria-label')||'',selected:button.classList.contains('pt-IconButton-variantSoft')||button.getAttribute('aria-current')==='page',
   disabled:button.disabled||button.hasAttribute('data-disabled')||button.getAttribute('aria-disabled')==='true'
  }))}))
 }));
 return {url:location.href,title:document.title,activities,anonymous,blocked};
}'''
