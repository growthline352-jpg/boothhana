"""Region-first discovery covers public spaces, independent venues and new sources."""
from pathlib import Path
import json
from taxonomy import GROUPS

# Each format gets an independent job. Terms within a job are separate queries,
# not an AND expression requiring unrelated event formats in the same result.
TYPE_TERMS = {
    'COMIC_DOUJIN':['동인 행사','코믹 행사'], 'DOLL':['인형 행사','인형전'],
    'ONLY_EVENT':['온리전'], 'BIRTHDAY_CAFE':['생일카페'], 'FAN_CAFE':['팬카페'],
    'SUBCULTURE_MUSIC':['애니송 공연','보컬로이드 공연','버튜버 공연','라이브 아이돌'],
    'ANIME_GAME_FESTIVAL':['애니 게임 페스티벌'], 'ART_BOOK':['아트북 페어'],
    'BOARD_GAME':['보드게임 행사'], 'CHARACTER_ART':['캐릭터 아트 행사'],
    'ILLUSTRATION':['일러스트 페어'], 'STATIONERY_GOODS':['문구 굿즈 행사'],
    'CARD_COLLECTIBLES':['트레이딩 카드 행사'], 'FAN_CONVENTION':['팬 컨벤션'],
    'WINE':['와인 박람회'], 'WEDDING':['웨딩 박람회'], 'LIFESTYLE':['생활 박람회','캠핑 박람회','베이비페어'],
    'DESIGN':['디자인 박람회'], 'BUSINESS':['산업 박람회','커피 박람회','식품 박람회'],
    'WALK':['걷기 축제'], 'LIGHT':['빛 축제'], 'MUSIC':['음악 축제'],
    'FOOD':['음식 축제'], 'CULTURE':['문화 축제'], 'CONCERT':['콘서트'],
    'MUSIC_FESTIVAL':['뮤직 페스티벌'], 'POPUP_RETAIL':['팝업스토어'],
    'POPUP_EXPERIENCE':['팝업 체험관'], 'POPUP_EXHIBITION':['팝업 전시'],
    'POPUP_MIXED':['복합 팝업'],
}

SCHEDULES = {
    'SUBCULTURE_MUSIC':[{'url':'https://aroarohall.com/ticket', 'detailPattern':r'/ticket/[^/?#]+', 'listPattern':r'aroarohall\.com/ticket(?:[/?]|$)'}],
    'EXHIBITION':[{'url':'https://www.coex.co.kr/event/full-schedules/', 'adapter':'COEX', 'detailPattern':r'/exhibitions/[^/?#]+/?(?:\?|$)', 'listPattern':r'/event/full-schedules/?(?:\?|$)'}],
    'FESTIVAL':[{'url':'https://festival.seoul.go.kr/festival/search/list.do', 'detailPattern':r'festivalView\.do\?', 'listPattern':r'/festival/search/list\.do(?:\?|$)'}],
}


def typed_jobs(scope):
    jobs = []
    for category, types in GROUPS.items():
        for code in types:
            if code == 'POPUP_STORE':  # compatibility type, never new collection
                continue
            terms = TYPE_TERMS[code]
            queries = ['(서울 OR 경기) "'+term+'" {year} 행사 일정 {start_date} {end_date}' for term in terms]
            if category == 'SUBCULTURE':
                queries.extend(['site:takemm.com/prod/view "'+terms[0]+'" {year}',
                                '(site:booking.naver.com OR site:ticketlink.co.kr) "'+terms[0]+'" {year}'])
            elif category == 'EXHIBITION':
                queries.append('(site:coex.co.kr OR site:kintex.com OR site:setec.or.kr) "'+terms[0]+'" {year}')
            elif category == 'FESTIVAL':
                queries.append('site:go.kr "'+terms[0]+'" {year} 일정')
            else:
                queries.append('(site:booking.naver.com OR site:lotteshopping.com OR site:ehyundai.com) "'+terms[0]+'" {year}')
            schedules = SCHEDULES.get(code, SCHEDULES.get(category, []))
            jobs.append(dict(kind='TYPE_SOURCE', category=category, subject='유형별 / '+code,
                priority=0, cadenceDays=1, scope=dict(scope), origin='TYPE_DISCOVERY',
                payload=dict(sourceType='TYPE_DISCOVERY', searchType=code, region='서울·경기',
                    queryTemplates=queries, seeds=[row['url'] for row in schedules],
                    schedules=schedules, requireFactEvidence=True)))
    return jobs

def regional_jobs(scope,path=None):
    path=path or Path(__file__).with_name('regional_discovery.json')
    profile=json.loads(Path(path).read_text(encoding='utf-8'))
    if profile.get('schemaVersion')!='1' or set(profile.get('categories',{}))!=set(GROUPS):
        raise ValueError('Regional discovery profile categories mismatch')
    rows=[]
    for region in profile['regions']:
        places=region['places']
        if region.get('region') not in ('서울','경기') or not places:raise ValueError('Regional discovery area invalid')
        for category,options in profile['categories'].items():
            queries=[]
            # Separate places are separate searches. Joining districts with spaces
            # requires both names in a result and hides independent local events.
            for place in places:
                area=region['region']+' '+place
                queries.append(area+' '+options['terms'][0]+' {year} 행사 일정 {start_date} ~ {end_date}')
            for term in options['terms'][1:]:
                area=' OR '.join(region.get('aliases') or places[:2])
                queries.append(region['region']+' ('+area+') '+term+' {year} 일정')
            if category=='POPUP':queries.append(region['region']+' '+' '.join(region.get('aliases') or places[:2])+' 팝업 오픈 예정 사전예약 {year} {month}')
            rows.append({'kind':'REGIONAL_SOURCE','category':category,'subject':region['name']+' / '+category,
                'priority':0 if category in ('POPUP','SUBCULTURE') else 1,'cadenceDays':options['cadenceDays'],
                'scope':dict(scope),'origin':'REGIONAL_DISCOVERY',
                'payload':{'sourceType':'REGIONAL_DISCOVERY','region':region['region'],'places':places,
                    'aliases':region.get('aliases',[]),'queryTemplates':queries,'seeds':[],
                    'openingFocus':'UPCOMING' if category=='POPUP' else 'ALL'}})
    return rows

def run_regional_jobs(run,limit=8):
    """Failures stay with one job. A CLI/runtime budget stop retains unattempted jobs."""
    from weekly import BudgetExceeded
    jobs=[*run.discovery_work_queue.due('TYPE_SOURCE',limit),*run.discovery_work_queue.due('REGIONAL_SOURCE',limit)]
    jobs.sort(key=lambda item:(bool(item.get('lastAttemptAt')),item.get('lastAttemptAt') or '',
                               0 if item['kind']=='TYPE_SOURCE' else 1,item['key']))
    jobs=jobs[:limit];attempted=0
    for item in jobs:
        try:
            run.discovery_work_item(item);attempted+=1
        except BudgetExceeded as exc:
            run.issue('regional-budget',exc)
            break
        except Exception as exc:
            attempted+=1;run.issue('region-'+item['key'][:16],exc)
    return {'selected':len(jobs),'attempted':attempted,'deferred':len(jobs)-attempted,
            'incomplete':sum(item.get('state') not in ('COMPLETE','NO_RESULTS') for item in jobs[:attempted])}
