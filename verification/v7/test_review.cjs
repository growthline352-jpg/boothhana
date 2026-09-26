/* Actual TS modules + isolated hook/JSX harness. Not React DOM/Router/backend integration. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {harness,toHtml,nodes,root}=require('../v6/source_harness.cjs')
let checks=0;function ok(value,label){assert.ok(value,label);checks++;console.log('PASS '+label)}
const h=harness(),b=h.load('frontend/src/features/discovery/browse.ts')
const d=(startDate,endDate=startDate)=>({startDate,endDate,startTime:null,endTime:null})
const mixed=[d('2026-09-05'),d('2026-09-06'),d('2026-09-12'),d('2026-09-20')]
const original=JSON.stringify(mixed)
for(const period of ['all','upcoming','week','month']) {
 const r=b.cardOccurrences(mixed,'2026-09-16',period)
 ok(r.shown.length===1&&r.shown[0].startDate==='2026-09-20',period+' shows actual next day instead of three past days')
}
ok(b.cardOccurrences(mixed,'2026-09-16','all').omittedPast===3,'all-period past omissions described separately')
ok(JSON.stringify(mixed)===original,'source occurrence array not mutated')
const reverse=[...mixed].reverse()
ok(b.cardOccurrences(reverse,'2026-09-16','all').shown[0].startDate==='2026-09-20','input ordering does not affect next date')
ok(b.cardOccurrences([d('2026-09-01'),d('2026-09-16'),d('2026-09-20')],'2026-09-16').shown[0].startDate==='2026-09-16','today shown before later date')
ok(b.cardOccurrences([d('2026-09-05'),d('2026-09-01'),d('2026-09-12')],'2026-09-16').shown[0].startDate==='2026-09-12','all-past event shows most recent date first')
ok(b.cardOccurrences([d('2026-09-15','2026-09-18')],'2026-09-16','week').shown.length===1,'continuous occurrence crossing today overlaps')
const gap=[d('2026-10-10','2026-10-11'),d('2026-10-13')]
ok(b.cardOccurrences(gap,'2026-10-12','upcoming').shown[0].startDate==='2026-10-13','closed day never inserted')
ok(b.cardOccurrences([d('2026-09-16'),d('2026-09-22'),d('2026-09-23')],'2026-09-16','week').shown.length===2,'7-day inclusive upper bound')
ok(b.cardOccurrences([d('2026-09-30'),d('2026-10-01')],'2026-09-16','month').shown.length===1,'month excludes October')
ok(b.cardOccurrences([],'2026-09-16').shown.length===0,'empty occurrence list allowed')
const many=[16,17,18,19,20].map(n=>d('2026-09-'+n))
ok(b.cardOccurrences(many,'2026-09-16','week').additional===2,'additional count measures matching future intervals only')
const row={id:1,event:{name:'[TEST] 행사',subcategory:'DOLL',venueName:'테스트 장소',description:'설명',subjects:[],occurrences:mixed},participantCount:1}
const card=h.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryEventCard
let html=toHtml(card({row,today:'2026-09-16',returnTo:'/discover',period:'week'}))
ok(html.includes(b.occurrenceLabel(mixed[3]))&&!html.includes(b.occurrenceLabel(mixed[0])),'real card uses matching dates')

const product={sourceEntryId:'p',name:'달토끼 키링',summary:'소품 소개',memberName:'개별제작자',categories:['숨은품목'],subjects:['상품주제'],evidenceScope:'EVENT_LISTED',price:null,saleState:'SOLD_OUT',productUrl:'https://example.com/product',sources:[],images:[],warnings:[]}
const participant={sourceEntryId:'a',registrationName:'[TEST] 첫 부스',kind:'JOINT',members:[{name:'숨은작가명',kind:'ARTIST',aliases:['다른이름'],profileUrl:null}],locations:[{code:'B1',status:'ASSIGNED',hall:'1홀',zone:null,startDate:null,endDate:null,floorPlanUrl:null}],subjects:['부스주제'],officialLinks:[],sources:[],images:[],warnings:[]}
const sale={summary:'안내 한줄',evidenceScope:'EVENT_LISTED',categories:['판매품목'],subjects:['개별작품태그'],salesMethod:null,sources:[],images:[],products:[product],warnings:[]}
const pr={id:1,participant,sales:sale,productRows:[{id:10,data:product}],reviewNote:'비공개메모검색금지',raw:{text:'비공개원문검색금지'}}
const search=h.load('frontend/src/features/catalog/publicSearch.ts')
for(const q of ['달토끼 키링','숨은작가명','다른이름','개별제작자','숨은품목','상품주제','개별작품태그','판매품목','1홀','Ｂ１','  달토끼   키링  '])ok(search.matchesPublicParticipant(pr,q),'published search finds '+q)
for(const q of ['비공개메모검색금지','비공개원문검색금지','sourceEntryId','https://example.com/product','없는내용'])ok(!search.matchesPublicParticipant(pr,q),'non-display/private metadata not searchable '+q)
ok(!search.matchesPublicParticipant({...pr,sales:null},'달토끼'),'hidden sales productRows excluded defensively')
ok(search.matchesPublicParticipant({...pr,productRows:undefined},'달토끼'),'legacy sales product list searchable')

const event={...row.event,name:'[TEST] 지도 행사',banners:[{imageUrl:'https://candidate.test/not-approved.png'}],warnings:[],sources:[],admission:null,address:null,discoveryLinks:[]}
const map={id:12,participantId:null,productId:null,type:'FLOOR_PLAN',url:'https://stored.example.com/map.png',caption:'[TEST] 배치도',credit:'가상 주최자',attribution:'https://official.example.com/map'}
const floors=h.load('frontend/src/features/catalog/FloorPlans.tsx').FloorPlans
html=toHtml(floors({event,assets:[map],participants:[pr]}))
ok(html.includes(map.url)&&html.includes(map.attribution),'stored floor plan rendered without discovery link')
ok(html.includes('크게 보기')&&html.includes('noopener noreferrer'),'map enlarge link isolated new window')
ok(html.includes('전시관·날짜: 원문 확인 필요'),'missing map hall/date never invented')
const mapped={...pr,participant:{...participant,locations:[{...participant.locations[0],floorPlanUrl:map.attribution,startDate:'2026-10-10',endDate:'2026-10-10'}]}}
html=toHtml(floors({event,assets:[map],participants:[mapped]}))
ok(html.includes('1홀 · 2026-10-10'),'explicitly linked published map context displayed')
ok(!toHtml(floors({event,assets:[{...map,participantId:1}],participants:[pr]})).includes(map.url),'booth map not mislabelled event-wide map')
html=toHtml(floors({event:{...event,discoveryLinks:[{kind:'FLOOR_PLAN',url:'https://example.com/map.pdf',note:'문서'}]},assets:[],participants:[pr]}))
ok(html.includes('원문 링크만 확보')&&!html.includes('<img'),'PDF link kept as link, not guessed image')
ok(!html.includes('candidate.test'),'unapproved image candidate not loaded')

const remote={loading:false,error:null,data:{id:1,event,participants:[pr],assets:[map],publishedAt:'2026-09-16T00:00:00Z',banner:null},reload:async()=>{}}
const app=harness({remote,params:{eventId:'1'}})
const wrapper=app.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogPublicDetail
const child=app.render(wrapper,{},true);const loaded=app.render(child.type,child.props,true);let tree=app.render(loaded.type,loaded.props,true)
const cardNode=nodes(tree).find(n=>n.type?.name==='ParticipantCard');const button=nodes(cardNode.type(cardNode.props)).find(n=>n.type==='button'&&n.props['aria-haspopup']==='dialog')
ok(Boolean(button),'booth trigger advertises dialog')
const trigger={isConnected:true,focus(){}}
button.props.onClick({currentTarget:trigger});tree=app.render(loaded.type,loaded.props)
const drawer=nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='BoothDrawer')
ok(drawer?.props.row.id===1&&drawer.props.trigger===trigger,'actual click captures selected booth and origin focus')
const drawerTree=app.render(drawer.type,drawer.props,true)
ok(drawerTree.type==='dialog'&&drawerTree.props['aria-labelledby'],'actual component renders named native dialog')
let canceled=false;drawerTree.props.onCancel({preventDefault(){canceled=true}})
ok(canceled,'escape cancel handler controlled for cleanup/focus restoration')
ok(!nodes(tree).some(n=>n.type==='section'&&n.props.className==='panel catalog-public-booth'),'obsolete below-list detail removed')
const second=app.render(wrapper,{},true)
ok(second.key==='1','route detail key resets selection when event changes')
const noFallback=harness({remote:{...remote,data:{...remote.data,assets:[{...map,type:'BANNER'}]}}})
const w=noFallback.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogPublicDetail
const ch=noFallback.render(w,{},true);html=toHtml(noFallback.render(ch.type,ch.props,true))
ok(!html.includes('catalog-banner'),'explicit null banner never falls back to obsolete approved image')
const publicLayout=h.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout
html=toHtml(h.render(publicLayout,{},true))
ok(html.includes('aria-label="내 예약"'),'reservation link always has accessible name')
console.log(`PASS: ${checks} v7 actual source/rule/handler checks. Isolated harness, no React DOM or live backend.`)
