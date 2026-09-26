import { useEffect, useRef, useState } from 'react'
import { attemptStorage } from '../support/submission'
import { TradeSubmission } from './submission'

type Receipt={found:boolean;resultId?:number}
export function useTradeSubmission<T extends object,V>(key:string,execute:(body:T & {requestId:string})=>Promise<V>,
    receipt:(id:string)=>Promise<Receipt>,recover:(id:number)=>Promise<V>,onSuccess:(value:V)=>void|Promise<void>) {
  const [,redraw]=useState(0)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const ref=useRef<{key:string;attempt:TradeSubmission<T>;busy:boolean;message:string}|null>(null)
  if(!ref.current||ref.current.key!==key)ref.current={key,attempt:new TradeSubmission<T>(attemptStorage(),key),busy:false,message:''}
  const state=ref.current
  const update=()=>{if(mounted.current&&ref.current===state)redraw(n=>n+1)}
  const finish=async(value:V)=>{
    // Preserve the pending ID when success is no longer shown to this user/scope.
    // Returning to the page checks the receipt instead of submitting a second trade.
    if(!mounted.current||ref.current!==state){state.attempt.failed(new Error('저장 결과를 다시 확인해 주세요.'));return}
    state.attempt.completed();state.message='';update()
    await onSuccess(value)
  }
  const send=async(body:T & {requestId:string})=>{
    if(state.busy)return
    state.busy=true;state.message='';update();let saved=false
    try { const result=await execute(body);saved=true;await finish(result) }
    catch(e){if(!saved)state.attempt.failed(e);state.message=saved?'저장은 완료됐습니다. 목록을 새로고침해 확인해 주세요.':e instanceof Error?e.message:'저장 결과를 확인하지 못했습니다.'}
    finally {state.busy=false;update()}
  }
  const submit=async(body:T)=>{if(state.busy)return;try{await send(state.attempt.prepare(body))}catch(e){state.message=e instanceof Error?e.message:'요청 준비 실패';update()}}
  const retry=async()=>{if(state.attempt.payload)await send(state.attempt.payload)}
  const check=async()=>{
    if(state.busy||!state.attempt.requestId)return
    state.busy=true;state.message='';update()
    try {
      const found=await receipt(state.attempt.requestId)
      if(found.found&&found.resultId){await finish(await recover(found.resultId))}
      else {state.attempt.missing();state.message='아직 저장된 기록이 없습니다. 같은 요청 ID로 다시 입력·전송할 수 있습니다.'}
    }catch(e){state.message=e instanceof Error?e.message:'저장 결과 확인 실패'}
    finally{state.busy=false;update()}
  }
  return {submit,retry,check,busy:state.busy,uncertain:state.attempt.uncertain,
    hasPayload:state.attempt.payload!==null,message:state.message,storageAvailable:state.attempt.storageAvailable}
}
