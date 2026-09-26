/* v9: actual TypeScript/TSX functions and handlers. Explicit hook harness, NOT React DOM. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {harness,toHtml,nodes,root}=require('../v6/source_harness.cjs')
let count=0;const ok=(condition,label)=>{assert.ok(condition,label);count++;console.log('PASS '+label)}
const event=JSON.parse(fs.readFileSync(path.join(root,'collector/examples/v5/events.json'))).events[0]
const p=JSON.parse(fs.readFileSync(path.join(root,'collector/examples/v5/participants.json'))).participants[0]
const sale=JSON.parse(fs.readFileSync(path.join(root,'collector/examples/v5/sales.json'))).sales
const d=(a,b=a)=>({startDate:a,endDate:b,startTime:'11:00',endTime:'17:00'})
const e={...event,name:'[TEST] 방문 경험 검증 행사',occurrences:[d('2026-09-16'),d('2026-09-17'),d('2026-09-20')],sources:[{url:'https://official.example.com/info',kind:'OFFICIAL',access:'ORIGINAL',evidence:'가상 테스트'}],operationStatus:{state:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null},warnings:[]}
const loc=(code,day,hall='1관')=>({code,status:'ASSIGNED',hall,zone:null,startDate:day,endDate:day,floorPlanUrl:null})
const row={id:1,participant:{...p,registrationName:'[TEST] 달토끼공방',locations:[loc('B1','2026-09-16'),loc('Z1','2026-09-17')],subjects:['문구']},sales:{...sale,summary:'달토끼 키링과 스티커',products:[{...sale.products[0],name:'[TEST] 달토끼 키링',evidenceScope:'EVENT_LISTED',saleState:'SOLD_OUT'}]},productRows:undefined}
const other={...row,id:2,participant:{...row.participant,registrationName:'[TEST] 첫날 공방',locations:[loc('B1','2026-09-16')]}}
const unknown={...row,id:3,participant:{...row.participant,registrationName:'[TEST] 날짜 확인 중',locations:[]},sales:null}
const secondHall={...row,id:4,participant:{...row.participant,registrationName:'[TEST] 다른 홀',locations:[loc('Z1','2026-09-17','2관')]}}
const value={id:10,mode:'INFO_ONLY',event:e,participants:[row,other,unknown,secondHall],assets:[],banner:null,publishedAt:'2026-09-16T00:00:00Z'}
const h=harness(),v=h.load('frontend/src/features/visit/visit.ts'),b=h.load('frontend/src/features/discovery/browse.ts'),status=h.load('frontend/src/features/visit/eventStatus.ts')
for(const day of ['2026-02-30','x','2026-13-01','2026-00-01',null])ok(!v.validDay(day),'invalid date rejected '+day)
ok(v.validDay('2028-02-29'),'leap day accepted')
ok(JSON.stringify(v.visitDays(e))===JSON.stringify(['2026-09-16','2026-09-17','2026-09-20']),'visit options preserve closed gaps')
ok(v.defaultDay(e,null,'2026-09-17')==='2026-09-17','today is default only when actual operating date')
ok(v.defaultDay(e,null,'2026-09-18')==='2026-09-20','closed day defaults to next actual date')
ok(v.defaultDay(e,'2026-09-16','2026-09-17')==='2026-09-16','explicit date overrides default')
ok(v.defaultDay(e,'2026-09-19','2026-09-17')==='2026-09-17','invalid linked date falls back to confirmed date')
ok(v.attendance(row,'2026-09-17','1관')==='confirmed','second-day location confirmed')
ok(v.relevantLocations(row.participant.locations,'2026-09-17','1관')[0].code==='Z1','only Z1 shown for second day')
ok(v.attendance(other,'2026-09-17')==='other','first-day-only row excluded for second day')
ok(v.attendance(unknown,'2026-09-17')==='unknown','missing locations not called absent')
ok(v.attendance(secondHall,'2026-09-17','1관')==='other','duplicate code in other hall not merged')
const params=v.parseVisit(new URLSearchParams('day=2026-09-17&hall=1관&view=map&booth=1&q=키링&adminToken=secret'),e)
const query=v.visitParams(params).toString()
ok(query.includes('booth=1')&&query.includes('view=map'),'share link retains booth and view')
ok(!query.includes('secret')&&!query.includes('adminToken'),'share allowlist strips arbitrary query/private params')
ok(v.parseVisit(new URLSearchParams('booth=-1&focus=Infinity'),e).booth===null,'invalid booth link ID rejected')
for(const address of ['서울 모처','비공개','서울특별시 마포구 비공개','경기도 고양시 킨텍스로 217'])ok(!v.usableAddress(address),'no invented map address '+address)
ok(v.usableAddress('서울특별시 중구 을지로 281'),'explicit published Seoul address usable')
ok(!v.publicLink('javascript:alert(1)')&&!v.publicLink('https://user:pass@example.com'),'unsafe reference URL refused')
for(const state of ['CANCELED','POSTPONED','RESCHEDULED']){
 const result=status.eventStatus({...e,operationStatus:{state,note:'공식 안내',sourceUrl:'https://example.com/notice',checkedOn:'2026-09-16'}},'2026-09-16')
 ok(result.state===state.toLowerCase()&&result.label!=='개최 예정','explicit operation status overrides time '+state)
}
const old=status.eventStatus({...e,operationStatus:undefined,warnings:['취소 안내 미확인']},'2026-09-16')
ok(old.state==='unknown'&&old.notice.includes('취소'),'legacy warning shown neutrally, no cancellation inference')
ok(status.eventStatus(e,'2026-09-16').state==='today','normal actual operating day unchanged')
for(const [period,today,from,to] of [['weekend','2026-09-17','2026-09-19','2026-09-20'],['weekend','2026-09-20','2026-09-20','2026-09-20'],['nextmonth','2026-12-30','2027-01-01','2027-01-31'],['nextmonth','2028-01-01','2028-02-01','2028-02-29']]){const r=b.periodRange(period,today);ok(r.from===from&&r.to===to,`${period} valid interval at ${today}`)}
ok(!!b.parseBrowse(new URLSearchParams('period=custom&from=2026-09-31&to=2026-10-01')).dateError,'invalid custom date blocks query')
ok(!!b.parseBrowse(new URLSearchParams('period=custom&from=2026-10-20&to=2026-10-01')).dateError,'reversed range shown as error')
const custom=b.browseApiParams(b.parseBrowse(new URLSearchParams('period=custom&from=2026-10-10&to=2026-10-13')),'2026-09-16')
ok(custom.get('from')==='2026-10-10'&&custom.get('to')==='2026-10-13','date selection sent as exact server filter')
const app=harness({location:{pathname:'/discover/10',search:'?day=2026-09-17&hall=1관'},remote:{loading:false,error:null,data:value,reload:async()=>{}}})
const detail=app.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogEventDetail
let tree=app.render(detail,{eventId:'10',value},true)
const cards=()=>nodes(tree).filter(n=>n.type?.name==='ParticipantCard')
ok(cards().length===2,'common visit filter shows one confirmed and one unknown row')
ok(cards().every(n=>n.props.day==='2026-09-17'&&n.props.hall==='1관'),'cards share same date/hall')
let card=cards()[0],button=nodes(card.type(card.props)).find(n=>n.props?.['aria-haspopup']==='dialog'),trigger={isConnected:true,focus(){}}
button.props.onClick({currentTarget:trigger});tree=app.render(detail,{eventId:'10',value})
let drawer=nodes(tree).find(n=>n.type?.name==='BoothDrawer')
ok(drawer.props.day==='2026-09-17'&&drawer.props.hall==='1관','drawer shares common context')
ok(app.location.search.includes('booth=1')&&app.history.length===1,'opening drawer creates back entry + shareable URL')
drawer.props.close();tree=app.render(detail,{eventId:'10',value})
ok(!app.location.search.includes('booth=')&&app.calls.includes('NAV:-1'),'close returns to same context without navigating away')
card=cards()[0];nodes(card.type(card.props)).find(n=>n.props?.children==='지도에서 보기').props.onClick();tree=app.render(detail,{eventId:'10',value})
const mapNode=nodes(tree).find(n=>n.type?.name==='InteractiveFloorPlans')
ok(app.location.search.includes('view=map')&&mapNode.props.focusParticipantId===1,'list map action selects matching participant')
ok(mapNode.props.day==='2026-09-17'&&mapNode.props.query==='','list map action keeps visit day and clears conflicting query')
const direct=harness({location:{pathname:'/discover/10',search:'?day=2026-09-17&booth=1',state:null}})
const directDetail=direct.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogEventDetail
let directTree=direct.render(directDetail,{eventId:'10',value},true),directDrawer=nodes(directTree).find(n=>n.type?.name==='BoothDrawer')
ok(directDrawer.props.row.id===1,'shared link directly opens public booth')
directDrawer.props.close();ok(!direct.calls.includes('NAV:-1')&&!direct.location.search.includes('booth='),'deep-link close replaces URL instead of leaving site')
const content=h.load('frontend/src/features/catalog/BoothDrawer.tsx').BoothDrawer
const reference={...row.sales.products[0],name:'[TEST] 상시 참고 상품',evidenceScope:'GENERAL_CATALOG'}
const mixed={...row,sales:{...row.sales,products:[...row.sales.products,reference]}}
const drawerTree=h.render(content,{row:mixed,assets:[],day:'2026-09-17',hall:'1관',trigger:null,close(){}},true)
const drawerHtml=toHtml(drawerTree)
ok(drawerHtml.includes('Z1')&&drawerHtml.includes('다른 날짜 위치'),'selected location prioritized while other date remains in details')
ok(drawerHtml.indexOf('이번 행사 상품 안내')<drawerHtml.indexOf('평소·과거'),'event products separated before general catalog')
// v11 shared content is now a child component, also used inside the fullscreen map.
const bodyNode=nodes(drawerTree).find(n=>n.type?.name==='BoothContent')
const refs=nodes(bodyNode?bodyNode.type(bodyNode.props):drawerTree).find(n=>n.type==='details'&&n.props.className==='visit-reference-products')
ok(refs&&!refs.props.open,'general/past products collapsed with clear warning')
ok(!drawerHtml.includes('catalog-image-missing'),'no giant empty image frames for product without image')
const hiddenHtml=toHtml(h.render(content,{row:{...mixed,sales:null,productRows:[{id:11,data:reference}]},assets:[],trigger:null,close(){}},true))
ok(!hiddenHtml.includes(reference.name),'private sales not leaked by residual product rows')
const Shared=h.load('frontend/src/features/catalog/Shared.tsx');const productHtml=toHtml(Shared.ProductCard({product:row.sales.products[0]}))
ok(productHtml.indexOf(row.sales.products[0].name)<productHtml.indexOf('품절'),'product name precedes badges without hiding sold-out state')
const squares=[{id:'a',label:'Z1',status:'MATCHED',points:[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2},{x:.1,y:.2}],issues:[],links:[{participantId:1,dates:['2026-09-17'],method:'AUTO'}]}]
const plan={id:'plan',assetId:12,scope:{title:'[TEST] 지도',hall:'1관',zone:null,dates:['2026-09-16','2026-09-17']},state:'READY',width:1800,height:1000,imageUrl:null,sourceUrl:'https://example.com/map',credit:'가상 자료',publishedAt:'2026-09-16T00:00:00Z',shapes:squares}
const maps=h.load('frontend/src/features/floorplan/InteractiveFloorPlans.tsx');ok(maps.linksForDay(squares[0].links,'2026-09-16').length===0,'identical shape never links wrong date');ok(!maps.planApplies(plan,'2026-09-20','1관'),'off-date plan not selected');ok(!maps.planApplies(plan,'2026-09-17','2관'),'wrong-hall plan not selected')
let opened=0;let mapTree=h.render(maps.MapView,{plan,participants:[row],onOpen(){opened++},day:'2026-09-17',hall:'1관',query:'키링'},true)
ok(toHtml(mapTree).includes(row.participant.registrationName),'map results name booth, not code alone')
nodes(mapTree).find(n=>n.type==='button'&&n.props.children==='위치 보기').props.onClick();mapTree=h.render(maps.MapView,{plan,participants:[row],onOpen(){opened++},day:'2026-09-17',hall:'1관',query:'키링'})
const canvas=nodes(mapTree).find(n=>n.type?.name==='PlanCanvas');ok(canvas.props.selected==='a'&&canvas.props.focusRequest===1&&opened===0,'location result focuses map without opening sales')
const error=harness({floorplanRemote:{loading:false,error:Error('network'),data:null,reload:async()=>{}}})
const failed=error.load('frontend/src/features/floorplan/InteractiveFloorPlans.tsx').InteractiveFloorPlans
const failedHtml=toHtml(error.render(failed,{eventId:'10',event:{...e,discoveryLinks:[{kind:'FLOOR_PLAN',url:'https://example.com/floor',status:'PUBLISHED',note:null}]},assets:[{id:12,type:'FLOOR_PLAN',participantId:null,productId:null,url:'https://stored.example.com/old.png',credit:'old',attribution:'https://example.com'}],participants:[row],onOpen(){},onList(){}}))
ok(failedHtml.includes('참가 부스 목록')&&failedHtml.includes('다시 시도'),'map error offers useful alternatives')
ok(failedHtml.includes('https://example.com/floor')&&!failedHtml.includes('https://stored.example.com/old.png'),'error gives original link but never unsafe stale image fallback')
const viewport=h.load('frontend/src/features/floorplan/viewport.ts')
ok(viewport.clampZoom(30)===12&&viewport.clampZoom(.1)===1,'pinch scale bounded')
ok(viewport.fitShapeZoom(squares[0].points,390,1.8,280)>1,'small booth automatically enlarged')
const scrolling=viewport.anchoredScroll({x:.5,y:.5},3,400,2,{x:200,y:100})
ok(scrolling.left===400&&scrolling.top===200,'zoom anchor preserves image coordinates')
let dirties=[];const forms=harness({reactOverrides:{useContext:()=>({set:(key,dirty)=>dirties.push({key,dirty}),confirm:()=>true}),useLayoutEffect:fn=>fn()}})
const unsaved=forms.load('frontend/src/features/visit/UnsavedChanges.tsx')
unsaved.useDirty('x',{a:1,b:2},{b:2,a:1});ok(dirties.pop().dirty===false,'field key order does not falsely mark unsaved')
unsaved.useDirty('x',{a:1},{a:2});ok(dirties.pop().dirty===true,'real field edit marks unsaved')
unsaved.useDirty('x',{a:1},{a:2})();ok(dirties.pop().dirty===false,'successful save clears only this editor')
const fields=h.load('frontend/src/features/visit/AdminFields.tsx');let altered
let dateForm=fields.DateListFields({value:['2026-09-16','2026-09-20'],change:v=>altered=v})
nodes(dateForm).find(n=>n.type==='input').props.onChange({target:{value:'2026-09-17'}})
ok(JSON.stringify(altered)===JSON.stringify(['2026-09-17','2026-09-20']),'date form changes only chosen date, not intervening closed dates')
const productForm=fields.ProductFields({value:[row.sales.products[0]],change:v=>altered=v})
nodes(productForm).find(n=>n.type==='input'&&n.props.value===row.sales.products[0].name).props.onChange({target:{value:'수정 상품'}})
ok(altered[0].name==='수정 상품'&&altered[0].sourceEntryId===row.sales.products[0].sourceEntryId,'normal product editor preserves source identity')
ok(toHtml(productForm).includes('type="date"')||row.sales.products[0].price===null,'price confirmation date uses calendar when known')
console.log(`PASS: ${count} v9 UX rules and real source-handler conditions. Not React DOM/DB E2E.`)
