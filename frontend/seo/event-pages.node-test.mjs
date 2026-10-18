import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEventPage, legacyEventRedirect } from './event-pages.mjs'
import { pageMetadata } from './metadata.mjs'
import { renderPage } from '../api/page.mjs'
import { renderSitemap } from './sitemap.mjs'

const siteUrl='https://subculture.boothana.kr',apiBase='https://api.example'
const template='<html><head><!-- BOOTH_META_START --><!-- BOOTH_META_END --></head><body><div id="root"></div></body></html>'
const catalog={id:22,mode:'INFO_ONLY',publishedAt:'2026-10-19T00:00:00Z',event:{name:'가을 팬 행사',subcategory:'ONLY_EVENT',description:'일정과 입장 안내',venueName:'제1전시장',occurrences:[{startDate:'2026-10-24',endDate:'2026-10-25',startTime:'10:00',endTime:'17:00'}],sources:[{url:'https://example.com/official',kind:'OFFICIAL',access:'ORIGINAL'}]},sections:{booths:true,map:true,reviews:true},participantCount:27,participants:[{id:900,participant:{registrationName:'달빛 작업실',subjects:['루나'],locations:[{startDate:'2026-10-24',endDate:'2026-10-24',hall:'1홀',code:'A-12'}]},sales:{summary:'아크릴 키링을 판매합니다.'}}],assets:[],pagination:{page:0,size:24,total:27},reviewsPage:{items:[{authorName:'방문자',body:'<script>alert(1)</script> 입장 경험',createdAt:'2026-10-19T00:00:00Z'}],total:1}}
function json(value){return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}})}

test('old tab, map focus, booth and Sunday links keep their IDs and visit context',()=>{
  assert.equal(legacyEventRedirect('/discover/22','section=map&day=2026-10-24&hall=1%ED%99%80&focus=900'),'/discover/22/map?day=2026-10-24&hall=1%ED%99%80&focus=900')
  assert.equal(legacyEventRedirect('/discover/22','booth=900&day=2026-10-24'),'/discover/22/booths/900?day=2026-10-24')
  assert.equal(legacyEventRedirect('/discover/7','view=reviews'),'/discover/1/reviews?day=2026-10-04')
  assert.equal(legacyEventRedirect('/discover/7/booths/900','day=2026-10-04'),null)
  assert.equal(legacyEventRedirect('/discover/22/booths','page=1'),null)
  assert.equal(parseEventPage('/discover/9007199254740999'),null)
  assert.equal(parseEventPage('/discover/22/map/900'),null)
})

test('each section fetches its dedicated API and has directly readable unique HTML',async()=>{
  for(const [section,word] of [['booths','달빛 작업실'],['map','A-12'],['reviews','입장 경험']]){
    const seen=[]
    const page=await renderPage({path:`/discover/22/${section}`,template,siteUrl,apiBase,fetcher:async url=>{seen.push(new URL(url).pathname);return json(catalog)}})
    assert.equal(page.status,200);assert.deepEqual(seen,[`/api/public/catalog/events/22/${section}`])
    assert.equal(page.meta.canonical,`${siteUrl}/discover/22/${section}`)
    assert.match(page.meta.robots,/^index/);assert.ok(page.html.includes(word))
    assert.ok(page.html.includes('공개본 갱신'));assert.ok(page.html.includes('https://example.com/official'))
    assert.ok(!page.html.includes('<script>alert(1)</script>'))
    assert.equal(page.meta.schema['@graph'].find(node=>node['@type']==='Event').url,`${siteUrl}/discover/22`)
  }
})

test('overview and an individual booth do not request the whole-event API',async()=>{
  for(const [path,endpoint] of [['/discover/22','overview'],['/discover/22/booths/900','booths/900']]){
    const seen=[];const page=await renderPage({path,template,siteUrl,apiBase,fetcher:async url=>{seen.push(new URL(url).pathname);return json(catalog)}})
    assert.equal(page.status,200);assert.deepEqual(seen,[`/api/public/catalog/events/22/${endpoint}`])
  }
})

test('booth pagination has crawlable next links and its own canonical, while filters are noindex',async()=>{
  const first=await renderPage({path:'/discover/22/booths',template,siteUrl,apiBase,fetcher:async()=>json(catalog)})
  assert.ok(first.html.includes('href="/discover/22/booths?page=1"'))
  const second={...catalog,pagination:{page:1,size:24,total:27}}
  const page=await renderPage({path:'/discover/22/booths',search:'page=1',template,siteUrl,apiBase,fetcher:async()=>json(second)})
  assert.equal(page.meta.canonical,`${siteUrl}/discover/22/booths?page=1`);assert.match(page.meta.robots,/^index/)
  assert.match(pageMetadata({path:'/discover/22/booths',search:'q=루나&day=2026-10-24',siteUrl,catalog}).robots,/^noindex/)
  const gone=await renderPage({path:'/discover/22/booths',search:'page=10',template,siteUrl,apiBase,fetcher:async()=>json({...catalog,pagination:{page:10,size:24,total:27}})})
  assert.equal(gone.status,404);assert.match(gone.meta.robots,/^noindex/)
})

test('empty reviews and maps are excluded from indexing and the sitemap',()=>{
  const empty={...catalog,sections:{booths:true,map:false,reviews:false},reviewsPage:{items:[],total:0},assets:[]}
  for(const section of ['map','reviews'])assert.match(pageMetadata({path:`/discover/22/${section}`,siteUrl,catalog:empty}).robots,/^noindex/)
  const sitemap=renderSitemap(siteUrl,[{id:22,publishedAt:'2026-10-19',sections:empty.sections}])
  assert.ok(sitemap.includes('/discover/22/booths'));assert.ok(!sitemap.includes('/discover/22/map'));assert.ok(!sitemap.includes('/discover/22/reviews'))
})
