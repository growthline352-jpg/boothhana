"""Official branch directories and inert popup inventories, with explicit bounds."""
from datetime import date
import json,re
from urllib.parse import urlencode,urljoin,urlsplit,parse_qs
from lotte_popup_sources import Tree, class_text, parse_page, parse_detail, DETAIL_BASE, LIST_URL, POPUP, PERMANENT

DIRECTORIES={
 'LOTTE':'https://www.lotteshopping.com/contents/shpgInfo?cstrCd=0002',
 'HYUNDAI':'https://www.ehyundai.com/newPortal/index.do',
 'STARFIELD':'https://www.starfield.co.kr/coexmall/eventBenefit/events',
 'SHINSEGAE':'https://www.shinsegae.com/shopping/event/list.do',
}
REGIONAL_NAMES={
 'LOTTE':{'SEOUL':['잠실점','본점','강남점','건대스타시티점','관악점','김포공항점','노원점','미아점','영등포점','청량리점','서울역점','은평점'],
          'GYEONGGI':['동탄점','구리점','수원점','수원 타임빌라스','안산점','일산점','중동점','평촌점','의왕점','기흥점','이천점','파주점','고양점','고양터미널점','광교점','광명점','수지점','피트인 산본점']},
 'HYUNDAI':{'SEOUL':['더현대 서울','압구정본점','무역센터점','천호점','신촌점','미아점','목동점','가든파이브점','동대문점'],
            'GYEONGGI':['중동점','킨텍스점','판교점','김포점','스페이스원']},
 'SHINSEGAE':{'SEOUL':['강남점','본점','타임스퀘어점'],'GYEONGGI':['스타필드 하남점','신세계 사우스시티','의정부점']},
 'STARFIELD':{'SEOUL':['coexmall','centerfield','wolgae'],'GYEONGGI':['hanam','goyang','anseong','suwon','wirye','bucheon','guseong','dongtan','unjeong','ilsan','pangyo']},
}

def branch_region(company,name):
    for region,names in REGIONAL_NAMES[company].items():
        if name in names:return region
    return None

def directories(company,html):
    """Expose unrecognized branches, rather than silently treating them as covered."""
    root=Tree(html).root;rows={}
    def add(code,name,url,region=None,**extra):
        previous=rows.get(code)
        if previous and not (extra.get('mode')=='WEEKLY' and previous.get('mode')!='WEEKLY'):
            if extra.get('officialNames'):previous['officialNames']=extra['officialNames']
            return
        rows[code]={'key':company+':'+code,'company':company,'code':code,'name':name,'venue':name,
                    'region':region or branch_region(company,code if company=='STARFIELD' else name),
                    'url':url,**extra}
    if company=='LOTTE':
        for n in root.walk():
            if not n.has('branch-item'):continue
            onclick=n.attrs.get('onclick','')
            match=re.search(r'(?:hide(?:Gnb)?BranchPopup\(this,|changeCstrInfo\()\s*',onclick)
            if not match:raise ValueError('Lotte branch directory identity changed')
            row,end=json.JSONDecoder().raw_decode(onclick[match.end():])
            if not onclick[match.end()+end:].lstrip().startswith((')',',')):raise ValueError('Lotte branch directory literal changed')
            code=row['cstrCd'];name=row['cstrDspNm'];kind=row['lrclsDtlCdNm']
            if not re.fullmatch(r'\d{4}',code):raise ValueError('Invalid Lotte branch code')
            region='SEOUL' if row.get('mdclsDtlCdNm')=='서울지역' else None
            add(code,name,'https://www.lotteshopping.com/contents/shpgInfo?cstrCd='+code,region,
                officialName=kind+' '+name,venue='롯데'+kind+' '+name,
                officialNames=list(dict.fromkeys((rows.get(code,{}).get('officialNames') or [])+[kind+' '+name])))
    elif company=='HYUNDAI':
        for n in root.walk():
            if n.tag!='a':continue
            href=n.attrs.get('href','');name=n.text()
            if href=='https://thehyundaiseoul.ehyundai.com/':
                add('B00140000','더현대 서울',href,'SEOUL',mode='WEEKLY',address='서울특별시 영등포구 여의대로 108')
            elif '/DP/DP000000_V.do' in href:
                code=parse_qs(urlsplit(href).query).get('branchCd',[''])[0]
                if re.fullmatch(r'B\d{8}',code):add(code,name,urljoin(DIRECTORIES[company],href),mode='LEGACY')
    elif company=='SHINSEGAE':
        for n in root.walk():
            href=n.attrs.get('href','')
            if n.tag!='a' or not href.startswith('/shopping/list.do?'):continue
            code=parse_qs(urlsplit(href).query).get('storeCd',[''])[0]
            if re.fullmatch(r'SC\d{5}',code):add(code,n.text(),urljoin(DIRECTORIES[company],href),venue='신세계백화점 '+n.text())
    else:
        # Public literal directory; do not execute the surrounding JS.
        for m in re.finditer(r"\{\s*id\s*:\s*'([a-z]+)'\s*,\s*brand\s*:\s*'[a-z]+'\s*,\s*order\s*:\s*\d+\s*,\s*nameKo\s*:\s*'([^']+)'",html):
            add(m[1],m[2],f'https://www.starfield.co.kr/{m[1]}/eventBenefit/events',venue='스타필드 '+m[2])
    if not rows:raise ValueError('Official branch directory returned no recognized records')
    return list(rows.values())

