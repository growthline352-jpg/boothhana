"""Seed UI fixtures only in the explicitly named local disposable test DB."""
import os,subprocess,json,uuid
from pathlib import Path
if os.getenv('PGHOST')!='127.0.0.1' or os.getenv('PGPORT')!='55439' or os.getenv('PGDATABASE')!='boothhana_release_test':raise SystemExit('Dedicated local test database required')
def run(sql):return subprocess.run(['psql','-q','-X','-v','ON_ERROR_STOP=1','-At'],input=sql,text=True,encoding='utf-8',capture_output=True,check=True).stdout.strip()
def quote(v):return "'"+str(v).replace("'","''")+"'"
def j(v):return quote(json.dumps(v,ensure_ascii=False))+'::jsonb'
assert run('select current_database()')=='boothhana_release_test'
# Existing automated-test fixtures are left intact, but excluded from this UI scenario.
run("update subculture_event_candidate set review_state='EXCLUDED' where name='[TEST] memory event'")
key=uuid.uuid4().hex*2
actor=int(run("insert into app_user(kakao_subject,display_name) values('local-ui-"+uuid.uuid4().hex+"','로컬 검증 사용자') returning id"))
event=int(run(f"insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values('{key}','{key}','[로컬 테스트] 창작 마켓','ONLY_EVENT','2026-10-17','2026-10-18','{{}}','{key}','[]','REVIEWED') returning id"))
participant=int(run(f"insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values({event},'{key}','로컬 테스트 작가','{{}}','{key}','REVIEWED') returning id"))
product=int(run(f"insert into subculture_catalog_product(participant_id,identity_key,name,payload_json) values({participant},'{key}','테스트 캐릭터 키링','{{}}') returning id"))
member={'name':'로컬 테스트 작가','kind':'ARTIST','aliases':[],'profileUrl':'https://example.com/artist'}
creator=int(run(f"insert into subculture_exhibitor(identity_key,name,profile_json) values('{key}','로컬 테스트 작가',{j(member)}) returning id"))
run(f"insert into subculture_participant_member values({participant},{creator}); insert into subculture_sales(participant_id,payload_json,payload_hash,review_state) values({participant},'{{}}','{key}','REVIEWED')")
source={'url':'https://example.com','kind':'OFFICIAL','access':'ACCESSIBLE','evidence':'Local fixture only'}
e={'name':'[로컬 테스트] 창작 마켓','subcategory':'ONLY_EVENT','organizer':'로컬 검증','edition':'테스트 회차','region':'서울','venueName':'테스트 행사장','address':None,'description':'실제 행사가 아닙니다. 운영 코드와 로컬 DB 연결 검증용입니다.','admission':'검증용','subjects':[],'occurrences':[{'startDate':'2026-10-17','endDate':'2026-10-18','startTime':'11:00','endTime':'18:00'}],'sources':[source],'banners':[],'warnings':[]}
p={'identity':None,'sourceEntryId':None,'registrationName':member['name'],'kind':'CIRCLE','members':[member],'locations':[{'code':'A-12','status':'CONFIRMED','hall':'1관','zone':None,'startDate':'2026-10-17','endDate':'2026-10-18','floorPlanUrl':None}],'subjects':['테스트 캐릭터'],'description':'검증용 작가','officialLinks':['https://example.com/artist'],'sources':[source],'images':[],'warnings':[]}
g={'identity':None,'sourceEntryId':None,'name':'테스트 캐릭터 키링','summary':'실제 판매물이 아닌 로컬 검증용 상품','memberName':member['name'],'categories':['키링'],'subjects':['테스트 캐릭터'],'evidenceScope':'EVENT_SALE_CONFIRMED','price':{'amount':'12000','currency':'KRW','checkedOn':'2026-10-08','note':None},'saleState':'PLANNED','productUrl':'https://example.com/product','sources':[source],'images':[],'warnings':[]}
sales={'summary':'키링 판매표','evidenceScope':'EVENT_SALE_CONFIRMED','categories':['키링'],'subjects':['테스트 캐릭터'],'salesMethod':None,'sources':[source],'images':[],'products':[g],'warnings':[]}
snapshot={'id':event,'mode':'INFO_ONLY','event':e,'participants':[{'id':participant,'participant':p,'sales':sales,'productIds':{str(product):product},'productRows':[{'id':product,'data':g,'verification':{'state':'CONFIRMED_CURRENT','lastSeenAt':'2026-10-08T08:00:00Z'}}]}],'publishedAt':'2026-10-08T08:00:00Z'}
run(f"insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values({event},{j(snapshot)},1)")
work,character=uuid.uuid4(),uuid.uuid4()
run(f"insert into subculture_subject(id,kind,name,medium,source_url,reviewed_by) values('{work}','WORK','로컬 테스트 게임','게임','https://example.com/work',{actor}); insert into subculture_subject(id,kind,name,work_id,source_url,reviewed_by) values('{character}','CHARACTER','테스트 캐릭터','{work}','https://example.com/character',{actor}); insert into subculture_subject_link(id,subject_id,kind,target_id,event_id,participant_id,source_url,evidence,reviewed_by) values('{uuid.uuid4()}','{character}','PRODUCT',{product},{event},{participant},'https://example.com/product','검증용 관계',{actor}); insert into subculture_subject_link(id,subject_id,kind,target_id,source_url,evidence,reviewed_by) values('{uuid.uuid4()}','{character}','CREATOR',{creator},'https://example.com/art','작업 관계 검증',{actor})")
Path(__file__).with_name('local-preview-ids.json').write_text(json.dumps({'event':event,'participant':participant,'product':product,'creator':creator,'work':str(work),'character':str(character)},indent=2))
print('Local fixture seeded. No production data accessed.')
