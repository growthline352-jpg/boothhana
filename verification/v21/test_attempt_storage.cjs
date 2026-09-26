const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load_source.cjs');
const {TicketSubmission}=loadSource('frontend/src/features/support/submission.ts');
const {TradeSubmission}=loadSource('frontend/src/features/trade/submission.ts');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function setup(Type){const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};return {data,storage,make:id=>new Type(storage,'same-key',()=>id)}}
for(const [name,Type] of [['ticket',TicketSubmission],['trade',TradeSubmission]]){
 for(const action of ['failed','missing','completed'])test(name+': late '+action+' does not replace or remove a newer receipt ID',()=>{
  const h=setup(Type),old=h.make(ids[0]);old.prepare({description:'private fixture'});old.failed(Error('uncertain'));
  const recovery=h.make(ids[1]);assert.equal(recovery.requestId,ids[0]);recovery.completed();
  const fresh=h.make(ids[1]);fresh.prepare({description:'different private fixture'});
  if(action==='failed')old.failed(Error('late failure'));else old[action]();
  assert.equal(h.data.get('same-key'),ids[1]);assert.equal(h.make(ids[0]).requestId,ids[1]);
 });
 test(name+': a late failure does not resurrect an already recovered request',()=>{
  const h=setup(Type),old=h.make(ids[0]);old.prepare({});h.make(ids[1]).completed();old.failed(Error('late'));
  assert.equal(h.data.has('same-key'),false);
 });
 test(name+': two fresh forms cannot overwrite each other before submission',()=>{
  const h=setup(Type),a=h.make(ids[0]),b=h.make(ids[1]);a.prepare({});assert.throws(()=>b.prepare({}));assert.equal(h.data.get('same-key'),ids[0]);assert.equal(b.payload,null,'a rejected new request must not appear as a retryable payload');assert.equal(b.requestId,null);assert.equal(b.uncertain,true);
 });
 test(name+': normal recovery reuses its ID and clears only its own slot',()=>{
  const h=setup(Type),a=h.make(ids[0]);a.prepare({secret:'not persisted'});a.failed(Error());const b=h.make(ids[1]);
  assert.equal(b.uncertain,true);b.missing();assert.equal(b.prepare({}).requestId,ids[0]);b.completed();assert.equal(h.data.size,0);
 });
 test(name+': unavailable storage still allows the existing in-memory recovery mode',()=>{
  const a=new Type({getItem(){throw Error('disabled')},setItem(){throw Error('disabled')},removeItem(){throw Error('disabled')}},'key',()=>ids[0]);
  assert.equal(a.storageAvailable,false);assert.equal(a.prepare({}).requestId,ids[0]);a.failed(Error());assert.equal(a.uncertain,true);a.completed();assert.equal(a.requestId,null);
 });
}