def next_values(html):
    """Read JSON-valued Next Flight lines. No eval, JS execution, or credentials."""
    decoder=json.JSONDecoder();streams=[]
    for m in re.finditer(re.escape('self.__next_f.push('),html):
        try:value,_=decoder.raw_decode(html[m.end():])
        except ValueError:continue
        if isinstance(value,list) and len(value)>1 and value[0]==1 and isinstance(value[1],str):streams.append(value[1])
    for line in ''.join(streams).splitlines():
        try:yield json.loads(line.partition(':')[2])
        except ValueError:continue

def objects(value):
    if isinstance(value,dict):
        yield value
        for item in value.values():yield from objects(item)
    elif isinstance(value,list):
        for item in value:yield from objects(item)

def literal_object(html,name):
    matches=list(re.finditer(r'\bvar\s+'+re.escape(name)+r'\s*=\s*',html))
    if len(matches)!=1:raise ValueError('Official JSON literal missing/conflicting: '+name)
    value,_=json.JSONDecoder().raw_decode(html[matches[0].end():])
    if not isinstance(value,dict):raise ValueError('Official JSON literal is not an object')
    return value

def bootstrap(branch,read):
    html=read(branch['url'],'bootstrap');root=Tree(html).root
    company=branch['company'];meta={}
    if company=='LOTTE':
        if 'C00903' not in html or '/contents/shpgInfoList' not in html or branch['name'] not in html:
            raise ValueError('Lotte inventory bootstrap changed')
        store=read('https://www.lotteshopping.com/store/main?cstrCd='+branch['code'],'store')
        addresses=class_text(Tree(store).root,'__address')
        if len(set(addresses))!=1:raise ValueError('Lotte branch address missing/conflicting')
        meta['address']=addresses[0]
        meta['region']=address_region(addresses[0])
        if meta['region']!=branch['region']:raise ValueError('Official branch address outside configured region')
    elif company=='STARFIELD':
        if f'/api/{branch["code"]}/event/eventList.do' not in html:raise ValueError('Starfield inventory bootstrap changed')
        # Check both event and brand feeds: popup notices can appear in either.
        brand=read(branch['url'].replace('/events','/brand'),'brand-bootstrap')
        if f'/api/{branch["code"]}/event/eventList.do?evt_gbn=brand' not in brand:
            raise ValueError('Starfield brand feed bootstrap changed')
    elif company=='HYUNDAI' and branch.get('mode')=='LEGACY':
        links=[urljoin(branch['url'],n.attrs['href']) for n in root.walk() if n.tag=='a' and '/SN/SN_0101000.do' in n.attrs.get('href','')]
        if not links:raise ValueError('Hyundai branch shopping-news link missing')
        news=read(links[0],'news-bootstrap')
        codes=set(re.findall(r"var\s+curtMblDmCd\s*=\s*'([A-Z0-9]+)'",news))
        if len(codes)!=1 or '/SN/GetCmsContentsAJX.do' not in news:raise ValueError('Hyundai official feed identity changed')
        meta['mblDmCd']=codes.pop()
    return html,meta

