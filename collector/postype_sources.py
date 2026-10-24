"""Bounded public channel pagination; no scripts, account APIs or paid bodies."""
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit,urljoin,urlunsplit,parse_qsl,urlencode

VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class ChannelControls(HTMLParser):
 def __init__(self,url):
  super().__init__();self.url=url;self.frames=[];self.navs=[];self.activities=0;self.text=[];self.posts=[];self.invalid=False
 def handle_starttag(self,tag,attrs):
  if self.invalid:return
  a=dict(attrs);parent=self.frames[-1] if self.frames else {};style=re.sub(r'\s+','',a.get('style','')).lower()
  hidden=parent.get('hidden',False) or tag in ('script','style','noscript','template','form') or 'hidden' in a or a.get('aria-hidden')=='true' or 'display:none' in style or 'visibility:hidden' in style
  frame={'tag':tag,'hidden':hidden,'nav':parent.get('nav'),'activity':parent.get('activity',False)}
  if not hidden:
   if a.get('id')=='activity-content':frame['activity']=True;self.activities+=1
   if a.get('data-sentry-component')=='Pagination':
    frame['nav']={'buttons':[]};self.navs.append(frame['nav'])
   if frame['nav'] is not None and tag=='button':
    button={'label':a.get('aria-label',''),'text':[],'selected':'pt-IconButton-variantSoft' in a.get('class','').split() or a.get('aria-current')=='page',
            'disabled':'disabled' in a or 'data-disabled' in a or a.get('aria-disabled')=='true'}
    frame['nav']['buttons'].append(button);frame['button']=button
   if frame['activity'] and tag=='a' and a.get('href'):
    href=urljoin(self.url,a['href']);p=urlsplit(href);base=urlsplit(self.url)
    if p.scheme=='https' and p.hostname=='www.postype.com' and p.path.startswith(base.path.rstrip('/')+'/post/') and re.fullmatch(re.escape(base.path.rstrip('/'))+r'/post/[1-9][0-9]*',p.path) and not p.query and not p.fragment and not p.username and not p.password and p.port in (None,443):
     if href not in self.posts:self.posts.append(href)
  if tag not in VOID:self.frames.append(frame)
  if len(self.frames)>200 or len(self.posts)>12 or len(self.navs)>1 or self.activities>1:self.invalid=True
 def handle_endtag(self,tag):
  if self.invalid:return
  for i in range(len(self.frames)-1,-1,-1):
   if self.frames[i]['tag']==tag:del self.frames[i:];break
 def handle_data(self,data):
  if self.invalid or not self.frames or self.frames[-1]['hidden']:return
  if self.frames[-1]['activity'] and data.strip():self.text.append(data.strip())
  for f in reversed(self.frames):
   if 'button' in f:f['button']['text'].append(data);break

def postype_pagination(url,html):
 p=urlsplit(url)
 if p.scheme!='https' or p.hostname not in {'postype.com','www.postype.com'} or not re.fullmatch(r'/@[A-Za-z0-9_.-]+/?',p.path):return {}
 partial={'publicViewPartial':True,'channelPageVerified':False,
  'channelPageWarning':'Current channel post inventory was not verified. Do not infer missing posts, a continuation URL, or whole-channel completion. Public profile text alone does not prove this page loaded.'}
 if p.username is not None or p.password is not None or p.port not in (None,443) or p.fragment:return partial
 query=parse_qsl(p.query,keep_blank_values=True);keys=[k for k,_ in query]
 if len(keys)!=len(set(keys)) or any(k not in {'page','activity-type'} for k in keys):return partial
 params=dict(query);raw_page=params.get('page','1')
 if not re.fullmatch('[1-9][0-9]{0,4}',raw_page) or params.get('activity-type','all') not in {'all','post'}:return partial
 current=int(raw_page);parser=ChannelControls(url);parser.feed(html)
 if parser.invalid or parser.activities!=1 or len(parser.navs)>1:return partial
 totals=re.findall(r'총\s*([0-9][0-9,]{0,8})\s*개',' '.join(parser.text))
 if len(totals)!=1:return partial
 if not re.fullmatch(r'[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+',totals[0]):return partial
 total=int(totals[0].replace(',',''));pages=max(1,(total+11)//12)
 if not 1<=current<=pages<=5000:return partial
 buttons=parser.navs[0]['buttons'] if parser.navs else []
 if len(buttons)>30:return partial
 number=lambda b:''.join(b['text']).strip()
 numeric=[b for b in buttons if re.fullmatch('[1-9][0-9]{0,4}',number(b))]
 if buttons:
  if not numeric or max(int(number(b)) for b in numeric)!=pages:return partial
  if [int(number(b)) for b in numeric if b['selected']]!=[current]:return partial
  previous=[b for b in buttons if b['label']=='이전 페이지'];following=[b for b in buttons if b['label']=='다음 페이지']
  if len(previous)!=1 or len(following)!=1 or previous[0]['disabled']!=(current==1) or following[0]['disabled']!=(current==pages):return partial
 elif pages!=1:return partial
 count=min(12,total-(current-1)*12)
 if len(parser.posts)!=count:return partial
 next_query=[(k,v) for k,v in query if k!='page']+[('page',str(current+1))]
 next_url=urlunsplit(('https','www.postype.com',p.path.rstrip('/'),urlencode(next_query),'')) if current<pages else None
 partial['channelPageVerified']=True;partial.pop('channelPageWarning')
 partial['pagination']={'page':current,'totalPages':pages,'reportedTotal':total,'totalUnit':'PUBLIC_CHANNEL_POSTS',
  'entryUrls':parser.posts,'nextPageUrl':next_url}
 return partial
