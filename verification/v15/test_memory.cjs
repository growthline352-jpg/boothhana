const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const ts=require('../v4/load_ts.cjs')();const root=path.resolve(__dirname,'../..'),cache={};let n=0
function ok(value,message){assert.ok(value,message);n++}function equal(a,b){assert.deepEqual(a,b);n++}function bad(fn){assert.throws(fn);n++}
function load(rel){let p=path.resolve(root,rel);if(!path.extname(p))p+='.ts';if(cache[p])return cache[p].exports;let source=fs.readFileSync(p,'utf8'),m={exports:{}};cache[p]=m
 const code=ts.transpileModule(source.replace(/\bimport\.meta\.env\b/g,'({})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:p})(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(p),name))):require(name),m,m.exports);return m.exports}
const {GuestStore}=load('frontend/src/features/library/guestStore.ts'),{targetKey,memoryHref,validTarget,matchesMemory,guestEntry}=load('frontend/src/features/library/memory.ts')
class Storage {m=new Map;get length(){return this.m.size}key(i){return [...this.m.keys()][i]||null}getItem(k){return this.m.get(k)||null}setItem(k,v){this.m.set(k,v)}removeItem(k){this.m.delete(k)}}
const s=new Storage(),time=Date.parse('2026-09-18T03:00:00Z'),g=new GuestStore(()=>s,()=>time)
const participant={type:'PARTICIPANT',eventId:1,id:2,participantId:2},product={type:'PRODUCT',eventId:1,id:3,participantId:2},event={type:'EVENT',eventId:1,id:1,participantId:null}
const input={target:participant,day:'2026-09-18',hall:'1관'},first=g.save(input)
equal(g.list().length,1);equal(g.save(input),first);equal(g.list().length,1);equal(first.visitedDays,[])
g.update(first.key,{note:'소음 비교 후 선물 결정',visitedDays:['2026-09-18']});const p=g.save({...input,target:product});equal(p.visitedDays,['2026-09-18']);equal(g.list().length,2)
equal(g.list().find(x=>x.key===first.key).note,'소음 비교 후 선물 결정');ok(!JSON.stringify([...s.m.values()]).includes('imageUrl'))
const secondTab=new GuestStore(()=>s,()=>time);secondTab.save({...input,target:event});equal(g.list().length,3);g.remove(p.key);equal(secondTab.list().length,2)
bad(()=>g.save({...input,target:{...event,id:2}}));bad(()=>g.save({...input,day:'2026-02-30'}));bad(()=>g.update(first.key,{note:'x'.repeat(1001)}));bad(()=>new GuestStore(()=>{throw Error('blocked')}).save(input))
const expired=new GuestStore(()=>s,()=>time+91*86400000);equal(expired.list().length,0)
s.setItem('not-ours','private-other-app');g.clear();equal(s.getItem('not-ours'),'private-other-app');equal(g.list().length,0)
s.setItem('boothhana.memory.v15.bad','{bad');equal(g.list().length,0)
for(const t of [participant,product,event])ok(validTarget(t));ok(!validTarget({...product,participantId:null}));ok(!validTarget({...event,eventId:0}));ok(!validTarget({...product,type:'ASSET'}))
const href=memoryHref(product,'2026-09-18','1관');ok(href.startsWith('/discover/1?'));ok(href.includes('booth=2'));ok(href.includes('product=3'));ok(!href.includes('note'));ok(!href.includes('library'));ok(memoryHref(product,'2026-09-18','1관',true).includes('focus=2'));ok(!memoryHref(product,'2026-09-18','1관',true).includes('booth='))
const memory={title:'달토끼 키링',eventName:'[TEST] 기억행사',participantName:'별빛공방',summary:'작은 식물 장식',tags:['핸드메이드']},r={target:participant,available:true,image:null,current:{memory,occurrences:[],locations:[],links:[],operationState:'UNKNOWN',notice:'',venue:'',evidenceScope:'UNKNOWN',saleState:'UNKNOWN',price:null,publishedAt:''}}
const entry=guestEntry({...first,note:'소음 비교',visitedDays:['2026-09-18']},r)
ok(matchesMemory(entry,'달토끼 소음'));ok(matchesMemory(entry,'식물'));ok(matchesMemory(entry,'별빛'));ok(!matchesMemory(entry,'없는정보'))
const hidden=guestEntry({...first,note:'내 메모'}, {...r,available:false,current:null});equal(hidden.saved,null);ok(!matchesMemory(hidden,'달토끼'));ok(matchesMemory(hidden,'내 메모'))
const {parseVisit,visitParams}=load('frontend/src/features/visit/visit.ts');const ev={occurrences:[{startDate:'2026-09-18',endDate:'2026-09-18'}]};const v=parseVisit(new URLSearchParams(href.split('?')[1]),ev);equal(v.product,3);ok(visitParams(v).has('product'))
const before=g.save(input),after=g.update(before.key,{note:'다른 화면에서 수정'},before.revision)
equal(after.revision,before.revision+1);bad(()=>g.update(before.key,{note:'오래된 화면'},before.revision));bad(()=>g.remove(before.key,before.revision));equal(g.list().find(x=>x.key===before.key).note,'다른 화면에서 수정')
const expiredAgain=new GuestStore(()=>s,()=>time+91*86400000);expiredAgain.list();ok(!s.getItem('boothhana.memory.v15.'+before.key));equal(s.getItem('not-ours'),'private-other-app')
ok(memoryHref(event,'2026-09-18','',true).includes('view=map'))
console.log(`PASS ${n} actual guest storage/search/context/share conditions (storage is in-memory test double).`)
