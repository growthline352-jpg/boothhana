const assert=require('node:assert/strict')
const {harness,nodes,toHtml}=require('../v10/source_harness.cjs')
const h=harness(),{TicketSubmission,isDefiniteRejection}=h.load('frontend/src/features/support/submission.ts')
let checks=0;const check=(x,m)=>{assert.ok(x,m);checks++}
const storage=new Map(),adapter={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
const id='11111111-2222-4333-8444-555555555555',data={kind:'INQUIRY',category:'SERVICE',title:'[TEST] 문의',body:'비공개 본문',evidence:['https://private.example/evidence'],target:null,context:{},exhibitorId:null}
const attempt=new TicketSubmission(adapter,'user1',()=>id)
let request=attempt.prepare(data);check(request.requestId===id,'first ID')
attempt.failed(new Error('response lost'));check(attempt.uncertain,'network ambiguous');assert.throws(()=>attempt.prepare({...data,body:'edited'}));checks++
check([...storage.values()].join()===id,'only ID persisted; no private body')
attempt.missing();request=attempt.prepare({...data,body:'edited'});check(request.requestId===id,'missing receipt keeps ID during race')
for(const status of [409,500,502,503,504])check(!isDefiniteRejection({status}),`uncertain ${status}`)
for(const status of [400,401,403,404,413,415,422,429])check(isDefiniteRejection({status}),`definite ${status}`)
attempt.failed({status:400});check(!attempt.uncertain,'validation editable');check(attempt.prepare(data).requestId===id,'validation ID retained')
const restored=new TicketSubmission(adapter,'user1');check(restored.uncertain&&restored.requestId===id&&restored.payload===null,'reload stores ID only')
check(new TicketSubmission(adapter,'user2').requestId===null,'account isolation')
restored.completed();check(!storage.has('user1'),'success clears pending metadata')
const unavailable=new TicketSubmission({getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}},'x',()=>id);check(!unavailable.storageAvailable,'storage failure visible');unavailable.prepare(data);unavailable.failed(Error());check(unavailable.uncertain,'in-memory retry still protects')
async function actualForm(){
 const requests=[],db=new Map();let receiptCalls=0
 const app=harness({location:{pathname:'/support/new',search:''},auth:{user:{id:1,permissions:['FAN','CREATOR']},loading:false,loginUrl:'/login'},remote:{loading:false,error:null,data:null,reload:async()=>{}},supportApi:{create:async input=>{requests.push(structuredClone(input));db.set(input.requestId,input);throw Error('response lost')},receipt:async id=>{receiptCalls++;return db.has(id)?{found:true,id}:{found:false}}}})
 const mod=app.load('frontend/src/features/support/SupportPages.tsx'),form=app.render(mod.SupportNew).type
 const render=()=>app.render(form);let view=render();const find=(type,key,value)=>nodes(view).find(n=>n.type===type&&n.props[key]===value)
 find('input','maxLength',160).props.onChange({target:{value:'문의'}});view=render();find('textarea','maxLength',10000).props.onChange({target:{value:'문의 내용'}});view=render()
 const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))}
 nodes(view).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flush();view=render()
 check(find('fieldset','disabled',true),'uncertain form locked');check(toHtml(view).includes('접수 여부 확인'),'recovery action')
 // Synthetic handler call bypasses disabled HTML controls; submit still must not send a new request.
 find('textarea','maxLength',10000).props.onChange({target:{value:'edited after response loss'}});view=render()
 nodes(view).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flush();view=render()
 check(requests.length===1&&db.size===1,'no second ID even after direct handler edit')
 const recovery=nodes(view).find(n=>n.type==='button'&&toHtml(n).includes('접수 여부 확인'))
 recovery.props.onClick();await flush();check(receiptCalls===1&&db.size===1,'receipt lookup not duplicate create')
}
actualForm().then(()=>console.log(`PASS v13 ${checks} submission/state/actual TSX handler assertions (mock hooks/API, not React DOM)`)).catch(e=>{console.error(e);process.exit(1)})
