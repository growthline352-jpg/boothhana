#!/usr/bin/env python3
"""Real Chromium/WebKit optional: actual standalone offline HTML/JS/Service Worker/IndexedDB.
HTTP APIs/images are LOCAL TEST FIXTURES, NOT deployed Spring/OAuth/R2 or live event facts.
No npm build is needed for this public static reader. This is NOT a React integration test.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from functools import partial
import threading,json,io,time,sys,traceback,hashlib
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'verification/v21/results'
OUT.mkdir(exist_ok=True)
STATE={'withdraw':False,'revoke':False,'fail_json':False,'fail_image':False,'delay':0,'private_requests':[]}
img=Image.new('RGB',(800,450),'white');draw=ImageDraw.Draw(img)
for i in range(1,9):
 x=30+(i-1)%4*190;y=60+(i-1)//4*180
 draw.rectangle((x,y,x+140,y+120),outline='#2f6b55',width=3);draw.text((x+20,y+40),'BOOTH A'+str(i),fill='#15372a')
buf=io.BytesIO();img.save(buf,format='PNG');PNG=buf.getvalue();PNG_SHA256=hashlib.sha256(PNG).hexdigest()
BASE=''
def fixture(eid=101):
 return {'id':eid,'mode':'INFO_ONLY','publishedAt':'2026-09-18T03:00:00Z',
 'event':{'name':f'서울·경기 테스트 행사 {eid}','region':'GYEONGGI','subcategory':'DESIGN','venueName':'수원 테스트 전시장','address':'경기도 수원시 테스트 주소','description':'실제 행사가 아닌 검증 자료입니다. <img src=x onerror=alert(1)>','admission':'테스트 무료','occurrences':[{'startDate':'2026-09-20','endDate':'2026-09-20','startTime':'10:00','endTime':'17:00'}],'sources':[],'warnings':[],'privateNotes':'SHOULD_NOT_PERSIST'},
 'participants':[{'id':11,'participant':{'registrationName':'달토끼 테스트 부스','subjects':['굿즈'],'locations':[{'code':'A1','status':'ASSIGNED','hall':'A홀','zone':'굿즈','startDate':'2026-09-20','endDate':'2026-09-20'}],'officialLinks':[]},'sales':{'summary':'테스트 키링 판매 안내'},'productRows':[{'id':21,'data':{'name':'테스트 키링','summary':'구매·수령 검증용','price':{'amount':'5000','currency':'KRW','checkedOn':'2026-09-18'},'evidenceScope':'EVENT_SALE_CONFIRMED','saleState':'PLANNED','sources':[]},'verification':{'state':'CONFIRMED_CURRENT','lastSeenAt':'2026-09-18T03:00:00Z'}}]}],
 'assets':[{'id':31,'participantId':11,'productId':21,'type':'PRODUCT','url':BASE+'/fixture/product.png','credit':'로컬 검증용 이미지','attribution':BASE+'/fixture/credit','offlineAllowed':not STATE['revoke']},
 {'id':32,'participantId':None,'productId':None,'type':'BANNER','url':BASE+'/fixture/forbidden.png','credit':'미승인','offlineAllowed':False}],
 'banner':{'id':32},'note':'PRIVATE_ACCOUNT_NOTE','reservations':[{'order':'SECRET_ORDER'}]}
def plans():
 return {'plans':[{'id':'p1','assetId':41,'state':'READY','scope':{'title':'테스트 배치도','dates':['2026-09-20'],'hall':'A홀'},'imageUrl':BASE+'/fixture/plan.png','sourceUrl':BASE+'/fixture/credit','credit':'검증 전용 배치도','offlineAllowed':not STATE['revoke'],'sourceSha256':PNG_SHA256,'partial':False,'shapes':[]}], 'managedAssetIds':[41]}
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/') or path.startswith('/fixture/'):
   STATE['private_requests'].append({'path':path,'cookie':self.headers.get('Cookie'),'authorization':self.headers.get('Authorization')})
  if path.startswith('/api/public/catalog/events/'):
   if STATE['delay']:time.sleep(STATE['delay'])
   if STATE['withdraw'] or STATE['fail_json']:
    self.send_response(404 if STATE['withdraw'] else 500);self.end_headers();return
   try:eid=int(path.split('/')[5])
   except: self.send_error(400);return
   data=plans() if path.endswith('/floorplans') else fixture(eid)
   value=json.dumps(data,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(value);return
  if path.endswith('.png') and path.startswith('/fixture/'):
   if STATE['fail_image'] or path.endswith('forbidden.png'):self.send_error(500);return
   self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(PNG)));self.end_headers();self.wfile.write(PNG);return
  return super().do_GET()
async_js="""async ({base,id=101})=>{const s=await import('/offline/store.mjs');await s.syncOwner('guest');return s.downloadEvent({apiBase:base,eventId:id,owner:'guest',selection:[{type:'PRODUCT',id:21}],day:'2026-09-20'})}"""
def main():
 global BASE
 from playwright.sync_api import sync_playwright,expect
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'frontend/public')))
 BASE=f'http://127.0.0.1:{server.server_port}';threading.Thread(target=server.serve_forever,daemon=True).start()
 passed=[];errors=[]
 def ok(name,condition=True):
  assert condition,name
  passed.append(name);print('PASS',name,flush=True)
 try:
  with sync_playwright() as p:
   import shutil
   system_chromium=shutil.which('chromium')
   browser=p.chromium.launch(headless=True, **({'executable_path':system_chromium} if system_chromium else {}))
   context=browser.new_context(viewport={'width':390,'height':844},service_workers='allow')
   page=context.new_page();page.on('pageerror',lambda err:errors.append(str(err)))
   page.goto(BASE+'/offline/index.html');page.evaluate("() => window.alert=()=>{throw Error('UNSAFE_HTML_EXECUTION')}")
   context.add_cookies([{'name':'TEST_AUTH_ONLY','value':'do-not-cache-or-send','url':BASE}])
   result=page.evaluate(async_js,{'base':BASE})
   ok('save: public event + selected product + permitted image/map',not result['missing'])
   data=page.evaluate("async()=>{const s=await import('/offline/store.mjs');const p=await s.getPack(101);return {bytes:p.bytes,blobs:p.blobs.length,selected:p.participants[0].products[0].selected,json:JSON.stringify(p)}}")
   ok('public projection strips raw private note/order/unknown fields',all(x not in data['json'] for x in ['SHOULD_NOT_PERSIST','PRIVATE_ACCOUNT_NOTE','SECRET_ORDER']))
   ok('only two allowed image blobs saved; unapproved banner excluded',data['blobs']==2 and data['selected'])
   ok('public API/image fetches omit cookies and authorization',all(not x['cookie'] and not x['authorization'] for x in STATE['private_requests']))
   cache=page.evaluate("async()=>{const out=[];for(const n of await caches.keys())for(const r of await (await caches.open(n)).keys())out.push(r.url);return out}")
   ok('service worker caches ONLY isolated static /offline/ shell',len(cache)==7 and all('/offline/' in u for u in cache))
   page.goto(BASE+'/offline/index.html#101');expect(page.get_by_role('heading',name='서울·경기 테스트 행사 101',exact=True)).to_be_visible()
   context.set_offline(True);page.reload();expect(page.get_by_role('heading',name='서울·경기 테스트 행사 101',exact=True)).to_be_visible()
   expect(page.get_by_text('인터넷 연결 없음 · 저장된 자료를 보고 있습니다.',exact=True)).to_be_visible()
   ok('offline reload: cached HTML/JS + IndexedDB data without network')
   page.get_by_label('저장된 부스·상품 검색').fill('A1');expect(page.get_by_role('heading',name='달토끼 테스트 부스',exact=True)).to_be_visible();ok('offline search by booth number')
   page.get_by_label('내 목록에서 선택한 부스만').check();expect(page.get_by_role('heading',name='테스트 키링',exact=True)).to_be_visible();ok('offline selected public product list')
   expect(page.locator('img').first).to_be_visible();page.wait_for_function("[...document.images].every(i=>i.complete && i.naturalWidth>0)");ok('offline images and floorplan decode from local blobs')
   page.get_by_role('button',name='확대',exact=True).click();ok('offline simple floorplan zoom',page.locator('.plan-window img').evaluate("e=>e.style.width")=='150%')
   page.screenshot(path=str(OUT/'offline-mobile.png'),full_page=True)
   second=context.new_page();second.goto(BASE+'/offline/index.html#101');expect(second.get_by_role('heading',name='서울·경기 테스트 행사 101',exact=True)).to_be_visible();second.close();ok('new tab opens saved package completely offline')
   context.set_offline(False);page.wait_for_timeout(150)
   STATE['revoke']=True
   res=page.evaluate("async()=>{const s=await import('/offline/store.mjs');await s.revalidate(await s.getPack(101));return (await s.getPack(101)).blobs.length}")
   ok('online rights revocation removes persisted image/map blobs',res==0)
   STATE['revoke']=False
   await_same=page.evaluate("async()=>{const s=await import('/offline/store.mjs');await s.syncOwner('guest');return !!await s.getPack(101)}")
   ok('same confirmed owner preserves package',await_same)
   page.evaluate("async()=>{const s=await import('/offline/store.mjs');await s.syncOwner('member:9')}")
   ok('different confirmed account clears all prior packs',page.evaluate("async()=> (await (await import('/offline/store.mjs')).listPacks()).length")==0)
   # Atomic cancellation/owner change while network operation is in flight.
   page.evaluate("async()=>{const s=await import('/offline/store.mjs');await s.syncOwner('guest')}")
   STATE['delay']=0.25
   result=page.evaluate("""async base=>{const s=await import('/offline/store.mjs');const promise=s.downloadEvent({apiBase:base,eventId:101,owner:'guest'}).then(()=>false,()=>true);setTimeout(()=>s.syncOwner('member:10'),80);return {rejected:await promise,total:(await s.listPacks()).length}}""",BASE)
   STATE['delay']=0
   ok('pending prior-account export cannot resurrect after account switch',result['rejected'] and result['total']==0)
   STATE['fail_image']=True
   result=page.evaluate(async_js,{'base':BASE});ok('partial image failure is explicit, not a false complete download',bool(result['missing']))
   STATE['fail_image']=False;STATE['fail_json']=True
   kept=page.evaluate("""async base=>{const s=await import('/offline/store.mjs');const before=(await s.getPack(101)).savedAt;try{await s.downloadEvent({apiBase:base,eventId:101,owner:'guest'})}catch{}return before===(await s.getPack(101)).savedAt}""",BASE)
   STATE['fail_json']=False;ok('failed refresh retains prior valid package',kept)
   STATE['withdraw']=True
   gone=page.evaluate("async()=>{const s=await import('/offline/store.mjs');await s.revalidate(await s.getPack(101));return await s.getPack(101)}")
   STATE['withdraw']=False;ok('online withdrawal deletes the event package',gone is None)
   page.evaluate(async_js,{'base':BASE})
   expired=page.evaluate("""async()=>{await new Promise((yes,no)=>{const r=indexedDB.open('boothhana.offline.v18',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('packs','readwrite'),s=tx.objectStore('packs'),q=s.get(101);q.onsuccess=()=>s.put({...q.result,expiresAt:Date.now()-1});tx.oncomplete=()=>{db.close();yes()};tx.onerror=no}});return await (await import('/offline/store.mjs')).getPack(101)}""")
   ok('expired data is not displayed and is removed',expired is None)
   for eid in range(101,106):page.evaluate(async_js,{'base':BASE,'id':eid})
   rejected=page.evaluate("""async base=>{try{await (await import('/offline/store.mjs')).downloadEvent({apiBase:base,eventId:106,owner:'guest'});return false}catch{return true}}""",BASE)
   ok('sixth package rejected without deleting existing five',rejected and page.evaluate("async()=> (await (await import('/offline/store.mjs')).listPacks()).length")==5)
   page.evaluate("async()=>await (await import('/offline/store.mjs')).clearAll()")
   ok('explicit clear removes all offline data',page.evaluate("async()=> (await (await import('/offline/store.mjs')).listPacks()).length")==0)
   ok('no uncaught browser page errors',not errors)
   browser.close()
  status='PASS'
 except Exception as e:
  status='NOT_READY' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(e) or 'Executable doesn' in str(e) else 'FAIL';errors.append(str(e));traceback.print_exc()
 finally:
  server.shutdown();server.server_close()
  result={'state':status,'checks':passed,'count':len(passed),'errors':errors,'scope':'Real isolated offline reader / Chromium, LOCAL mocked HTTP API/images. No real React build, DB, OAuth, R2, CLI or device hardware.','productionApproval':False}
  (OUT/'browser-offline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 if status!='PASS':return 1
 return 0
if __name__=='__main__':sys.exit(main())
