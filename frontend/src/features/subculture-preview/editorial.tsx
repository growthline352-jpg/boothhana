import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { CharacterPortrait } from './DiscoveryHero'
import { creators, events, subjects } from './data'

export const artworks = [
  { id: 'letter', subject: 'luna', creator: 'moon', title: '당신에게 도착한 달빛', style: '따뜻한 일상', tone: 'warm', note: '편지 한 장과 작은 표정으로 루나의 다정한 일상을 그려요.' },
  { id: 'orbit', subject: 'luna', creator: 'night', title: '밤의 궤도를 따라서', style: '몽환적인 밤', tone: 'night', note: '넓은 밤하늘 속 루나. 여백과 깊은 색감으로 다른 분위기를 만듭니다.' },
  { id: 'eightbit', subject: 'luna', creator: 'pixel', title: '달까지 여덟 칸', style: '픽셀아트', tone: 'pixel', note: '동그란 루나를 작은 픽셀로. 게임 속 한 장면처럼 다시 그렸어요.' },
  { id: 'momo-day', subject: 'momo', creator: 'pixel', title: '모모의 느긋한 오후', style: '픽셀아트', tone: 'garden', note: '네모난 세계의 작은 고양이. 네모네모의 오리지널 캐릭터예요.' },
  { id: 'star-letter', subject: 'star', creator: 'night', title: '별에서 온 답장', style: '몽환적인 밤', tone: 'night', note: '루나와 같은 달빛 우체국 세계에서 편지를 나르는 별우체부를 만나요.' },
]
export function creatorHasSubject(creator: string, subject: string) { return artworks.some(a => a.creator === creator && a.subject === subject) }
export type Artwork = typeof artworks[number]

export function EditorialArtwork({ art }: { art: Artwork }) {
  return <div className={'sc-editorial-art art-'+art.tone} aria-label={art.title} role="img">
    <div className="sc-art-orbit"/><div className="sc-art-window"/><span className="sc-art-spark s1">✦</span><span className="sc-art-spark s2">✧</span>
    {art.tone === 'pixel' ? <svg className="sc-pixel-rabbit" viewBox="0 0 100 100" aria-hidden="true"><path d="M28 15h13v26h17V15h13v43h8v24H21V58h7Z" fill="#fff8d8"/><path d="M34 21h3v22h-3m30-22h3v22h-3" stroke="#d4a185" strokeWidth="3"/><path d="M35 59h5v6h-5m22-6h5v6h-5M46 70h7v4h-7" fill="#465e58"/><path d="M15 86h70v5H15" fill="#395647"/></svg> : <CharacterPortrait id={art.subject}/>}
    <span className="sc-art-edition">{art.tone === 'pixel' || art.tone === 'garden' ? 'SMALL WORLD / 08' : art.tone === 'night' ? 'LETTERS AFTER DARK' : 'A LITTLE LETTER FOR YOU'}</span>
  </div>
}

export const collections = [
  { id: 'three-lunas', label: '캐릭터로 만나는 작가', title: '같은 루나,\n서로 다른 세 가지 시선', subtitle: '포근한 일상부터 픽셀 속 모험까지. 좋아하는 캐릭터를 통해 새로운 작가를 발견하세요.', artIds: ['letter','orbit','eightbit'], subjectIds: ['luna'], eventIds: ['autumn','moonfest','paper'], reason: '한 캐릭터를 서로 다른 표현으로 그린 세 작가를 골랐어요. 그림체를 비교하고, 내 마음에 남는 작가를 만나보세요.' },
  { id: 'small-world', label: '이번 주 작가 노트', title: '작은 네모에 담은\n커다란 세계', subtitle: '네모네모의 오리지널 캐릭터와 팬아트를 함께 만나보세요.', artIds: ['momo-day','eightbit'], subjectIds: ['momo','luna'], eventIds: ['autumn'], reason: '오리지널 캐릭터 모모와 새롭게 해석한 루나. 같은 작가의 작품을 나란히 보며 반복되는 취향을 발견해보세요.' },
  { id: 'autumn-meeting', label: '취향에서 행사로', title: '가을빛 마켓에서\n만나는 두 캐릭터', subtitle: '루나와 모모를 좋아한다면, 방문일에 맞춰 참가 부스를 살펴보세요.', artIds: ['letter','momo-day'], subjectIds: ['luna','momo'], eventIds: ['autumn'], reason: '이번 회차의 예시 판매표에 연결된 캐릭터를 모았어요. 루나는 양일, 모모는 일요일에 판매가 예정되어 있어요.' },
]

