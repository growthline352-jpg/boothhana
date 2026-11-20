"""Score narrow, independently checked claims. These are not population accuracy rates."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'collector'))
from run import audit_opened_urls
BASE=Path(__file__).parent
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def candidate(case):return read(BASE/case/'extraction.json')['result']
sales=read(next((BASE/'sales-comic242').rglob('search-result.json')))['sales']['products']
names=['나안아 히나','나안아 리제','나안아 타비','나안아 부키','나안아 린','나안아 나나','부키','린','리코']
expected_event={'name':'코믹월드 338 수원','venueName':'수원메쎄 전관','startDate':'2026-10-24','endDate':'2026-10-25','startTime':'11:00','endTime':'16:30'}
event=candidate('discovery-comic338')['events'][0];actual={**event,**event['occurrences'][0]}
media={'게임','애니메이션','만화·웹툰','소설','오리지널·기타'}
chars=[]
for case,name in [('character-hina','시라유키 히나'),('character-miku','初音ミク')]:
 a=candidate(case)['assignments'][0]
 chars.append({'case':case,'nameCorrect':a['character']['name']==name,'basis':a['basis'],'workMedium':a['work']['medium'],'workMediumAcceptedByBackend':a['work']['medium'] in media,'characterMediumLength':len(a['character']['medium']),'characterMediumWithinBackendLimit':len(a['character']['medium'])<=24})
cases=[]
for folder in sorted(p for p in BASE.iterdir() if p.is_dir()):
 s=folder/'summary.json'
 if not s.exists():continue
 v=read(s);d=folder/'decision.json';decision=read(d) if d.exists() else v.get('verdict',{})
 cases.append({'id':folder.name,'state':v['state'],'verdict':decision.get('verdict'),'error':v.get('error'),'seconds':v['seconds'],'harness':v.get('harness','scoped extraction + custom review')})
audit={}
for case,stage in [('sales-comic242','extract'),('discovery-comic338','review')]:
 p=next(p for p in (BASE/case).rglob('codex.jsonl') if p.parent.name==stage)
 audit[case]={'stage':stage,'recognizedOpenedUrls':audit_opened_urls(p)}
result={'populationAccuracy':None,'warning':'Convenience sample; raw extraction agreement is not validated publication accuracy. No API/DB writes.',
 'cases':cases,'eventFacts':{'source':'https://comicw.net/e/338/8','correct':sum(actual[k]==v for k,v in expected_event.items()),'total':len(expected_event)},
 'salesOptions':{'source':'https://comicw.net/g/242','expected':len(names),'returned':len(sales),'matchedNames':sum(p['name'] in names for p in sales),'correctPrices':sum(p['name'] in names and p['price']['amount']=='4000' and p['price']['currency']=='KRW' for p in sales),'reviewReached':False},
 'creatorGranularity':{'sources':['https://comicw.net/g/242','https://comicw.net/g/916'],'expectedOptionRowsAcrossForms':15,'returnedFormRows':len(candidate('creator-susu')['goods']),'uniqueProductsAcrossForms':None},
 'characters':chars,'auditExamples':audit}
(BASE/'scores.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
