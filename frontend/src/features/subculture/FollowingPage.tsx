import { Link } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { ErrorState,LoadingState } from '../../components/ui/States'
import { useInterests } from './InterestProvider'
import { FollowButton } from './FollowButton'
import { TasteTitle,TasteSectionTitle,TastePortrait,TasteEmpty } from './SubcultureUI'
export function FollowingPage(){
 const auth=useAuth(),interests=useInterests()
 const entries=interests.settings?.entries||[]
 const sections=[['CHARACTER','관심 캐릭터'],['WORK','관심 작품'],['CREATOR','관심 작가·서클']] as const
 return <section className="content-wrap section-pad sc-live sc-taste-following"><Link className="sc-live-back" to="/account">← 마이페이지</Link><TasteTitle title="나의 관심" eyebrow="YOUR FAVORITES" body="관심 캐릭터와 작가를 한곳에서 확인하세요."/>
 {auth.loading||interests.loading?<LoadingState/>:interests.error?<ErrorState error={interests.error} retry={()=>void interests.reload()}/>:auth.status==='anonymous'?<TasteEmpty title="로그인하고 관심을 이어서 보세요"><a className="btn primary" href={auth.loginUrl}>로그인</a></TasteEmpty>:<><Link className="btn secondary" to="/account/interests">작품·캐릭터 편집 →</Link>{!entries.length&&<TasteEmpty title="아직 관심이 없어요" body="캐릭터나 작가의 하트를 눌러 담아보세요."><Link className="btn primary" to="/subculture/subjects">캐릭터 찾아보기</Link></TasteEmpty>}{sections.map(([kind,title])=>{const items=entries.filter(e=>(e.exhibitorId?'CREATOR':e.kind==='WORK'?'WORK':'CHARACTER')===kind);return !!items.length&&<section className="sc-taste-section" key={kind}><TasteSectionTitle title={title}/><div className="sc-taste-subject-grid">{items.map(e=>{const name=e.label||e.customName||'관심 대상';return <article className="sc-taste-subject-card" key={e.id}><Link to={e.subjectId?'/subculture/subjects/'+e.subjectId:e.exhibitorId?'/subculture/creators/'+e.exhibitorId:'/account/interests'}><TastePortrait name={name} kind={kind==='CREATOR'?'creator':kind==='WORK'?'work':'character'}/><small>{e.workName||e.customWork||title}{e.customName?' · 직접 입력':''}</small><h3>{name}</h3><span>{e.customName?'정보 연결 대기':'관련 정보 보기 →'}</span></Link><FollowButton entry={e}/></article>})}</div></section>})}</>}
 </section>
}
