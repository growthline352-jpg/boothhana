import { CharacterHomeHero } from './CharacterHomeHero'
import type { ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { creators, events, goods, subjects } from './data'
import type { Good, PreviewState } from './data'
import { catalogWorks, favoriteCatalogSubjects, selectedInterestWorks, subjectWorkId } from './interests'
import { creatorHasSubject } from './editorial'

export const homeCases = [
  {id:'characters',label:'① 관심 캐릭터 있음',note:'등록된 관심 캐릭터에서 시작하고, 확인된 소식과 관련 작가를 이어 보여줘요.'},
  {id:'works',label:'② 작품만 선택',note:'관심 작품 전체의 행사·굿즈·작가를 보여줘요.'},
  {id:'new',label:'③ 관심 미설정',note:'다가오는 행사와 등록된 굿즈·작가부터 둘러봐요. 개인 추천으로 표시하지 않아요.'},
  {id:'custom',label:'④ 직접 입력만 있음',note:'직접 입력한 관심은 보관하되, 연결되지 않은 작가·행사 소식을 만들지 않아요.'},
] as const
export type HomeCase = typeof homeCases[number]['id']
export function makeHomeCase(state:PreviewState,id:HomeCase):PreviewState {
  const empty:PreviewState={...state,follows:[],interestWorks:[],customWorks:[],customCharacters:[],onboardingStatus:'done'}
  if(id==='characters') return {...empty,follows:['subject:luna','subject:momo','creator:moon'],interestWorks:['moon-post','momo-world']}
  if(id==='works') return {...empty,interestWorks:['moon-post']}
  if(id==='custom') return {...empty,interestWorks:['custom-work:demo'],customWorks:[{id:'custom-work:demo',title:'별빛 연대기',kind:'게임'}],customCharacters:[{id:'demo-arin',name:'아린',workId:'custom-work:demo'}],follows:['custom:demo-arin']}
  return {...empty,onboardingStatus:'skipped'}
}

type Props = {
  follow: (id:string) => void
  state: PreviewState
  goodCard: (good: Good) => ReactNode
  creatorCard: (creator: typeof creators[number]) => ReactNode
}

export function HomeDiscovery({state,follow,goodCard,creatorCard}:Props) {
  const location=useLocation(), [params]=useSearchParams()
  const from={from:location.pathname+location.search}
  const followed=subjects.filter(s=>state.follows.includes('subject:'+s.id))
  const custom=state.customCharacters.filter(c=>state.follows.includes('custom:'+c.id))
  const favoriteCreators=creators.filter(c=>state.follows.includes('creator:'+c.id))
  const workOnly=catalogWorks.filter(w=>selectedInterestWorks(state).includes(w.id)&&!followed.some(s=>subjectWorkId(s.id)===w.id)&&!custom.some(c=>c.workId===w.id))
  const filters=[...followed.map(s=>({id:'subject:'+s.id,label:s.name})),...workOnly.map(w=>({id:'work:'+w.id,label:w.title})),...favoriteCreators.map(c=>({id:'creator:'+c.id,label:c.name})),...custom.map(c=>({id:'custom:'+c.id,label:c.name}))]
  const hasInterests=filters.length>0||selectedInterestWorks(state).length>0
  const requested=params.get('interest')||'all'
  const active=filters.some(f=>f.id===requested)?requested:'all'
  const specific=active!=='all'
  const targetSubjects=specific?subjects.filter(s=>active==='subject:'+s.id||(active==='work:'+subjectWorkId(s.id))):favoriteCatalogSubjects(state)
  const targetCreators=specific?favoriteCreators.filter(c=>active==='creator:'+c.id):favoriteCreators
  const relatedGoods=goods.filter(g=>targetSubjects.some(s=>s.id===g.subject)||targetCreators.some(c=>c.id===g.creator))
  const relatedCreators=creators.filter(c=>targetCreators.includes(c)||targetSubjects.some(s=>creatorHasSubject(c.id,s.id)))
  // Explicit fixture evidence: this event's work theme and this creator's participation are confirmed.
  // An artwork relationship alone never implies participation or a sale at an event.
  const relatedEvents=events.map(event=>{
    const sales=relatedGoods.filter(g=>g.event===event.id)
    const theme=event.id==='moonfest'&&targetSubjects.some(s=>subjectWorkId(s.id)==='moon-post')
    const participation=event.id==='moonfest'&&targetCreators.some(c=>c.id==='moon')
    const names=[...new Set(sales.map(g=>subjects.find(s=>s.id===g.subject)!.name))]
    return {event,sales,reason:sales.length?names.join(' · ')+' 굿즈 판매 확인':participation?'달작업실 참가 확인 · 판매표 미공개':theme?'달빛 우체국 테마 행사 · 판매표 미공개':''}
  }).filter(row=>row.reason)
  const connected=relatedGoods.length+relatedCreators.length+relatedEvents.length>0
  const personalized=hasInterests&&connected
  const eventRows=personalized?relatedEvents:events.map(event=>({event,sales:[] as Good[],reason:event.type+' · '+event.edition}))
  const shownGoods=personalized?relatedGoods:hasInterests?[]:goods
  const shownCreators=personalized?relatedCreators:hasInterests?[]:creators
  return <div className="sc-interest-discovery">
    <CharacterHomeHero state={state} follow={follow}/>
    {hasInterests&&!connected&&<p className="sc-discovery-unlinked"><Icon name="info" size={17}/>아래 행사는 관심 대상과의 관련성이 확인된 추천이 아니에요.</p>}
    <div className={'sc-discovery-lead'+(!shownGoods.length?' is-events-only':'')}>
      <section aria-labelledby="home-events-title"><div className="sc-discovery-section-head"><h2 id="home-events-title">{personalized?'관심으로 찾은 행사':'다가오는 행사'}</h2><Link to="/events" state={from}>행사 전체 <Icon name="chevron" size={14}/></Link></div>
        <div className="sc-discovery-events">{eventRows.map(({event,reason,sales})=><Link key={event.id} to={'/events/'+event.id} state={from} className={'sc-discovery-event '+event.color}><span className="sc-discovery-date"><small>{event.dates[0].slice(5,7)}월</small><strong>{event.dates[0].slice(8)}</strong></span><div><span className={'sc-discovery-evidence'+(sales.length?' is-confirmed':'')}>{reason}</span><h3>{event.name}</h3><p>{event.label}<br/>{event.place}</p><span className="sc-discovery-action">행사 안내 보기 <Icon name="arrow" size={15}/></span></div></Link>)}</div>
        {personalized&&!eventRows.length&&<p className="sc-discovery-empty">연결된 행사 정보는 아직 없어요. 아래 작가의 작업을 먼저 살펴보세요.</p>}
      </section>
      {!!shownGoods.length&&<section aria-labelledby="home-goods-title"><div className="sc-discovery-section-head"><h2 id="home-goods-title">{personalized?'관심으로 찾은 굿즈':'눈여겨볼 굿즈'}</h2><Link to="/goods" state={from}>굿즈 전체 <Icon name="chevron" size={14}/></Link></div><div className="sc-discovery-goods">{shownGoods.map(g=><div key={g.id}>{goodCard(g)}<p className="sc-discovery-sale">{g.event?events.find(e=>e.id===g.event)?.name+' · '+g.booth:'판매 행사 미정'}</p></div>)}</div></section>}
    </div>
    {!!shownCreators.length&&<section className="sc-section"><div className="sc-discovery-section-head"><div><h2>{personalized?'이 취향을 그리는 작가':'작가·서클 둘러보기'}</h2><p>{personalized?'관심 작가와 캐릭터 작업 이력으로 연결했어요. 행사 참가는 별도로 확인해요.':'작가의 대표작을 보고 새로운 취향을 발견해보세요.'}</p></div><Link to="/creators" state={from}>작가 전체 <Icon name="chevron" size={14}/></Link></div><div className="sc-creators-grid">{shownCreators.map(c=><div key={c.id}>{creatorCard(c)}</div>)}</div></section>}
  </div>
}
