export function TradeRecovery({state}:{state:{busy:boolean;uncertain:boolean;hasPayload:boolean;message:string;storageAvailable:boolean;check:()=>Promise<void>;retry:()=>Promise<void>}}) {
  return <>{!state.storageAvailable&&<p className="form-alert" role="status">이 브라우저에 요청 ID를 보관할 수 없습니다. 결과 확인 전 새로고침하거나 창을 닫지 마세요.</p>}
    {state.message&&<p className="form-alert" role="status">{state.message}</p>}
    {state.uncertain&&<section className="notice-banner" aria-label="저장 결과 확인"><strong>이미 저장됐을 수 있습니다.</strong><p>중복 예약·판매를 막기 위해 입력을 잠갔습니다. 저장 결과를 확인하거나 같은 요청을 다시 전송하세요.</p><div className="row-actions"><button type="button" className="btn secondary" disabled={state.busy} onClick={()=>void state.check()}>저장 결과 확인</button>{state.hasPayload&&<button type="button" className="btn secondary" disabled={state.busy} onClick={()=>void state.retry()}>같은 요청 다시 전송</button>}</div></section>}
  </>
}