def address_region(value):
    if value.startswith(('서울특별시','서울시','서울 ')):return 'SEOUL'
    if value.startswith(('경기도','경기 ')):return 'GYEONGGI'
    return None

def inventory_page(branch,cursor,read,bootstrap_html,meta):
    """Return rows, total and next cursor. Cursor represents an actual feed page."""
    company=branch['company'];page=cursor.get('page',1);feed=cursor.get('feed',0)
    if company=='LOTTE':
        html=read(LIST_URL,'list-'+str(page),{'cntsTpCd':'C00903','page':page,'size':12,'totalCnt':cursor.get('total',0),'cstrCd':branch['code'],'ctegryLrclsCdList':''})
        rows,more,total=parse_page(html,page)
        rows=[{**r,'url':DETAIL_BASE+r['id']} for r in rows]
        return rows,total,{'page':page+1,'total':total} if more else None
    if company=='STARFIELD':
        kind=('event','brand')[feed]
        url=f'https://www.starfield.co.kr/api/{branch["code"]}/event/eventList.do?'+urlencode({'evt_gbn':kind,'lang':'ko','pageIndex':page})
        value=json.loads(read(url,kind+'-'+str(page)));pagination=value.get('paginationInfo',{});rows=value.get('data')
        total=pagination.get('totalRecordCount');pages=pagination.get('totalPageCount')
        if type(total)!=int or total<0 or type(pages)!=int or pages<1 or not isinstance(rows,list) or pagination.get('currentPageNo')!=page:
            raise ValueError('Starfield pagination protocol changed')
        records=[{'id':str(r['evt_seq']),'url':f'https://www.starfield.co.kr/{branch["code"]}/eventBenefit/{"events" if feed==0 else "brand"}/'+str(r['evt_seq']),
                  'title':r.get('evt_title') or r.get('evt_nm') or r.get('evt_titl') or '', 'raw':r,'feed':kind} for r in rows]
        nxt={'page':page+1,'feed':feed} if page<pages else {'page':1,'feed':1} if feed==0 else None
        return records,total,nxt
    if company=='SHINSEGAE':
        data=literal_object(bootstrap_html,'g_shoppingInfo');rows=data.get('page')
        if not isinstance(rows,list):raise ValueError('Shinsegae inventory missing')
        records=[]
        for row in rows:
            if row.get('storeCd')!=branch['code']:raise ValueError('Shinsegae listing crossed branches')
            url=urljoin(branch['url'],row.get('link',''))
            if urlsplit(url).hostname!='www.shinsegae.com' or not urlsplit(url).path.startswith('/cms12/'+branch['code']+'/'):
                raise ValueError('Shinsegae detail URL outside branch')
            records.append({'id':str(row['id']),'title':row.get('title1',''),'url':url,'raw':row})
        return records,len(records),None
    if branch.get('mode')=='WEEKLY':
        links=[urljoin(branch['url'],n.attrs['href']) for n in Tree(bootstrap_html).root.walk() if n.tag=='a' and '/issue-diary/' in n.attrs.get('href','') and 'WEEKLY POP-UP' in n.text()]
        if not links:raise ValueError('Hyundai weekly popup list missing')
        rows={}
        for i,url in enumerate(dict.fromkeys(links)):
            html=read(url,'weekly-'+str(i))
            article_rows={}
            for value in next_values(html):
                for row in objects(value):
                    if 'diary_id' in row and 'period_start' in row and 'period_end' in row and row.get('is_visible') is True:
                        if row['diary_id']!=url.rsplit('/',1)[-1]:raise ValueError('Hyundai weekly item identity crossed diaries')
                        article_rows[str(row['id'])]={'id':str(row['id']),'title':row['title'],'url':url,'raw':row}
            # The official slider reports its visible inventory size.
            size=re.findall(r'(\d+)\s*/\s*(\d+)',Tree(html).root.text())
            counts={int(b) for a,b in size if int(a)==1}
            if not article_rows or counts and len(article_rows)!=max(counts):raise ValueError('Hyundai weekly visible count disagrees with payload')
            if set(rows).intersection(article_rows):raise ValueError('Hyundai weekly item duplicated across diaries')
            rows.update(article_rows)
        return list(rows.values()),len(rows),None
    kind=('01','03','04')[feed]
    query=urlencode({'apiID':'ifAppHdcms012','param':f'mblDmCd={meta["mblDmCd"]}&evntCrdTypeCd={kind}&pageSize=9&page={page}'})
    value=json.loads(read('https://www.ehyundai.com/newPortal/SN/GetCmsContentsAJX.do?'+query,'hyundai-'+kind+'-'+str(page))).get('result',{})
    total=value.get('totalCount');items=value.get('items');pages=value.get('pageCount',1)
    if value.get('result')!='200' or type(total)!=int or total<0 or not isinstance(items,list) or type(pages)!=int or value.get('currentPage',page)!=page:
        raise ValueError('Hyundai feed result/pagination changed')
    categories={'01':'event','03':'culture','04':'special'}
    rows=[{'id':r['evntCrdCd'],'title':r.get('evntCrdNm',''),'raw':r,'feed':kind,
           'url':'https://www.ehyundai.com/newPortal/SN/SN_0201000.do?'+urlencode({'evntCrdCd':r['evntCrdCd'],'category':categories[kind],'branchCd':branch['code']})} for r in items]
    nxt={'page':page+1,'feed':feed} if page<pages else {'page':1,'feed':feed+1} if feed<2 else None
    return rows,total,nxt

