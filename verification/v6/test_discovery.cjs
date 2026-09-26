const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {harness,toHtml,nodes,root}=require('./source_harness.cjs');let checks=0
function ok(v,label){assert.ok(v,label);checks++;console.log('PASS '+label)}
const h=harness(),c=h.load('frontend/src/features/discovery/categories.ts'),b=h.load('frontend/src/features/discovery/browse.ts')
ok(c.categories.length===3,'exactly three top-level categories')
for(const key of ['subculture','exhibitions','festivals']){
 ok(c.getCategory(key).key===key,key+' distinct category config')
 ok(c.activeCategory('/discover','?category='+key)===key,key+' URL-selected header')
 ok(c.categoryHref(key).includes('category='+key),key+' shareable link')
}
ok(c.activeCategory('/','')==='subculture','home defaults to real subculture feed')
ok(c.activeCategory('/discover/12','?category=festivals')==='subculture','detail is not relabelled by mismatched query')
ok(c.activeCategory('/events','')===null,'operating event page not misclassified')
ok(c.activeCategory('/reservations','')===null,'reservations not misclassified')
ok(c.getCategory('unknown').key==='subculture','unknown input has explicit default')
for(const bad of ['https://evil.test','//evil.test','/admin/events','/discover?category=festivals',null])ok(c.safeReturnTo(bad)===c.categoryHref('subculture'),'unsafe/unrelated back destination rejected '+bad)
ok(c.safeReturnTo('/discover?category=subculture&q=book&page=2')==='/discover?category=subculture&q=book&page=2','detail back restores list filters and page')
for(const bad of ['-3','NaN','100001','2.5','Infinity'])ok(b.parseBrowse(new URLSearchParams('page='+bad)).page===0,'invalid page normalized '+bad)
ok(b.parseBrowse(new URLSearchParams('category=exhibitions&type=DOLL')).subcategory==='','subcategory does not leak across tabs')
ok(b.parseBrowse(new URLSearchParams('q='+'x'.repeat(120))).q.length===100,'search bounded')
ok(b.seoulToday(new Date('2026-09-15T15:00:00Z'))==='2026-09-16','KST date boundary')
ok(b.periodRange('week','2026-12-29').to==='2027-01-04','seven days crosses year')
ok(b.periodRange('month','2028-02-20').to==='2028-02-29','month honors leap year')
ok(b.periodRange('all','2026-09-16').from==='','all dates clears cutoff')
const split=[{startDate:'2026-10-10',endDate:'2026-10-11'},{startDate:'2026-10-13',endDate:'2026-10-13'}]
ok(b.eventSchedule(split,'2026-10-12').state==='upcoming','closed gap never marked operating today')
ok(b.eventSchedule(split,'2026-10-13').state==='today','actual operating occurrence shown')
ok(b.eventSchedule(split,'2026-10-14').state==='past','ended schedule distinguished')
const qp=b.browseApiParams(b.parseBrowse(new URLSearchParams('q=A%26B&type=DOLL&page=2&period=all')),'2026-09-16')
ok(qp.get('q')==='A&B'&&qp.get('page')==='2'&&!qp.has('from'),'API params preserve literal search/filter/page')
for(const key of ['subculture','exhibitions','festivals']){
 const app=harness({location:{search:'?category='+key},callLoader:true}),page=app.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage
 const html=toHtml(app.render(page,{},true));ok(html.includes(c.getCategory(key).label+' 둘러보기'),key+' own screen rendered')
 if(key!=='subculture'){ok(app.calls.length===0,key+' does not request subculture endpoint');ok(html.includes('정보를 준비하고 있어요'),key+' honest empty state');ok(html.includes('disabled'),key+' unconnected filters visibly disabled')}
 const layout=app.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout
 const header=toHtml(app.render(layout,{},true))
 ok((header.match(/aria-current="page"/g)||[]).length===1,key+' only one selected category in header')
 ok(header.includes('href="/events"')&&header.includes('href="/reservations"'),key+' previous operating/reservation routes preserved')
}
const filters=harness({location:{search:'?category=subculture&page=4&q=cat'}}),page=filters.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage
let tree=filters.render(page,{},true)
nodes(tree).find(n=>n.type==='button'&&n.props['aria-pressed']===false&&String(n.props.children).includes('인형'))?.props.onClick()
ok(filters.calls.length===1&&new URLSearchParams(filters.calls[0]).get('type')==='DOLL'&&!new URLSearchParams(filters.calls[0]).has('page'),'subcategory change resets pagination')
const form=nodes(tree).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}})
ok(!new URLSearchParams(filters.calls.at(-1)).has('page'),'submitted search resets page')
const old=fs.readFileSync(path.join(root,'frontend/src/pages/HomePage.tsx'),'utf8')
ok(!old.includes('128')&&!old.includes('서울 코믹월드 2026')&&old.includes('DiscoveryPage'),'home no longer presents hard-coded sample events or metrics')
const row={id:1,event:{name:'[TEST] 행사',subcategory:'DOLL',venueName:'테스트 장소',description:'설명',subjects:[],occurrences:split,banners:[{imageUrl:'https://unapproved.test/poster.png'}]},participantCount:3}
const card=filters.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryEventCard
let html=toHtml(card({row,today:'2026-10-12',returnTo:'/discover?category=subculture&page=2'}))
ok(!html.includes('unapproved.test'),'unapproved candidate banner never used in card')
ok(html.includes('행사 이미지를 준비')&&html.includes('개최 예정'),'poster placeholder and operating status honest')
ok(!html.includes(b.occurrenceLabel(split[0]))&&html.includes(b.occurrenceLabel(split[1]))&&html.includes('지난 일정 1개'),
 'v7: upcoming occurrence has priority; past occurrence count retained, no closed-gap date invented')
html=toHtml(card({row:{...row,banner:{url:'https://stored.test/a.png',caption:'승인 포스터',credit:'주최자',attribution:'https://official.test/a'}},today:'2026-10-10',returnTo:'/discover'}))
ok(html.includes('stored.test/a.png')&&html.includes('이미지 출처')&&html.includes('주최자'),'approved banner credit and attribution preserved')
const err=harness({remote:{loading:false,error:Error('network'),data:null,reload:async()=>{}}})
ok(toHtml(err.render(err.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage)).includes('다시 불러오기'),'network failure has retry instead of false empty')
const pending=harness({remote:{loading:true,error:null,data:null}})
ok(toHtml(pending.render(pending.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage)).includes('aria-busy="true"'),'loading state is distinct')
console.log(`PASS: ${checks} discovery source/rules/hook checks. No React DOM or live backend used.`)
