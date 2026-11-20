from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
old = Path('C:/Users/071823/Desktop/BoothHana2')
def read(path): return (root/path).read_text(encoding='utf-8')
def write(path, value):
    target=root/path; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(value,encoding='utf-8',newline='\n')
def replace(path, before, after):
    value=read(path)
    assert before in value, (path,before[:80])
    write(path,value.replace(before,after))

feature='frontend/src/features/outings'
for path in (old/feature).iterdir():
    if path.is_file() and path.name!='main.tsx':
        write(f'{feature}/{path.name}',path.read_text(encoding='utf-8'))
assets='frontend/public/assets/brand/outings'
(root/assets).mkdir(parents=True,exist_ok=True)
shutil.copy2(old/assets/'outings-symbol-v1.png',root/assets/'outings-symbol-v1.png')
for source,dest in [('subculture','popup'),('exhibitions','exhibition'),('festivals','festival')]:
    shutil.copy2(old/f'frontend/public/assets/categories/{source}.jpg',root/assets/f'sample-{dest}.jpg')
    for filename in ['data.ts','OutingsApp.tsx']:
        replace(f'{feature}/{filename}',f'/assets/categories/{source}.jpg',f'/assets/brand/outings/sample-{dest}.jpg')
replace(f'{feature}/OutingsApp.tsx',"useState<'sample' | 'catalog'>('sample')","useState<'sample' | 'catalog'>('catalog')")
replace(f'{feature}/OutingsApp.tsx','<div className="o-preview-bar"><span>LOCAL PREVIEW</span><p>통합 탐색과 내 일정, 먼저 경험해 보세요.</p><span>이 브라우저에 저장</span></div>','<div className="o-preview-bar"><span>함께 보내는 하루</span><p>팝업·박람회·축제를 하나의 일정으로.</p><span>이 브라우저에 저장</span></div>')
replace(f'{feature}/OutingsApp.tsx','href="#/"','href="/outings"')
replace(f'{feature}/OutingsApp.tsx','href="/subculture"','href="https://subculture.boothana.kr/"')
replace(f'{feature}/OutingsApp.tsx','공개된 박람회·축제를 조회해요. 팝업 분류와 장소 좌표는 아직 연결 전이에요.','공개된 팝업·박람회·축제를 조회해요. 운영시간과 예약 조건은 공식 안내를 확인해 주세요.')
replace(f'{feature}/OutingsFooter.tsx','href="#/?view=plans"','href="/outings?view=plans"')
replace(f'{feature}/OutingsFooter.tsx','href="#/?view=saved"','href="/outings?view=saved"')
replace(f'{feature}/OutingsFooter.tsx','href="#/"','href="/outings"')
replace(f'{feature}/OutingsFooter.tsx','href="/subculture"','href="https://subculture.boothana.kr/"')
replace(f'{feature}/OutingsFooter.tsx','로컬 체험판 · 일정과 보관함은 이 브라우저에 저장돼요.','일정과 보관함은 이 브라우저에 저장돼요. 파일로 보관하거나 다른 기기로 옮길 수 있어요.')
replace(f'{feature}/OutingsFooter.tsx','<a href="/library">기존 내 방문·보관함</a>','<a href="/library">내 방문·보관함</a><a href="/itinerary">계정에 저장한 일정</a>')
replace(f'{feature}/data.ts',"import type { ResolvedMemory } from '../library/types'","import { libraryApi } from '../library/api'\nimport { publicRead } from '../../api/client'\nimport { categoryForType } from '../discovery/categories'")
value=read(f'{feature}/data.ts')
a=value.index('  const exhibition ='); b=value.index('    area:',a)
value=value[:a]+"  const category = categoryForType(e.subcategory).key\n  const kind = ({ exhibitions: 'exhibition', festivals: 'festival', popups: 'popup', subculture: 'subculture' } as const)[category]\n  return { id: `catalog-${row.id}`, eventId: row.id, name: e.name.slice(0, 150), kind,\n"+value[b:]
value=value.replace("['EXHIBITION', 'FESTIVAL']","['POPUP', 'EXHIBITION', 'FESTIVAL']")
a=value.index('      const res = await fetch');b=value.index('      total = data.total',a)
value=value[:a]+"      const data = await publicRead<{ items: PublicEventSummary[]; total: number }>(`/api/public/catalog/events?${new URLSearchParams({ category, page: String(page), size: '100', sort: 'DATE_ASC', from: today() })}`, { signal })\n"+value[b:]
a=value.index("  const response = await fetch");b=value.index('  return resolved.filter',a)
value=value[:a]+"  const resolved = await libraryApi.resolve(ids.map(id => ({ type: 'EVENT', eventId: id, id, participantId: null })))\n"+value[b:]
write(f'{feature}/data.ts',value)
value=read(f'{feature}/outings.css').splitlines()
for i in range(1,13):
    selector,body=value[i].split(' {',1)
    if selector in [':root','body']: selector='.outings-app'
    else: selector=', '.join('.outings-app '+s.strip() for s in selector.split(','))
    value[i]=selector+' {'+body
