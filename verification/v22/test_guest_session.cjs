const {test}=require('node:test'),assert=require('node:assert/strict');
const {runtime,nodes,text,component,wait}=require('./support/runtime.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',KEY='A'.repeat(43);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){let reply=async()=>ticket(A,2);const sent=[];
 const api={guestRead:async a=>ticket(a.ticketId,1),guestReply:async(a,m)=>{sent.push({a,m});return reply(a,m)},options:async()=>({guestEnabled:true})};
 const components=Object.fromEntries(['PageHeader','LoadingState','ErrorState','EmptyState','TicketHeader','MessageThread','ReplyForm'].map(n=>[n,component(n)]));
 const h=runtime({globals:{window:{location:{origin:'https://booth.test'},confirm:()=>true}},resolve:(name)=>{
  if(name==='react-router')return {Link:component('Link')};
  if(name.endsWith('/useRemote'))return {useRemote:()=>({data:{guestEnabled:true},loading:false,error:null,reload:async()=>{}})};
  if(name==='./api')return {supportApi:api};if(name==='./useSupportUnsaved')return {useUnsaved:()=>()=>{}};
  if(name.endsWith('/PageHeader')||name.endsWith('/States')||name==='./TicketViews')return components;
 }});
 const Page=h.load('frontend/src/features/support/GuestSupportPage.tsx').GuestSupportPage;
 const render=()=>h.render(Page,{});let tree=render();h.flushEffects();
 const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n)===label);
 const input=(label,value)=>{const node=nodes(render()).find(n=>n.type==='label'&&text(n.props.children?.[0])===label);assert.ok(node,'label '+label);nodes(node).find(n=>n.type==='input').props.onChange({target:{value}})};
 async function read(id){button('답변 조회').props.onClick();render();input('접수 전체 ID',id);input('비밀 조회키 — 다른 사람에게 전달하지 마세요',KEY);nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();return render()}
 const header=()=>nodes(render()).find(n=>n.type?.name==='TicketHeader')?.props.ticket;
 const replyHandler=()=>nodes(render()).find(n=>n.type?.name==='ReplyForm').props.onSend;
 return {h,read,render,header,button,replyHandler,sent,setReply(fn){reply=fn}};
}
function ticket(id,revision){return {id,revision,kind:'INQUIRY',status:'OPEN',title:`PRIVATE ${id}`,messages:[]}}
test('closing guest lookup prevents a late successful reply from resurrecting content',async()=>{const x=setup();await x.read(A);const d=wait();x.setReply(()=>d.promise);const p=x.replyHandler()({body:'test'}).catch(()=>{});x.button('조회 종료·키 지우기').props.onClick();assert.equal(x.header(),undefined);d.resolve(ticket(A,2));await p;assert.equal(x.header(),undefined)});
test('late reply for A cannot replace currently opened private ticket B',async()=>{const x=setup();await x.read(A);const d=wait();x.setReply(()=>d.promise);const p=x.replyHandler()({body:'test'}).catch(()=>{});x.button('조회 종료·키 지우기').props.onClick();await x.read(B);assert.equal(x.header().id,B);d.resolve(ticket(A,2));await p;assert.equal(x.header().id,B)});
test('close then reopen the same ticket still invalidates the previous lookup session',async()=>{const x=setup();await x.read(A);const d=wait();x.setReply(()=>d.promise);const p=x.replyHandler()({body:'test'}).catch(()=>{});x.button('조회 종료·키 지우기').props.onClick();await x.read(A);d.resolve(ticket(A,2));await p;assert.equal(x.header().revision,1)});
test('retained old reply callback cannot send using the newly opened ticket credentials',async()=>{const x=setup();await x.read(A);const old=x.replyHandler();x.button('조회 종료·키 지우기').props.onClick();await x.read(B);await old({body:'old draft'}).catch(()=>{});assert.equal(x.sent.length,0);assert.equal(x.header().id,B)});
test('normal reply updates the active ticket using the captured access key',async()=>{const x=setup();await x.read(A);await x.replyHandler()({body:'valid'});assert.equal(x.header().revision,2);assert.equal(x.sent.length,1);assert.equal(x.sent[0].a.ticketId,A);assert.equal(x.sent[0].a.accessKey,KEY)});
test('late failure after closing does not restore content and lookup can be reused',async()=>{const x=setup();await x.read(A);const d=wait();x.setReply(()=>d.promise);const p=x.replyHandler()({body:'test'}).catch(()=>{});x.button('조회 종료·키 지우기').props.onClick();d.reject(Error('remote failure'));await p;assert.equal(x.header(),undefined);await x.read(B);assert.equal(x.header().id,B)});
