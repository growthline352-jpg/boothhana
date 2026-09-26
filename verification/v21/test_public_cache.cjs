const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSource,wait}=require('./load_source.cjs');
const {PublicMemoryCache}=loadSource('frontend/src/features/library/publicCache.ts',{'./api':{libraryApi:{}}});
const target=id=>({type:'PRODUCT',eventId:1,id,participantId:10});
const result=t=>({target:t,available:true,image:null,current:{memory:{title:'fixture '+t.id}}});
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
test('overlapping batches request each pending target once and preserve each caller order',async()=>{
 const jobs=[],cache=new PublicMemoryCache(rows=>{const q=wait();jobs.push({...q,rows});return q.promise});
 const a=cache.resolve([target(1),target(2)]),b=cache.resolve([target(2),target(3),target(2)]);
 const settled=Promise.all([a,b]);await tick();
 const requests=jobs.map(j=>j.rows.map(t=>t.id));
 for(const job of jobs.toReversed())job.resolve(job.rows.map(result).toReversed());
 const [first,second]=await settled;
 assert.deepEqual(requests,[[1,2],[3]],'the same target must not get racing old/new responses');
 assert.deepEqual(first.map(x=>x.target.id),[1,2]);assert.deepEqual(second.map(x=>x.target.id),[2,3,2]);
});
test('cache capacity eviction never destroys a successful in-flight result',async()=>{
 const jobs=[],cache=new PublicMemoryCache(rows=>{const q=wait();jobs.push({...q,rows});return q.promise});
 const calls=Array.from({length:3},(_,b)=>cache.resolve(Array.from({length:200},(_,i)=>target(b*200+i+1))));
 const outcome=Promise.allSettled(calls);await tick();jobs.forEach(j=>j.resolve(j.rows.map(result)));
 const values=await outcome;assert.deepEqual(values.map(x=>x.status),['fulfilled','fulfilled','fulfilled']);
 for(let i=0;i<3;i++)assert.deepEqual(values[i].value.map(x=>x.target.id),Array.from({length:200},(_,n)=>i*200+n+1));
});
test('a cached hit that expires while another item loads is not returned as fresh',async()=>{
 let now=100,held=wait(),slow=false;
 const cache=new PublicMemoryCache(async rows=>slow?held.promise:rows.map(result),()=>now);
 await cache.resolve([target(1)]);slow=true;now=30090;
 const pending=cache.resolve([target(1),target(2)]),outcome=Promise.allSettled([pending]);await tick();now=30101;held.resolve([result(target(2))]);
 assert.equal((await outcome)[0].status,'rejected');
});
test('failed overlapping batch rejects its waiters, cleans pending, and can retry',async()=>{
 const jobs=[],cache=new PublicMemoryCache(rows=>{const q=wait();jobs.push({...q,rows});return q.promise});
 const a=cache.resolve([target(1)]),b=cache.resolve([target(1),target(2)]),outcome=Promise.allSettled([a,b]);await tick();
 jobs[0].reject(Error('fixture API failure'));jobs.slice(1).forEach(j=>j.resolve(j.rows.map(result)));
 const failed=await outcome;assert.deepEqual(failed.map(x=>x.status),['rejected','rejected']);
 const next=cache.resolve([target(1)]);await tick();jobs.at(-1).resolve(jobs.at(-1).rows.map(result));assert.equal((await next)[0].available,true);
});
test('clear while pending rejects prior callers without deleting a newer in-flight request',async()=>{
 const jobs=[],cache=new PublicMemoryCache(rows=>{const q=wait();jobs.push({...q,rows});return q.promise});
 const old=cache.resolve([target(1)]),oldOutcome=Promise.allSettled([old]);await tick();cache.clear();
 const fresh=cache.resolve([target(1)]);await tick();jobs[0].resolve(jobs[0].rows.map(result));assert.equal((await oldOutcome)[0].status,'rejected');
 const also=cache.resolve([target(1)]);await tick();assert.equal(jobs.length,2);
 jobs[1].resolve([{target:target(1),available:false,current:{memory:{title:'must not leak'}},image:{url:'old'}}]);
 for(const answer of await Promise.all([fresh,also]))assert.deepEqual(answer,[{target:target(1),available:false,current:null,image:null}]);
});
test('an invalid multi-item response is never partially cached',async()=>{
 let calls=0;const cache=new PublicMemoryCache(async rows=>{calls++;return calls===1?[result(target(1)),{...result(target(2)),current:null}]:rows.map(result)});
 await assert.rejects(cache.resolve([target(1),target(2)]));await cache.resolve([target(1)]);assert.equal(calls,2);
});