write(f'{feature}/outings.css','\n'.join(value)+'\n')
replace(f'{feature}/outings.css','.leaflet-tooltip {','.outings-app .leaflet-tooltip {')
value=read(f'{feature}/discovery-polish.css').splitlines()
for i,line in enumerate(value):
    if line.startswith('button:focus-visible'):
        selector,body=line.split(' {',1)
        value[i]=', '.join('.outings-app '+s.strip() for s in selector.split(','))+' {'+body
write(f'{feature}/discovery-polish.css','\n'.join(value)+'\n')
write(f'{feature}/OutingsPage.tsx',"import { RouteMetadata } from '../../components/seo/PageMetadata'\nimport { OutingsApp } from './OutingsApp'\nimport './outings.css'\nimport './discovery-polish.css'\nimport './planner.css'\n\nexport function OutingsPage() { return <><RouteMetadata/><OutingsApp/></> }\n")
replace('frontend/src/app/router.tsx',"const ItineraryPage=lazy", "const OutingsPage=lazy(()=>import('../features/outings/OutingsPage').then(module=>({default:module.OutingsPage})))\nconst ItineraryPage=lazy")
replace('frontend/src/app/router.tsx','export const router = createBrowserRouter([', 'export const router = createBrowserRouter([\n  { path: \'/outings\', element: <SupportBoundary><Suspense fallback={<p role="status">나들이 일정을 열고 있어요.</p>}><OutingsPage/></Suspense></SupportBoundary> },')
replace('frontend/seo/category-sites.mjs','itinerary|purchase-plan','itinerary|purchase-plan|outings')
replace('frontend/src/pages/HomePage.tsx','    <PopularEvents/>','    <p className="row-actions"><a className="btn primary" href="/outings">팝업·박람회·축제로 하루 일정 짜기 →</a><a className="btn secondary" href="/itinerary">계정에 저장한 일정</a></p>\n    <PopularEvents/>')

