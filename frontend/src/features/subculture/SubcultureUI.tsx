import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { ContentImage } from '../../components/ui/ContentImage'
import { SaveButton } from '../library/SaveButton'
import { eventDateLabel } from '../discovery/browse'
import { labels } from '../catalog/Shared'
import { FollowButton } from './FollowButton'
import { newInterest, type Creator, type Subject, type Feed } from './api'
import './subcultureExperience.css'

export const subcultureEventsHref='/discover?category=subculture&period=all&sort=recent'
export function TasteTitle({title,body,eyebrow='DISCOVER YOUR FAVORITES'}:{title:string;body?:string;eyebrow?:string}){
 return <header className="sc-taste-title"><span>{eyebrow}</span><h1>{title}</h1>{body&&<p>{body}</p>}</header>
}
export function TasteSectionTitle({title,note,children}:{title:string;note?:string;children?:ReactNode}){
 return <div className="sc-taste-section-title"><div><h2>{title}</h2>{note&&<p>{note}</p>}</div>{children}</div>
}
export function TasteEmpty({title,body,children}:{title:string;body?:string;children?:ReactNode}){
 return <div className="sc-taste-empty"><Icon name="search" size={28}/><h2>{title}</h2>{body&&<p>{body}</p>}{children}</div>
}
export function TastePortrait({name,kind='character'}:{name:string;kind?:'character'|'creator'|'work'}){
 return <span className={'sc-taste-portrait is-'+kind} aria-label={name+' · 대표 이미지 미등록'}><span aria-hidden="true">{Array.from(name.trim())[0]||'?'}</span></span>
}
export function TasteSubjectCard({subject}:{subject:Subject}){
 const location=useLocation()
 return <article className="sc-taste-subject-card"><Link to={'/subculture/subjects/'+subject.id} state={{subcultureReturnTo:location.pathname+location.search}}><TastePortrait name={subject.name} kind={subject.kind==='WORK'?'work':'character'}/><small>{subject.workName||subject.medium||'작품'} · {subject.kind==='CHARACTER'?'캐릭터':'작품'}</small><h3>{subject.name}</h3><span>관련 행사·굿즈·작가 보기 <Icon name="chevron" size={15}/></span></Link><FollowButton entry={newInterest(subject)}/></article>
}
export function TasteCreatorCard({creator}:{creator:Creator}){
 const location=useLocation()
 return <article className="sc-taste-creator-card"><Link className="sc-taste-creator-cover" to={'/subculture/creators/'+creator.id} state={{subcultureReturnTo:location.pathname+location.search}}><TastePortrait name={creator.name} kind="creator"/></Link><div className="sc-taste-creator-copy"><small>{creator.kind==='CIRCLE'?'서클':'작가·서클'}</small><h3><Link to={'/subculture/creators/'+creator.id} state={{subcultureReturnTo:location.pathname+location.search}}>{creator.name}</Link></h3><p>참가 행사와 공개된 작업을 살펴보세요.</p><Link to={'/subculture/creators/'+creator.id} state={{subcultureReturnTo:location.pathname+location.search}}>작가 둘러보기 <Icon name="arrow" size={15}/></Link><FollowButton entry={newInterest(undefined,creator)}/></div></article>
}
export function TasteEventCard({row,from}:{row:Feed['events'][number];from:string}){
 return <article className="sc-taste-event-card"><Link to={'/discover/'+row.id} state={{subcultureReturnTo:from}}><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt={row.event.name+' 대표 이미지'}/><div><small>{labels[row.event.subcategory]||'행사'}</small><h3>{row.event.name}</h3><strong>{eventDateLabel(row.event.occurrences)}</strong><p>{row.event.venueName||row.event.region}</p>{!!row.reasons.length&&<span className="sc-taste-evidence">{row.reasons.join(' · ')}</span>}</div></Link><SaveButton target={{type:'EVENT',eventId:row.id,id:row.id,participantId:null}} compact/></article>
}
export function TasteExploreNav({q=''}:{q?:string}){
 const location=useLocation(),query=q?'?'+new URLSearchParams({q}):''
 const items=[['/subculture/search','전체'],['/subculture/subjects','작품·캐릭터'],['/subculture/creators','작가·서클'],['/subculture/products','굿즈'],[subcultureEventsHref+(q?'&'+new URLSearchParams({q}):''),'행사']]
 return <nav className="sc-taste-tabs" aria-label="탐색 대상">{items.map(([href,label])=><Link key={label} to={href.includes('/discover')?href:href+query} aria-current={location.pathname===href.split('?')[0]?'page':undefined}>{label}</Link>)}</nav>
}
