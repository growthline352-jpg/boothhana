"""Read image evidence from reviewed official event pages, without inferring rights.

Body artwork is retained ahead of common site previews. Candidates still need
edition verification and the existing approval/storage steps before publication.
"""
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import hashlib,json,re
from media_fetch import check_url,MAX_HTML_BYTES

SUPPORTED_HOSTS = ['festival.seoul.go.kr','www.coex.co.kr','web1.gg.go.kr',
                   'www.kintex.com','www.setec.or.kr','setec.or.kr',
                   'www.jvcmusic.co.jp','www.kh.or.kr','takemm.com']
PLACEHOLDER_SHA256 = {'51bab8b001f832dfe2bd37f2f8dfa5f49fe34754403f5112590e50fb5f1473f2'}
AGGREGATE_HOSTS = {'web1.gg.go.kr', 'www.gg.go.kr', 'gg.go.kr'}
VOID_TAGS = {'img','meta','link','input','br','hr','source','area','wbr','embed','param'}

def event_label(value):
    return re.sub(r'[^가-힣a-z0-9]', '', value.casefold()).removeprefix('2026')

class FestivalSections(HTMLParser):
    """Capture each GG festival dialog before extracting any images or links."""
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.sections=[];self.active=None;self.tags=[]
    def handle_starttag(self, tag, attrs):
        if self.active is None and tag=='section' and re.fullmatch(r'mdftv_\d+',dict(attrs).get('id','')):
            self.active=dict(id=dict(attrs)['id'],html=[],heading=[])
        if self.active is not None:
            self.active['html'].append(self.get_starttag_text())
            if tag not in VOID_TAGS:self.tags.append(tag)
    def handle_startendtag(self, tag, attrs):
        if self.active is not None:self.active['html'].append(self.get_starttag_text())
    def handle_endtag(self, tag):
        if self.active is None:return
        self.active['html'].append('</'+tag+'>')
        for index in range(len(self.tags)-1,-1,-1):
            if self.tags[index]==tag:
                del self.tags[index:]
                if not self.tags:
                    self.sections.append(dict(id=self.active['id'],html=''.join(self.active['html']),
                                              heading=unescape(''.join(self.active['heading']))))
                    self.active=None
                break
    def handle_data(self, value):
        if self.active is not None:
            self.active['html'].append(value)
            if 'h5' in self.tags:self.active['heading'].append(value)
    def handle_entityref(self, name):self.handle_data('&'+name+';')
    def handle_charref(self, name):self.handle_data('&#'+name+';')

def poster_detail_url(value):
    try:
        check_url(value,SUPPORTED_HOSTS)
        return value
    except (ValueError,TypeError):return None