export function CurationHero() {
  return <section className="sc-curation-hero" aria-label="오늘의 큐레이션">
    <Link to="/collections/three-lunas" className="sc-feature-main">
      <div className="sc-feature-copy"><span className="sc-editorial-label">BOOTHHANA PICKS · 01</span><h1>같은 루나,<br/>서로 다른 <br/><em>세 가지 시선</em></h1><p>좋아하는 캐릭터 하나에서 <br/>새로운 작가 세 명을 발견하는 시간.</p><span className="sc-feature-button">특집 둘러보기 <Icon name="arrow" size={18}/></span></div>
      <div className="sc-feature-gallery">{artworks.slice(0,3).map((a,i) => <div className={'sc-feature-print print-'+i} key={a.id}><EditorialArtwork art={a}/><span>{creators.find(c => c.id === a.creator)?.name}<small>{a.style}</small></span></div>)}</div>
      <span className="sc-feature-bottom">CHARACTER → CREATOR → NEXT MEETING <span>편집 큐레이션 · 예시 작품</span></span>
    </Link>
    <div className="sc-feature-side">
      <Link to="/collections/small-world" className="sc-feature-small is-mint"><div><span className="sc-editorial-label">이번 주 작가 노트</span><h2>작은 네모에 담은<br/>커다란 세계</h2><p>네모네모의 작업실</p><span className="sc-small-cta">작가 이야기 보기 <Icon name="arrow" size={15}/></span></div><EditorialArtwork art={artworks[3]}/></Link>
      <Link to="/collections/autumn-meeting" className="sc-feature-small is-peach"><div><span className="sc-editorial-label">취향에서 행사로</span><h2>가을빛 마켓에서<br/>만나는 내 캐릭터</h2><p>10.17–18 · 서울 성수</p><span className="sc-small-cta">캐릭터와 부스 보기 <Icon name="arrow" size={15}/></span></div><div className="sc-feature-date"><span>OCT</span><strong>17<span>—18</span></strong><Icon name="sparkles" size={35}/></div></Link>
    </div>
  </section>
}

export function CurationDetail({ followButton, creatorCard, eventCard }: { followButton: (id: string) => ReactNode; creatorCard: (id: string) => ReactNode; eventCard: (id: string) => ReactNode }) {
  const { id } = useParams(), [style, setStyle] = useState('전체')
  const collection = collections.find(c => c.id === id)
  if (!collection) return <div className="sc-empty"><h1>특집을 찾을 수 없어요</h1><Link to="/">홈으로 돌아가기</Link></div>
  const items = collection.artIds.map(id => artworks.find(a => a.id === id)!), styles = ['전체',...new Set(items.map(a=>a.style))]
  const shown = style === '전체' ? items : items.filter(a => a.style === style)
  return <><Link className="sc-back" to="/">← 오늘의 큐레이션</Link><header className="sc-collection-header"><span className="sc-eyebrow">{collection.label} · EDITOR'S NOTE</span><h1>{collection.title}</h1><p>{collection.subtitle}</p><div><span>부스하나 편집팀</span><span>2026.10.08</span><span>화면 검토용 가상 작품·작가</span></div></header>
    <div className="sc-collection-intro"><span>이렇게 골랐어요</span><p>{collection.reason}</p></div>
    <section className="sc-section"><div className="sc-section-title"><div><h2>{id==='small-world' ? '한 작가의 두 가지 세계' : id==='autumn-meeting' ? '이번에 만날 캐릭터와 작가' : '어떤 시선이 마음에 드나요?'}</h2><p>{id==='small-world' ? '오리지널 창작과 팬아트에서 이어지는 작가의 취향을 만나보세요.' : id==='autumn-meeting' ? '캐릭터를 고르고 날짜별 판매표와 참가 부스를 확인해보세요.' : '세 작가가 표현한 캐릭터의 다른 매력을 살펴보세요.'}</p></div></div>{styles.length > 2 && <div className="sc-curation-filters" role="group" aria-label="작품 분위기">{styles.map(s=><button key={s} aria-pressed={style===s} onClick={()=>setStyle(s)}>{s}</button>)}</div>}<div className="sc-artwork-grid">{shown.map(a => <article key={a.id} className="sc-artwork-card"><Link to={'/creators/'+a.creator}><EditorialArtwork art={a}/></Link><span className="sc-meta">{a.style} · {subjects.find(s=>s.id===a.subject)?.name}</span><h3><Link to={'/creators/'+a.creator}>{a.title}</Link></h3><p>{a.note}</p><div><Link to={'/creators/'+a.creator}>{creators.find(c=>c.id===a.creator)?.name} <Icon name="arrow" size={16}/></Link>{followButton('creator:'+a.creator)}</div></article>)}</div></section>
    <section className="sc-section"><div className="sc-section-title"><div><h2>이야기의 주인공</h2><p>캐릭터를 관심 등록하고, 다른 작가의 작품과 새로운 소식도 만나보세요.</p></div></div><div className="sc-collection-subjects">{subjects.filter(s=>collection.subjectIds.includes(s.id)).map(s=><article key={s.id}><Link to={'/subjects/'+s.id}><CharacterPortrait id={s.id}/><span><small>{s.work}</small><strong>{s.name}</strong></span></Link>{followButton('subject:'+s.id)}</article>)}</div></section>
    <section className="sc-section"><div className="sc-section-title"><div><h2>작품 뒤의 작가들</h2><p>관심 작가의 다음 활동을 이어서 살펴보세요.</p></div></div><div className="sc-creators-grid">{[...new Set(items.map(a=>a.creator))].map(c=><div key={c}>{creatorCard(c)}</div>)}</div></section>
    <section className="sc-section"><div className="sc-section-title"><div><h2>화면 밖에서 만나는 다음 이야기</h2><p>참여 작가의 참가 행사예요. 특집에 소개한 작품의 현장 판매를 뜻하지는 않아요.</p></div></div><div className="sc-event-grid">{events.filter(e=>collection.eventIds.includes(e.id)).map(e=><div key={e.id}>{eventCard(e.id)}</div>)}</div></section><Link to="/" className="sc-button sc-more-stories">다른 큐레이션 발견하기 <Icon name="arrow" size={17}/></Link></>
}