def date_value(value):
    if re.fullmatch(r'\d{14}',str(value or '')):return date.fromisoformat(value[:4]+'-'+value[4:6]+'-'+value[6:8])
    return date.fromisoformat(str(value or '').replace('.','-')[:10])

def event_record(branch,item,scope,read):
    """No unknown dates are fabricated. Ambiguous summaries become research jobs."""
    first,last=date.fromisoformat(scope['startDate']),date.fromisoformat(scope['endDate'])
    if branch['company']=='LOTTE':
        if branch['name'] not in item['location']:return None,'OTHER_BRANCH'
        if PERMANENT.search(item['title']):return None,'PERMANENT_OR_PROMOTION'
        html=read(item['url'],'detail-'+item['id'])
        from lotte_popup_sources import detail_version
        item['detailSourceDigest']=detail_version(html,item)
        event=parse_detail(html,item,first,last,branch,include_outside=True)
        if not event:return None,'NON_POPUP'
        if all(date.fromisoformat(o['endDate'])<first or date.fromisoformat(o['startDate'])>last for o in event['occurrences']):return None,'OUTSIDE_WINDOW'
        return event,None
    raw=item['raw'];company=branch['company'];title=' '.join(item['title'].split())
    if company=='SHINSEGAE':
        if not POPUP.search(title+' '+str(raw.get('badge1',''))):return None,'NON_POPUP'
        detail=json.loads(read(item['url'],'detail-'+item['id']))
        if detail.get('stor_cd')!=branch['code']:raise ValueError('Shinsegae detail branch mismatch')
        visible=str(detail.get('expDt') or raw.get('expDt',''))
        m=re.fullmatch(r'\s*(\d{2,4})\.(\d{1,2})\.(\d{1,2})\([^)]*\)\s*[-~]\s*(\d{2,4})\.(\d{1,2})\.(\d{1,2})\([^)]*\)\s*',visible)
        if not m:raise ValueError('Shinsegae individual popup dates require detail research')
        parts=list(map(int,m.groups()));parts[0]+=2000 if parts[0]<100 else 0;parts[3]+=2000 if parts[3]<100 else 0
        start,end=date(*parts[:3]),date(*parts[3:]);place=' '.join(str(raw.get(k,'')).strip() for k in ('viewNm','floorNm')).strip()
        image=urljoin(item['url'],detail.get('repr_img',''));description=title
    elif company=='HYUNDAI' and branch.get('mode')=='WEEKLY':
        start,end=date_value(raw.get('period_start')),date_value(raw.get('period_end'));place=raw.get('place','')
        image=raw.get('hero_image_url','');description='\n'.join(str(b.get('text','')) for b in raw.get('blocks',[]) if b.get('type')=='paragraph')
    elif company=='HYUNDAI':
        if not POPUP.search(title):
            if re.search(r'세일|할인|사은|혜택|적립|쿠폰|SALE',title,re.I):return None,'PROMOTION'
            raise ValueError('Hyundai card without popup type requires detail research')
        if raw.get('evntCrdPrivateFlagYn')=='Y':return None,'PRIVATE_NOTICE'
        start,end=date_value(raw.get('evntStrtDt')),date_value(raw.get('evntEndDt'))
        if raw.get('expsEvntYn',{}).get('value')=='Y':
            start,end=date_value(raw.get('expsEvntStartDt')),date_value(raw.get('expsEvntEndDt'))
        place=raw.get('evntPlceNm') or raw.get('evntFlrCd',{}).get('label','')
        image=urljoin('https://imgprism.ehyundai.com/',raw.get('imgPath2',''));description=title
    else:
        if not title:raise ValueError('Starfield event title missing')
        if not POPUP.search(title):
            if re.search(r'할인|사은|혜택|적립|쿠폰',title):return None,'PROMOTION'
            raise ValueError('Starfield notice without popup type requires detail research')
        if raw.get('evt_prid_disp_yn')!='Y':raise ValueError('Starfield dates are not displayed as event dates')
        start,end=date_value(raw.get('evt_strt_dt')),date_value(raw.get('evt_end_dt'));place=raw.get('evt_loc') or raw.get('evt_place') or ''
        image=urljoin('https://www.starfield.co.kr/',raw.get('web_list_open_img_uri') or '')
        description=title
    if end<start:raise ValueError('Official popup end precedes start')
    if end<first or start>last:return None,'OUTSIDE_WINDOW'
    if not title or not place:raise ValueError('Official individual popup name/place missing')
    images=[]
    parsed=urlsplit(image)
    if parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password and parsed.port in (None,443) and parsed.path not in ('','/'):
        images=[dict(imageUrl=image,pageUrl=item['url'],rights='UNKNOWN',rightsEvidence=None,matchesEdition=True)]
    kind='POPUP_RETAIL' if re.search(r'스토어|SHOP|판매|굿즈',title,re.I) else 'POPUP_EXPERIENCE' if re.search(r'체험|경험',title) else 'POPUP_EXHIBITION' if re.search(r'전시',title) else 'POPUP_MIXED'
    return dict(name=title+' · '+branch['venue'],subcategory=kind,organizer=branch['venue'],edition=str(start.year),region=branch['region'],
                venueName=branch['venue']+' '+place,address=branch.get('address'),description=description[:2000],admission=None,subjects=[],
                occurrences=[dict(startDate=start.isoformat(),endDate=end.isoformat(),startTime=None,endTime=None)],
                sources=[dict(url=item['url'],kind='OFFICIAL',access='ORIGINAL',evidence=(title+' / '+start.isoformat()+' ~ '+end.isoformat()+' / '+place)[:240])],
                banners=images,warnings=['입장료·예약 방식·운영시간·취향 주제는 공식 안내 확인 필요'],eventFormat='SINGLE_HOST',
                discoveryLinks=[dict(kind='OFFICIAL',url=item['url'],status='PUBLISHED',note='공식 지점별 행사 안내')],
                operationStatus=dict(state='SCHEDULED',note='공식 목록의 행사 일정',sourceUrl=item['url'],checkedOn=first.isoformat())),None
