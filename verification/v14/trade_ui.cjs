const assert=require('node:assert/strict')
const {harness,toHtml}=require('../v10/source_harness.cjs')
const app=harness(),{TradeSubmission,tradeAttemptKey}=app.load('frontend/src/features/trade/submission.ts')
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++}
const storage=new Map(),adapter={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
const id='11111111-2222-4333-8444-555555555555',body={eventBoothId:10,items:[{eventProductId:5,quantity:2}],paymentMethod:'CASH'}
const key=tradeAttemptKey(1,'POS','10'),first=new TradeSubmission(adapter,key,()=>id)
const sent=first.prepare(body);body.items[0].quantity=9
ok(sent.items[0].quantity===2,'request is immutable copy');ok(sent.requestId===id,'id created once');ok(storage.get(key)===id,'only UUID stored')
first.failed(Error('lost response'));ok(first.uncertain,'network result unknown');assert.throws(()=>first.prepare(body));checks++
first.missing();ok(first.prepare(body).requestId===id,'not-yet-committed receipt keeps same ID')
first.failed({status:400});ok(!first.uncertain,'definite validation failure allows edit');ok(first.prepare(body).requestId===id,'same ID even after known failure')
for(const status of [409,500,502,503]){first.failed({status});ok(first.uncertain,`${status} requires recovery`)}
const restored=new TradeSubmission(adapter,key);ok(restored.uncertain&&restored.payload===null&&restored.requestId===id,'reload preserves ID, no cart in storage')
ok(new TradeSubmission(adapter,tradeAttemptKey(2,'POS','10')).requestId===null,'account isolation');ok(new TradeSubmission(adapter,tradeAttemptKey(1,'RESERVATION','10')).requestId===null,'operation isolation');ok(new TradeSubmission(adapter,tradeAttemptKey(1,'POS','11')).requestId===null,'booth isolation')
restored.completed();ok(!storage.has(key),'success removes pending ID')
const broken=new TradeSubmission({getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}},key,()=>id);ok(!broken.storageAvailable,'storage limitation exposed');broken.prepare(body);broken.failed(Error());ok(broken.uncertain,'in-memory recovery with storage unavailable')
async function hooks(){
 const h=harness(),{useTradeSubmission}=h.load('frontend/src/features/trade/useTradeSubmission.ts');let db=new Map(),requests=[],selected=[],fail=true,active='booth-a'
 const execute=async payload=>{requests.push(payload);db.set(payload.requestId,{id:91});if(fail)throw Error('lost response');return{id:91}}
 const receipt=async id=>db.has(id)?{found:true,resultId:91}:{found:false}
 const recover=async id=>({id})
 const render=()=>h.render(()=>useTradeSubmission(active,execute,receipt,recover,value=>selected.push(value.id)))
 let state=render();await state.submit({eventBoothId:10,items:[{eventProductId:5,quantity:2}]});state=render();ok(state.uncertain,'hook locks uncertain request');await state.submit({eventBoothId:10,items:[]});ok(requests.length===1,'programmatic edited resubmit blocked')
 fail=false;await state.retry();state=render();ok(requests.length===2&&requests[0].requestId===requests[1].requestId,'retry uses original exact request');ok(db.size===1&&selected.length===1,'one logical result');ok(!state.uncertain,'recovered success clears state')
 // A response pending during booth/account switch does not deliver into the new scope.
 let resolve;const late=new Promise(r=>resolve=r),other=harness(),hook=other.load('frontend/src/features/trade/useTradeSubmission.ts').useTradeSubmission;let scope='a',seen=[]
 const draw=()=>other.render(()=>hook(scope,()=>late,receipt,recover,x=>seen.push(x)))
 let old=draw(),pending=old.submit({eventBoothId:10});scope='b';draw();resolve({id:42});await pending;ok(seen.length===0,'late result cannot navigate or mutate another scope')
 const simple=harness(),{TradeRecovery}=simple.load('frontend/src/features/trade/TradeRecovery.tsx')
 const html=toHtml(simple.render(TradeRecovery,{state:{uncertain:true,hasPayload:true,busy:false,storageAvailable:true,message:'',check:async()=>{},retry:async()=>{}}}))
 ok(html.includes('저장 결과 확인')&&html.includes('같은 요청 다시 전송'),'recovery actions rendered')
 console.log(`PASS v14 ${checks} trade state/hook/JSX assertions (mock hooks/API, NOT React DOM)`)
}
hooks().catch(e=>{console.error(e);process.exit(1)})
