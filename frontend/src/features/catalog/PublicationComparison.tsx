import type { EventDetail } from './api'
const fields:Record<string,string>={name:'행사명',subcategory:'행사 유형',subjects:'취향 주제',occurrences:'일정',venueName:'장소',address:'주소',description:'소개',admission:'입장 안내',operationStatus:'개최 상태',visitorGuide:'방문 안내'}
export function PublicationComparison({detail}:{detail:EventDetail}) {
  if(!detail.publishedEvent)return <p>아직 공개본이 없습니다. 검토 후 처음 공개할 수 있습니다.</p>
  const current=detail.event as unknown as Record<string,unknown>,published=detail.publishedEvent as unknown as Record<string,unknown>
  const keys=Object.keys(fields).filter(k=>JSON.stringify(current[k]??null)!==JSON.stringify(published[k]??null))
  return <details className="panel"><summary>행사 정보 공개본과 비교 · 변경 {keys.length}개</summary><p>저장된 행사 정보와 현재 공개본을 비교합니다. 부스·상품·이미지의 검토 상태는 각 탭에서 확인하세요.</p>{keys.length?keys.map(k=><details key={k}><summary>{fields[k]}</summary><h4>현재 사용자에게 공개 중</h4><pre className="publication-json">{JSON.stringify(published[k]??null,null,2)}</pre><h4>저장된 수정본</h4><pre className="publication-json">{JSON.stringify(current[k]??null,null,2)}</pre></details>):<p>행사 정보가 공개본과 같습니다.</p>}</details>
}
