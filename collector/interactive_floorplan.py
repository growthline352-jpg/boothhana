"""Convert accessible interactive floorplan HTML into a first-party schematic.

Only explicit booth controls are collected. Physical aisles, exits and distances are
never inferred. The generated PNG is a blank, hash-carrying canvas used by the
existing reviewed floorplan version pipeline; public SVG shapes contain the data.
"""
from __future__ import annotations
from collections import OrderedDict
from datetime import date,timedelta
from hashlib import sha256
from html.parser import HTMLParser
from io import BytesIO
import json,re
from urllib.parse import urlsplit
from PIL import Image,PngImagePlugin

CODE=re.compile(r'^\s*([A-Z]{1,4})(\s*-\s*|\s*)(\d{1,4})([A-Z]?)(?=\s|$)',re.I)
IMAGE_PATH=re.compile(r'\.(?:png|jpe?g|webp|gif)(?:$|[?#])',re.I)

def _code(label:str):
    match=CODE.match(label)
    if not match:return None
    prefix,separator,number,suffix=match.groups()
    return prefix.upper()+('-' if '-' in separator else '')+number+suffix.upper()

class _AccessibleMap(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.zones=[];self.booths=[];self.seen=set()
    def handle_starttag(self,tag,attrs):
        values=dict(attrs)
        zone=values.get('data-zone-name') or values.get('data-hall-name') or values.get('data-hall')
        inherited=self.zones[-1][1] if self.zones else ''
        current=zone.strip()[:200] if zone and zone.strip() else inherited
        self.zones.append((tag,current))
        if tag not in ('button','area') or not values.get('aria-label'):return
        code=_code(values['aria-label'])
        key=(current,code)
        if code and key not in self.seen:self.seen.add(key);self.booths.append({'code':code,'hall':current or None})
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for index in range(len(self.zones)-1,-1,-1):
            if self.zones[index][0]==tag:
                del self.zones[index:];break

def parse_accessible_booths(html:str):
    parser=_AccessibleMap();parser.feed(html);parser.close()
    if len(parser.booths)<4:raise ValueError('Official page has fewer than four accessible booth positions')
    return parser.booths

def _parts(code:str):
    match=re.fullmatch(r'([A-Z]{1,4})-?(\d{1,4})([A-Z]?)',code,re.I)
    if not match:raise ValueError('Unsupported booth code in accessible map')
    return match.group(1).upper(),int(match.group(2)),match.group(3).upper()

def build_schematic(html:str):
    booths=parse_accessible_booths(html)
    zones=OrderedDict()
    max_number=1
    for booth in booths:
        row,number,suffix=_parts(booth['code']);max_number=max(max_number,number)
        rows=zones.setdefault(booth['hall'] or '전시관 미확인',OrderedDict())
        rows.setdefault(row,[]).append((booth,number,suffix))
    row_count=sum(len(rows) for rows in zones.values())
    width=max(720,min(1800,max_number*44+96));height=max(480,row_count*64+len(zones)*42+48)
    margin_x=40;base=(width-margin_x*2)/max_number;y=26;shapes=[]
    for hall,rows in zones.items():
        y+=34
        for row,items in rows.items():
            for booth,number,suffix in items:
                half=bool(suffix);slot=max(0,min(1,ord(suffix)-65)) if half else 0
                x=margin_x+(number-1)*base+(base/2*slot if half else 0)+2
                w=(base/2 if half else base)-4;h=48
                token=sha256((hall+'\0'+booth['code']).encode('utf-8')).hexdigest()[:20]
                shapes.append({'id':'dom-'+token,'label':booth['code'],'points':[{'x':x/width,'y':y/height},{'x':(x+w)/width,'y':y/height},{'x':(x+w)/width,'y':(y+h)/height},{'x':x/width,'y':(y+h)/height}],'recognition':'READABLE','boundaryConfirmed':True})
            y+=64
        y+=8
    canonical=json.dumps([{'code':b['code'],'hall':b['hall']} for b in booths],ensure_ascii=False,sort_keys=True,separators=(',',':'))
    layout_hash=sha256(canonical.encode('utf-8')).hexdigest()
    geometry={'extractorVersion':'accessible-html-schematic-v1','complete':True,'shapes':shapes,'warnings':['공식 클릭형 배치도의 접근성 부스번호를 자동 배치한 안내도입니다. 통로·출입구·실제 간격은 공식 원문을 확인하세요.']}
    info=PngImagePlugin.PngInfo();info.add_text('boothhana-layout-sha256',layout_hash)
    output=BytesIO();Image.new('RGB',(width,height),'white').save(output,format='PNG',pnginfo=info,optimize=True)
    data=output.getvalue();return data,'image/png',sha256(data).hexdigest(),width,height,geometry

def is_interactive_source(asset:dict):
    image=asset.get('imageUrl') or '';page=asset.get('pageUrl') or ''
    return bool(page and image==page and not IMAGE_PATH.search(urlsplit(page).path))

def _event_days(event:dict):
    days=[]
    for occurrence in event.get('occurrences') or []:
        start=date.fromisoformat(occurrence['startDate']);end=date.fromisoformat(occurrence['endDate'])
        while start<=end and len(days)<90:days.append(start.isoformat());start+=timedelta(days=1)
    return list(dict.fromkeys(days))

def merge_interactive_candidates(result:dict,event:dict):
    """Promote known FLOOR_PLAN links into the reviewed source pipeline.

    Event collection already classifies these URLs as official floorplans. Do not
    make a second web-search call rediscover the same image before it can enter the
    reviewed asset pipeline.
    """
    if result.get('status')=='ERROR':return result
    value=json.loads(json.dumps(result,ensure_ascii=False));plans=value.setdefault('plans',[])
    existing={u for p in plans for u in (p.get('pageUrl'),p.get('imageUrl')) if u};days=_event_days(event);interactive=False
    for link in event.get('discoveryLinks') or []:
        url=link.get('url')
        if link.get('kind')!='FLOOR_PLAN' or not url or url in existing:continue
        is_image=bool(IMAGE_PATH.search(urlsplit(url).path));interactive=interactive or not is_image
        plans.append({'imageUrl':url,'pageUrl':url,'scope':{'hall':None,'zone':None,'dates':days,'title':(event.get('name') or '행사')[:260]+(' 배치도' if is_image else ' 클릭형 배치도')},'evidence':('행사 데이터에 등록된 공식 배치도 이미지 링크.' if is_image else '행사 데이터에 등록된 공식 클릭형 배치도 링크. 접근성 부스번호를 검토 후 변환합니다.')})
        existing.add(url)
        if len(plans)>=20:break
    if plans:
        value['status']='FOUND';value['availableOn']=None
        value['checkedUrls']=list(dict.fromkeys([*(value.get('checkedUrls') or []),*(p['pageUrl'] for p in plans)]))[:30]
        if interactive:
            note='클릭형 HTML 배치도는 원본 이미지를 복제하지 않고 접근성 부스번호만 공통 안내도로 변환합니다.'
            value['warnings']=list(dict.fromkeys([*(value.get('warnings') or []),note]))[:50]
    return value