# Port enrichment into the newer renderer, retaining directory and section behavior.
path='frontend/seo/metadata.mjs'; value=read(path); previous=(old/path).read_text(encoding='utf-8')
helpers=previous[previous.index('function eventDates('):previous.index('function baseGraph(')]
value=value.replace('function baseGraph(',helpers+'function baseGraph(',1)
start=previous.index('      const topics =',previous.index('} else if (boothMatch)')); end=previous.index('      image =',start)
a=value.index('      const topics =',value.index('} else if (boothMatch)'));b=value.index('      image =',a)
value=value[:a]+previous[start:end]+value[b:]
value=value.replace('description = text(catalog.event.description, 170) || `${text(catalog.event.name, 100)}의 공개 일정, 장소, 참가 부스와 판매 안내를 확인하세요.`','description = text(`${eventFacts(catalog.event)}${catalog.event.description ? ` · ${catalog.event.description}` : \'\'}`, 170) || `${text(catalog.event.name, 100)}의 공개 일정, 장소, 참가 부스와 판매 안내를 확인하세요.`')
value=value.replace("  } else if (path === '/itinerary') {","  } else if (path === '/outings') {\n    title = '팝업·박람회·축제 데이트 일정 만들기 | 부스하나'\n    description = '공개된 팝업·박람회·축제를 둘러보고, 장소와 이동시간을 조정해 함께 보낼 하루 일정을 만드세요. 일정은 이 브라우저에 저장됩니다.'\n    indexable = !params.size && !unavailable\n  } else if (path === '/itinerary') {")
value=value.replace("if (split && path === '/about')", "if (split && ['/about', '/outings'].includes(path))")
# Default argument for deterministic ended-event links, also usable by tests.
value=value.replace("siteUrl = '', splitSites = false } = {}) {", "siteUrl = '', splitSites = false, day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) } = {}) {")
assert 'day = new Intl' in value
anchor='  const eventPath = `/discover/${catalog.id}`\n'
start=previous.index('  const dates = eventDates(event)',previous.index('export function renderCrawlableContent'))
end=previous.index('  if (/\\/booths',start)
value=value.replace(anchor,anchor+previous[start:end],1)
a=value.index('  if (/\\/booths',value.index('export function renderCrawlableContent')); b=value.index('  const sectionPage = parseEventPage(path)',a)
c=previous.index('  if (/\\/booths',previous.index('export function renderCrawlableContent'));d=previous.index('  const participants =',c)
value=value[:a]+previous[c:d]+value[b:]
a=value.index('  const occurrence = event.occurrences?.[0]',value.index('export function renderCrawlableContent'));b=value.index('\n}\n\nexport function injectMetadata',a)
c=previous.index('  const participants =',previous.index('export function renderCrawlableContent'));d=previous.index('\n}\n\nexport function injectMetadata',c)
eventbody=previous[c:d].replace('slice(0, 200)','slice(0, 24)').replace('<article><h1>${esc(text(event.name, 160))}</h1>','<article><h1>${esc(text(event.name, 160))}</h1><nav aria-label="행사 상세 메뉴">${Object.entries(EVENT_SECTIONS).map(([key,label])=>`<a href="${eventSectionHref(catalog.id,key)}">${esc(label)}</a>`).join(\' · \')}</nav>')
value=value[:a]+eventbody+value[b:]
value=value.replace("  if (path === '/about') return", "  if (path === '/outings') return new URLSearchParams(search).size ? '' : '<main class=\"content-wrap section-pad\" data-seo-fallback><h1>팝업·박람회·축제로 함께 보내는 하루</h1><p>가보고 싶은 곳을 둘러보고 날짜·순서·이동시간을 조정해 데이트와 나들이 일정을 만드세요. 일정과 보관함은 이 브라우저에 저장되며 파일로 옮길 수 있습니다.</p><a href=\"https://popup.boothana.kr/\">팝업 둘러보기</a> · <a href=\"https://expo.boothana.kr/\">박람회 둘러보기</a> · <a href=\"https://festival.boothana.kr/\">축제 둘러보기</a><p><a href=\"/itinerary\">계정에 저장한 일정</a></p></main>'\n  if (path === '/about') return",1)
write(path,value)
path='frontend/api/page.mjs'
replace(path,'size=${size}&sort=RECENT&grouped=true','size=${size}&sort=${directoryPage === null ? \'DATE_ASC\' : \'RECENT\'}&grouped=true${directoryPage === null ? `&from=${new Intl.DateTimeFormat(\'en-CA\', {timeZone:\'Asia/Seoul\', year:\'numeric\', month:\'2-digit\', day:\'2-digit\'}).format(new Date())}` : \'\'}')
write('frontend/src/features/catalog/EventFollowup.tsx',(old/'frontend/src/features/catalog/EventFollowup.tsx').read_text(encoding='utf-8'))
