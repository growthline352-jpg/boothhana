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
FACILITY_KINDS={
    '화장실':'RESTROOM','입구':'ENTRANCE','입구/재입장':'ENTRANCE','출구':'EXIT',
    '운영본부':'INFORMATION','안내데스크':'INFORMATION','엘리베이터':'ELEVATOR',
    '에스컬레이터':'ESCALATOR','계단':'STAIRS','의무실':'FIRST_AID','푸드존':'FOOD',
    '무대':'STAGE','택배접수':'SERVICE',
}

def _code(label:str):
    match=CODE.match(label)
    if not match:return None
    prefix,separator,number,suffix=match.groups()
    return prefix.upper()+('-' if '-' in separator else '')+number+suffix.upper()

class _AccessibleMap(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.zones=[];self.booths=[];self.facilities=[];self.seen=set();self.seen_facilities=set()
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
    def handle_data(self,data):
        label=' '.join(data.split())
        kind=FACILITY_KINDS.get(label)
        if not kind:return
        current=self.zones[-1][1] if self.zones else ''
        key=(current,label)
        if key not in self.seen_facilities:
            self.seen_facilities.add(key);self.facilities.append({'kind':kind,'label':label,'hall':current or None})
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

def parse_accessible_layout(html:str):
    parser=_AccessibleMap();parser.feed(html);parser.close()
    if len(parser.booths)<4:raise ValueError('Official page has fewer than four accessible booth positions')
    return parser.booths,parser.facilities

def _parts(code:str):
    match=re.fullmatch(r'([A-Z]{1,4})-?(\d{1,4})([A-Z]?)',code,re.I)
    if not match:raise ValueError('Unsupported booth code in accessible map')
    return match.group(1).upper(),int(match.group(2)),match.group(3).upper()

def build_schematic(html:str):
    booths,facilities=parse_accessible_layout(html)
    zones=OrderedDict()
    facility_zones=OrderedDict()
    max_number=1
    for booth in booths:
        row,number,suffix=_parts(booth['code']);max_number=max(max_number,number)
        rows=zones.setdefault(booth['hall'] or '전시관 미확인',OrderedDict())
        rows.setdefault(row,[]).append((booth,number,suffix))
    for facility in facilities:facility_zones.setdefault(facility['hall'] or '전시관 미확인',[]).append(facility)
    row_count=sum(len(rows) for rows in zones.values())
    width=max(720,min(1800,max_number*44+96));facility_columns=max(1,(width-80)//152)
    facility_rows=sum((len(facility_zones.get(hall,[]))+facility_columns-1)//facility_columns for hall in zones)
    height=max(480,row_count*64+len(zones)*42+facility_rows*60+48)
    margin_x=40;base=(width-margin_x*2)/max_number;y=26;shapes=[]
    for hall,rows in zones.items():
        y+=34
        for row,items in rows.items():
            for booth,number,suffix in items:
                half=bool(suffix);slot=max(0,min(1,ord(suffix)-65)) if half else 0
                x=margin_x+(number-1)*base+(base/2*slot if half else 0)+2
                w=(base/2 if half else base)-4;h=48
                token=sha256((hall+'\0'+booth['code']).encode('utf-8')).hexdigest()[:20]
                shapes.append({'id':'dom-'+token,'kind':'BOOTH','label':booth['code'],'points':[{'x':x/width,'y':y/height},{'x':(x+w)/width,'y':y/height},{'x':(x+w)/width,'y':(y+h)/height},{'x':x/width,'y':(y+h)/height}],'recognition':'READABLE','boundaryConfirmed':True})
            y+=64
        for index,facility in enumerate(facility_zones.get(hall,[])):
            column=index%facility_columns;row=index//facility_columns;x=margin_x+column*152;fy=y+row*60;w=140;h=44
            token=sha256((hall+'\0'+facility['kind']+'\0'+facility['label']).encode('utf-8')).hexdigest()[:20]
            shapes.append({'id':'facility-'+token,'kind':facility['kind'],'label':facility['label'],'points':[{'x':x/width,'y':fy/height},{'x':(x+w)/width,'y':fy/height},{'x':(x+w)/width,'y':(fy+h)/height},{'x':x/width,'y':(fy+h)/height}],'recognition':'READABLE','boundaryConfirmed':True})
        y+=((len(facility_zones.get(hall,[]))+facility_columns-1)//facility_columns)*60
        y+=8
    canonical=json.dumps({'booths':[{'code':b['code'],'hall':b['hall']} for b in booths],'facilities':facilities},ensure_ascii=False,sort_keys=True,separators=(',',':'))
    layout_hash=sha256(canonical.encode('utf-8')).hexdigest()
    geometry={'extractorVersion':'accessible-html-schematic-v2','complete':True,'shapes':shapes,'warnings':['공식 클릭형 배치도의 접근성 부스번호와 명시된 시설 정보를 자동 정리한 안내도입니다. 실제 통로·거리·표시되지 않은 시설은 공식 원문을 확인하세요.']}
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

def merge_interactive_candidates(result:dict,event:dict,hints:list[dict]|None=None):
    """Merge verified discovery with direct-image hints from earlier stages.

    A FLOOR_PLAN HTML URL is only a research starting point. Treating every such
    page as an accessible interactive map made ordinary announcement pages fail
    later in ``build_schematic``. Direct image URLs can safely enter the reviewed
    source pipeline without rediscovery; HTML pages must first be opened and
    classified by the discovery job.
    """
    if result.get('status')=='ERROR':return result
    value=json.loads(json.dumps(result,ensure_ascii=False));plans=value.setdefault('plans',[])
    existing={u for p in plans for u in (p.get('pageUrl'),p.get('imageUrl')) if u};days=_event_days(event)
    candidates=[]
    for link in event.get('discoveryLinks') or []:
        if link.get('kind')=='FLOOR_PLAN' and link.get('url'):
            candidates.append({'url':link['url'],'hall':None,'zone':None,'dates':days,'title':(event.get('name') or '행사')[:260]+' 배치도','evidence':'행사 데이터에 등록된 공식 배치도 직접 이미지 링크.'})
    candidates.extend(hints or [])
    for link in candidates:
        url=link.get('url')
        if not url or url in existing or not IMAGE_PATH.search(urlsplit(url).path):continue
        scope_days=list(dict.fromkeys(link.get('dates') or days))[:90]
        plans.append({'imageUrl':url,'pageUrl':url,'scope':{'hall':link.get('hall'),'zone':link.get('zone'),'dates':scope_days,'title':(link.get('title') or (event.get('name') or '행사')[:260]+' 배치도')[:300]},'evidence':(link.get('evidence') or '참가부스 위치 데이터에 연결된 배치도 직접 이미지 링크.')[:1000]})
        existing.add(url)
        if len(plans)>=20:break
    if plans:
        value['status']='FOUND';value['availableOn']=None
        value['checkedUrls']=list(dict.fromkeys([*(value.get('checkedUrls') or []),*(p['pageUrl'] for p in plans)]))[:30]
        if any(is_interactive_source(p) for p in plans):
            note='클릭형 HTML 배치도는 원본 이미지를 복제하지 않고 접근성 부스번호만 공통 안내도로 변환합니다.'
            value['warnings']=list(dict.fromkeys([*(value.get('warnings') or []),note]))[:50]
    return value
