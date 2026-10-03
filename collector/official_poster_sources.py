"""Read image evidence from reviewed official event pages, without inferring rights.

Body artwork is retained ahead of common site previews. Candidates still need
edition verification and the existing approval/storage steps before publication.
"""
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import hashlib,re
from media_fetch import check_url,MAX_HTML_BYTES

SUPPORTED_HOSTS = ['festival.seoul.go.kr','www.coex.co.kr','web1.gg.go.kr',
                   'www.kintex.com','www.setec.or.kr','setec.or.kr',
                   'www.jvcmusic.co.jp','www.kh.or.kr','takemm.com']
PLACEHOLDER_SHA256 = {'51bab8b001f832dfe2bd37f2f8dfa5f49fe34754403f5112590e50fb5f1473f2'}

def poster_detail_url(value):
    try:
        check_url(value,SUPPORTED_HOSTS)
        return value
    except (ValueError,TypeError):return None

class PosterHTML(HTMLParser):
    def __init__(self,page):
        super().__init__(convert_charrefs=True)
        self.page=page;self.stack=[];self.images=[];self.parts=[];self.links=[];self.anchor=None
    def add_image(self,value,role,alt,priority):
        if not value:return
        url=urljoin(self.page,value)
        try:check_url(url,[urlsplit(url).hostname or ''])
        except (ValueError,TypeError):return
        # Site chrome never becomes an event poster merely through og:image.
        if re.search(r'(?:logo|icon|loading|spacer|img_meta_festa|/common/|/calender/|/_static/|/resources/front/img/|fallfst26_(?:keyvisual|title|deco|ic_|map|altTitle|bg_))',urlsplit(url).path,re.I):return
        old=next((x for x in self.images if x['url']==url),None)
        row=dict(url=url,role=role,nearbyText=alt[:500],priority=priority)
        if old:
            if priority<old['priority']:self.images[self.images.index(old)]=row
        elif len(self.images)<400:self.images.append(row)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);context=' '.join(x[1] for x in self.stack)+' '+a.get('class','')+' '+a.get('id','')
        hidden=any(x[0] in ('script','style','template','iframe','nav','footer','header') for x in self.stack)
        if tag=='meta' and (a.get('property') or a.get('name','')).lower() in ('og:image','og:image:secure_url','twitter:image'):
            self.add_image(a.get('content'),'PAGE_PREVIEW','',1)
        if not hidden:
            if tag=='a':self.anchor=[a.get('href',''),'']
            priority=0 if re.search(r'poster|detail-visual|exhibition.*image|event.*image',context,re.I) else 2
            if tag=='img':
                for key in ('data-src','data-original','data-lazy-src','src'):
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
        if tag=='a' and self.anchor:
            href,label=self.anchor;self.anchor=None
            url=urljoin(self.page,href)
            if urlsplit(url).hostname==urlsplit(self.page).hostname and re.search(r'공지|안내|소개|포스터|notice|about|intro|poster',label+' '+href,re.I) and not re.search(r'login|signin|logout|write|delete|password',href,re.I):
                try:check_url(url,[urlsplit(self.page).hostname]);self.links.append(url)
                except (ValueError,TypeError):pass
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:del self.stack[i:];break
    def handle_data(self,value):
        if self.anchor:self.anchor[1]=(self.anchor[1]+value)[:500]
        if not any(x[0] in ('script','style','template','iframe','nav','footer','header') for x in self.stack):self.parts.append(value)

def parse_poster_document(html,page,checked_on,event_name=None):
    if not poster_detail_url(page) or not isinstance(html,str) or len(html.encode())>MAX_HTML_BYTES:raise ValueError('Invalid official poster document')
    return parse_official_document(html,page,checked_on,event_name)

def parse_official_document(html,page,checked_on,event_name=None):
    """Unverified candidates from an already associated official source only."""
    check_url(page,[urlsplit(page).hostname or ''])
    if not isinstance(html,str) or len(html.encode())>MAX_HTML_BYTES:raise ValueError('Invalid official document')
    parser=PosterHTML(page);parser.feed(html)
    text=re.sub(r'\n\s*\n+','\n',re.sub(r'[ \t]+',' ',''.join(parser.parts))).strip()
    if not text:raise ValueError('Empty official poster document')
    images=sorted(parser.images,key=lambda x:x['priority'])
    if urlsplit(page).hostname=='web1.gg.go.kr':
        # This is an aggregate festival map: never give another festival's art
        # to the model just because it occurs earlier in the page.
        norm=lambda s:re.sub(r'[^가-힣a-z0-9]','',s.casefold()).removeprefix('2026')
        target=norm(event_name or '')
        images=[row for row in images if target and norm(row['nearbyText'])==target]
    if urlsplit(page).hostname in ('setec.or.kr','www.setec.or.kr'):
        norm=lambda s:re.sub(r'[^가-힣a-z0-9]','',s.casefold()).removeprefix('제')
        target=norm(event_name or '')
        images=[row for row in images if target and norm(row['nearbyText'])==target]
    return dict(sourceUrl=page,sourceType='OFFICIAL_POSTER_PAGE',checkedOn=checked_on,bodyText=text[:32000],
                textTruncated=len(text)>32000,images=images[:40],imagesTruncated=len(images)>40,
                bodySha256=hashlib.sha256(html.encode()).hexdigest(),childUrls=list(dict.fromkeys(parser.links))[:8])
