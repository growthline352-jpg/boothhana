import { useEffect,useRef,useState,type FormEvent } from 'react'
import { Link,useNavigate,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState,LoadingState } from '../../components/ui/States'
import { useInterests } from './InterestProvider'
import { subcultureApi,interestKey,newInterest,type Interest,type Settings } from './api'
import { interestApi,onboardingReturn } from '../interests/api'
import { TasteTitle,TastePortrait,TasteEmpty } from './SubcultureUI'
import './subculture.css'
const media=['게임','애니메이션','만화·웹툰','소설','오리지널·기타']
export function InterestSettingsPage({onboarding=false}:{onboarding?:boolean}){
 const auth=useAuth(),interests=useInterests()
 if(auth.loading||interests.loading)return <LoadingState/>
 if(auth.status==='error')return <ErrorState error={new Error('계정을 확인하지 못했어요.')} retry={()=>void auth.refresh()}/>
 if(auth.status==='anonymous')return <section className="content-wrap section-pad sc-live sc-taste-settings"><TasteTitle title="관심 작품·캐릭터" body="로그인하면 다른 기기에서도 관심을 이어서 볼 수 있어요."/><a className="btn primary" href={auth.loginUrl}>로그인하고 관심 설정</a><Link className="sc-live-back" to="/subculture">먼저 둘러보기</Link></section>
 if(interests.error||!interests.settings)return <ErrorState error={interests.error||new Error('관심을 불러오지 못했어요.')} retry={()=>void interests.reload()}/>
 return <Editor key={auth.user?.id+':'+auth.generation} initial={interests.settings} onboarding={onboarding}/>
}
function Editor({initial,onboarding}:{initial:Settings;onboarding:boolean}){
 const auth=useAuth(),interests=useInterests(),navigate=useNavigate(),[params]=useSearchParams(),guard=useRef(false)
 const [entries,setEntries]=useState(initial.entries),[kind,setKind]=useState('WORK'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[manual,setManual]=useState(false),[editing,setEditing]=useState<string|null>(null),[completing,setCompleting]=useState(false)
 const [name,setName]=useState(''),[work,setWork]=useState(''),[medium,setMedium]=useState('게임'),[workId,setWorkId]=useState(''),[workSearch,setWorkSearch]=useState(''),[workQuery,setWorkQuery]=useState(''),[directWork,setDirectWork]=useState(false)
 const busy=interests.busy||completing
 const list=useRemote("features/subculture/InterestSettingsPage:Editor:list", ()=>subcultureApi.subjects(search,kind),[search,kind])
 const works=useRemote("features/subculture/InterestSettingsPage:Editor:works", ()=>manual&&!directWork?subcultureApi.subjects(workQuery,'WORK'):Promise.resolve([]),[manual,directWork,workQuery])
 useEffect(()=>setEntries(initial.entries),[initial])
 function toggle(entry:Interest){setEntries(old=>old.some(x=>interestKey(x)===interestKey(entry))?old.filter(x=>interestKey(x)!==interestKey(entry)):[...old,entry])}
 function openManual(entry?:Interest){setManual(true);setEditing(entry?.id||null);setName(entry?.customName||'');setWork(entry?.customWork||'');setMedium(entry?.medium||'게임');setWorkId(entry?.customWorkId||'');setDirectWork(entry?!entry.customWorkId:false);setError('')}
 function addCustom(e:FormEvent){e.preventDefault();if(!name.trim()||!work.trim()||!directWork&&!workId){setError('캐릭터 이름과 출처 작품을 입력해 주세요.');return}const entry:Interest={id:editing||crypto.randomUUID(),subjectId:null,exhibitorId:null,customName:name.trim(),customWork:work.trim(),medium,customWorkId:directWork?null:workId,label:name.trim(),workName:work.trim(),available:false};if(entries.some(x=>x.id!==editing&&interestKey(x)===interestKey(entry))){setError('같은 작품의 캐릭터가 이미 선택되어 있어요.');return}setEntries(old=>editing?old.map(x=>x.id===editing?entry:x):[...old,entry]);setManual(false);setError('')}
 async function save(skip=false){
  if(guard.current)return;guard.current=true;setCompleting(true);setError('');const identity=auth.getSnapshot()
  const current=()=>{const now=auth.getSnapshot();return now.status==='authenticated'&&now.user?.id===identity.user?.id&&now.generation===identity.generation}
  try{
   if(!skip)await interests.save(entries,initial.revision)
   if(!current())return
   if(onboarding&&auth.user?.onboardingRequired){const previous=await interestApi.get();if(!current()||previous.userId!==identity.user?.id)return;await interestApi.save(previous,previous.fields,skip);if(!current())return;await auth.refresh();if(auth.getSnapshot().user?.id!==identity.user?.id)return}
   await navigate(onboarding?onboardingReturn(params.get('returnTo')):'/account')
  }catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요.')}finally{guard.current=false;setCompleting(false)}
 }
 return <section className="content-wrap section-pad sc-live sc-taste-settings"><div className="sc-taste-settings-top">{onboarding?<button className="btn secondary" disabled={busy||manual} onClick={()=>void save(true)}>나중에 설정하기</button>:<Link className="sc-live-back" to="/account">← 마이페이지</Link>}<span>관심 작품·캐릭터</span></div><TasteTitle title={onboarding?'어떤 세계를 좋아하세요?':kind==='WORK'?'관심 작품 편집':'관심 캐릭터 편집'} eyebrow="YOUR TASTE, YOUR WORLD" body={kind==='WORK'?'좋아하는 게임·애니메이션·작품을 골라주세요.':'등록된 캐릭터에서 고르거나, 출처 작품과 함께 직접 입력하세요.'}/>
 <div className="sc-taste-settings-layout"><div>
 <div className="sc-live-filters" role="group" aria-label="관심 검색 대상">{[['WORK','작품'],['CHARACTER','캐릭터']].map(([value,label])=><button key={value} disabled={manual||busy} aria-pressed={kind===value} onClick={()=>{setKind(value);setQuery('');setSearch('')}}>{label}</button>)}</div>
 <form className="sc-taste-search" role="search" onSubmit={e=>{e.preventDefault();setSearch(query.trim())}}><label className="discovery-sr-only" htmlFor="interest-search">작품·캐릭터 검색</label><input id="interest-search" type="search" maxLength={100} disabled={manual||busy} value={query} placeholder={kind==='WORK'?'게임, 애니메이션, 작품 이름 검색':'캐릭터 이름으로 검색'} onChange={e=>setQuery(e.target.value)}/><button disabled={manual||busy}>검색</button></form>
 {list.loading?<LoadingState/>:list.error?<ErrorState error={list.error} retry={()=>void list.reload()}/>:<div className="sc-live-options">{list.data?.map(s=>{const entry=newInterest(s),selected=entries.some(e=>interestKey(e)===interestKey(entry));return <button key={s.id} disabled={manual||busy} aria-pressed={selected} aria-label={s.name+' '+(selected?'선택 해제':'선택')} onClick={()=>toggle(entry)}><TastePortrait name={s.name} kind={s.kind==='WORK'?'work':'character'} imageUrl={s.imageUrl}/><strong>{s.name}</strong><small>{s.workName||s.medium} {selected?'· 선택됨':''}</small></button>})}{!list.data?.length&&<TasteEmpty title="등록된 결과가 없어요" body="찾는 캐릭터와 출처 작품을 직접 입력할 수 있어요."/>}</div>}
 {!manual?<button className="btn secondary" disabled={busy} onClick={()=>openManual()}>＋ 목록에 없는 캐릭터 직접 입력</button>:<form className="sc-live-custom" onSubmit={addCustom}><h2>{editing?'직접 입력 수정':'캐릭터 직접 입력'}</h2><label>캐릭터 이름<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><fieldset><legend>출처 작품</legend><label><input type="radio" name="source" checked={!directWork} onChange={()=>setDirectWork(false)}/>등록된 작품 선택</label><label><input type="radio" name="source" checked={directWork} onChange={()=>{setDirectWork(true);setWorkId('')}}/>작품도 직접 입력</label></fieldset>
 {directWork?<><label>작품 종류<select value={medium} onChange={e=>setMedium(e.target.value)}>{media.map(m=><option key={m}>{m}</option>)}</select></label><label>작품 이름<input required maxLength={160} value={work} onChange={e=>setWork(e.target.value)}/></label></>:<><label>작품 찾기<input maxLength={100} value={workSearch} onChange={e=>setWorkSearch(e.target.value)}/></label><button type="button" className="btn secondary" onClick={()=>setWorkQuery(workSearch)}>작품 검색</button>{works.loading?<LoadingState/>:works.error?<ErrorState error={works.error} retry={()=>void works.reload()}/>:<label>출처 작품 선택<select required value={workId} onChange={e=>{const chosen=works.data?.find(w=>w.id===e.target.value);setWorkId(e.target.value);setWork(chosen?.name||'');setMedium(chosen?.medium||'게임')}}><option value="">작품을 선택하세요</option>{workId&&!works.data?.some(w=>w.id===workId)&&<option value={workId}>{work}</option>}{works.data?.map(w=><option key={w.id} value={w.id}>{w.name} · {w.medium}</option>)}</select></label>}</>}
 <p>직접 입력은 내 관심에 저장돼요. 정보가 연결되기 전에는 관련 행사로 표시하지 않아요.</p><div className="sc-live-form-actions"><button type="button" onClick={()=>{setManual(false);setError('')}}>취소</button><button>{editing?'수정 반영':'선택에 추가'}</button></div></form>}
 </div><aside className="sc-taste-settings-summary" aria-label="선택한 관심"><span className="sc-taste-eyebrow">MY FAVORITES</span><h2>내가 고른 취향 {entries.length}</h2><div className="sc-live-selected">{entries.map(e=><div key={e.id}><span><strong>{e.label||e.customName||'관심 대상'}</strong><small>{e.workName||e.customWork}{e.customName?' · 정보 연결 대기':''}</small></span>{e.customName&&<button disabled={manual||busy} onClick={()=>openManual(e)} aria-label={(e.label||e.customName)+' 수정'}>수정</button>}<button disabled={manual||busy} onClick={()=>setEntries(old=>old.filter(x=>x.id!==e.id))} aria-label={(e.label||e.customName)+' 선택 해제'}>×</button></div>)}</div>{!entries.length&&<p>목록에서 작품과 캐릭터를 골라주세요.</p>}<p>저장 버튼을 누르면 반영돼요.</p></aside></div>
 {error&&<p role="alert" className="sc-live-notice">{error} <button disabled={busy} onClick={()=>void interests.reload()}>저장된 설정 다시 불러오기</button></p>}
 <div className="sc-live-settings-actions"><span>{entries.length}/100개 선택</span><button className="btn primary" disabled={manual||busy||entries.length>100} onClick={()=>void save()}>{busy?'저장 중…':onboarding?'내 취향으로 시작하기':'관심 설정 저장'}</button>{!onboarding&&<Link to="/account">저장하지 않고 나가기</Link>}</div>
 </section>
}