class PosterHTML(HTMLParser):
    def __init__(self,page):
        super().__init__(convert_charrefs=True)
        self.page=page;self.stack=[];self.images=[];self.parts=[];self.links=[];self.official_links=[];self.anchor=None
        self.embedded=None;self.embedded_parts=[]
        self.titles=[];self.title_tag=None;self.title_parts=[]
    def add_image(self,value,role,alt,priority):
        if not value:return
        url=urljoin(self.page,value)
        try:check_url(url,[urlsplit(url).hostname or ''])
        except (ValueError,TypeError):return
        parsed=urlsplit(url)
        if parsed.path.lower().endswith('.svg') or (parsed.hostname in ('www.facebook.com','facebook.com') and parsed.path.rstrip('/')=='/tr'):return
        if re.search(r'(?:^|/)(?:venue[-_]?map|left[-_]?map|sns-event-popup|food_noimg)(?:[._-]|$)|/resources/images/(?:main/(?:m?ttr[-_])|meta/og-img)',parsed.path,re.I):return
        # Site chrome never becomes an event poster merely through og:image.
        if re.search(r'(?:logo|icon|loading|spacer|img_meta_festa|/common/|/calender/|/_static/|/resources/front/img/|fallfst26_(?:keyvisual|title|deco|ic_|map|altTitle|bg_))',urlsplit(url).path,re.I):return
        old=next((x for x in self.images if x['url']==url),None)
        row=dict(url=url,role=role,nearbyText=(alt or '')[:500],priority=priority)
        if old:
            if priority<old['priority']:self.images[self.images.index(old)]=row
        elif len(self.images)<400:self.images.append(row)
    def handle_starttag(self,tag,attrs):
        a={key:value or '' for key,value in attrs};context=' '.join(x[1] for x in self.stack)+' '+a.get('class','')+' '+a.get('id','')
        hidden=any(x[0] in ('script','style','template','iframe','nav','footer','header') for x in self.stack)
        if tag in ('title','h1') and not hidden:self.title_tag=tag;self.title_parts=[]
        if tag=='meta' and (a.get('property') or a.get('name','')).lower()=='og:title':self.titles.append(a.get('content','')[:2048])
        if tag=='meta' and (a.get('property') or a.get('name','')).lower() in ('og:image','og:image:secure_url','twitter:image','twitter:image:src'):
            self.add_image(a.get('content'),'PAGE_PREVIEW','',1)
        if tag=='script' and (a.get('type','').lower() in ('application/ld+json','application/json') or a.get('id')=='__NEXT_DATA__'):
            self.embedded='json';self.embedded_parts=[]
        if tag=='style':self.embedded='css';self.embedded_parts=[]
        if not hidden:
            if tag=='a':self.anchor=[a.get('href',''),'']
            priority=0 if re.search(r'poster|detail-visual|exhibition.*image|event.*image',context,re.I) else 2
            if tag=='img':
                for key in ('data-src','data-original','data-lazy-src','data-lazy','data-image','src'):
                    self.add_image(a.get(key),'POSTER' if priority==0 else 'CONTENT',a.get('alt',''),priority)
                for key in ('srcset','data-srcset'):
                    for value in (a.get(key) or '').split(','):
                        self.add_image(value.strip().split(' ')[0],'CONTENT',a.get('alt',''),priority)
            if tag=='source':
                for value in (a.get('srcset') or '').split(','):
                    self.add_image(value.strip().split(' ')[0],'CONTENT','',priority)
            for value in re.findall(r'url\(\s*[\"\']?([^\"\')]+)',a.get('style','')):
                self.add_image(value,'BACKGROUND',a.get('aria-label',''),priority)
        if tag not in ('img','meta','link','input','br','hr','source','area','wbr','embed','param'):
            self.stack.append((tag,a.get('class','')+' '+a.get('id','')))
        if tag in ('p','div','li','br','h1','h2','h3'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag==self.title_tag:
            if len(self.titles)<20:self.titles.append(''.join(self.title_parts)[:2048])
            self.title_tag=None;self.title_parts=[]
        if self.embedded and tag in ('script','style'):
            raw=''.join(self.embedded_parts)
            if self.embedded=='json':
                try:self.structured_images(json.loads(raw))
                except (ValueError,RecursionError):pass
            else:
                for value in re.findall(r'url\(\s*["\']?([^"\')]+)',raw):
                    self.add_image(value,'BACKGROUND','',3)
            self.embedded=None;self.embedded_parts=[]
        if tag=='a' and self.anchor:
            href,label=self.anchor;self.anchor=None
            url=urljoin(self.page,href)
            if re.search(r'홈페이지|공식\s*(?:사이트|누리집|홈)|official\s*(?:site|website)',label,re.I) and not re.search(r'login|signin|logout|write|delete|password',href,re.I):
                try:check_url(url,[urlsplit(url).hostname or '']);self.official_links.append(url)
                except (ValueError,TypeError):pass
            if urlsplit(url).hostname==urlsplit(self.page).hostname and re.search(r'공지|안내|소개|포스터|notice|about|intro|poster',label+' '+href,re.I) and not re.search(r'login|signin|logout|write|delete|password',href,re.I):
                try:check_url(url,[urlsplit(self.page).hostname]);self.links.append(url)
                except (ValueError,TypeError):pass
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:del self.stack[i:];break
    def handle_data(self,value):
        if self.title_tag:self.title_parts.append(value[:2048])
        if self.embedded:self.embedded_parts.append(value)
        if self.anchor:self.anchor[1]=(self.anchor[1]+value)[:500]
        if not any(x[0] in ('script','style','template','iframe','nav','footer','header') for x in self.stack):self.parts.append(value)
    def structured_images(self,value,depth=0,image_context=False):
        """Read inert JSON image fields; never execute a hydration script."""
        if depth>12:return
        if isinstance(value,str):
            if image_context:self.add_image(value,'STRUCTURED_IMAGE','',1)
        elif isinstance(value,list):
            for item in value[:100]:self.structured_images(item,depth+1,image_context)
        elif isinstance(value,dict):
            image_object=value.get('@type')=='ImageObject'
            label=value.get('caption') or value.get('name') or ''
            for key,item in list(value.items())[:100]:
                is_image=key.casefold() in ('image','imageurl','thumbnailurl','poster','posterurl') or (image_object or image_context) and key in ('url','contentUrl')
                if is_image and isinstance(item,str):self.add_image(item,'STRUCTURED_IMAGE',str(label),1)
                elif isinstance(item,(list,dict)):self.structured_images(item,depth+1,is_image)

def parse_poster_document(html,page,checked_on,event_name=None):
    if not poster_detail_url(page) or not isinstance(html,str) or len(html.encode())>MAX_HTML_BYTES:raise ValueError('Invalid official poster document')
    return parse_official_document(html,page,checked_on,event_name)

def parse_official_document(html,page,checked_on,event_name=None):
    """Unverified candidates from an already associated official source only."""
    check_url(page,[urlsplit(page).hostname or ''])
    if not isinstance(html,str) or len(html.encode())>MAX_HTML_BYTES:raise ValueError('Invalid official document')
    aggregate=urlsplit(page).hostname in AGGREGATE_HOSTS
    scope='OFFICIAL_PAGE'
    if aggregate:
        sections=FestivalSections();sections.feed(html)
        if sections.sections:
            target=event_label(event_name or '')
            fragment=urlsplit(page).fragment
            matches=[row for row in sections.sections if target and event_label(row['heading'])==target
                     and (not fragment or row['id']==fragment)]
            # A conflicting anchor or ambiguous title cannot identify the event.
            html=matches[0]['html'] if len(matches)==1 else ''
            scope='EVENT_SECTION' if len(matches)==1 else 'UNMATCHED_AGGREGATE'
        else:scope='IMAGE_LABEL_ONLY'
    parser=PosterHTML(page);parser.feed(html)
    text=re.sub(r'\n\s*\n+','\n',re.sub(r'[ \t]+',' ',''.join(parser.parts))).strip()
    if not text and not parser.images and scope!='UNMATCHED_AGGREGATE':raise ValueError('Empty official poster document')
    images=sorted(parser.images,key=lambda x:x['priority'])
    if aggregate:
        # This is an aggregate festival map: never give another festival's art
        # to the model just because it occurs earlier in the page.
        target=event_label(event_name or '')
        images=[row for row in images if target and event_label(row['nearbyText'])==target]
        if scope=='IMAGE_LABEL_ONLY':
            # Legacy/changed markup supplies image leads only. Global links and
            # other festivals' text must never become this event's evidence.
            parser.links=[];parser.official_links=[]
            text='\n'.join(row['nearbyText'] for row in images)
    if urlsplit(page).hostname in ('setec.or.kr','www.setec.or.kr'):
        norm=lambda s:re.sub(r'[^가-힣a-z0-9]','',s.casefold()).removeprefix('제')
        target=norm(event_name or '')
        images=[row for row in images if target and norm(row['nearbyText'])==target]
    target=event_label(event_name or '')
    title_matches=bool(len(target)>=4 and any(target in event_label(title) for title in parser.titles))
    return dict(sourceUrl=page,sourceType='OFFICIAL_POSTER_PAGE',sourceScope=scope,sourceTitleMatchesEvent=title_matches,checkedOn=checked_on,bodyText=text[:32000],
                textTruncated=len(text)>32000,images=images[:40],imagesTruncated=len(images)>40,
                bodySha256=hashlib.sha256(html.encode()).hexdigest(),childUrls=list(dict.fromkeys(parser.links))[:8],
                officialUrls=list(dict.fromkeys(parser.official_links))[:4])
