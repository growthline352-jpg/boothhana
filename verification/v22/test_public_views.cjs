const {test}=require('node:test'),assert=require('node:assert/strict');
const {runtime,nodes,text,component}=require('./support/runtime.cjs');
const target={type:'PARTICIPANT',eventId:10,id:20,participantId:20};
const memory={title:'공개 부스',eventName:'가상 행사',participantName:'공개 부스',summary:'WITHDRAWN_SALE_TEXT',tags:['WITHDRAWN_SALE_TAG']};
const current={memory:{...memory,summary:'',tags:['공개 작품']},operationState:'SCHEDULED',notice:'',venue:'경기 행사장',occurrences:[],locations:[],evidenceScope:'',price:null,saleState:'',links:[],publishedAt:'2026-09-18T00:00:00Z',warnings:[]};
const entry={id:'11111111-1111-4111-8111-111111111111',target,revision:2,savedAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',day:'2026-10-03',hall:'내 전시관 메모',note:'PRIVATE_NOTE',visitedDays:['2026-09-01'],available:true,saved:memory,current:{...current,evidenceScope:'EVENT_SALE_CONFIRMED',memory},image:null,changed:true,lastOpenedAt:null};
function setup(initial={}){let live={target,available:true,current,image:null},status={loading:false,error:null},remoteCall=0;const stored={...entry,...initial};
 const lib={owner:'member:1',index:[],guest:[],version:0,publicVersion:1,loading:false,error:'',refreshPublic(){},resolvePublic:async()=>[live]};
 const h=runtime({globals:{window:{setInterval,clearInterval,confirm:()=>true},document:{visibilityState:'visible'}},resolve:(name,file)=>{
  if(name==='react-router')return {Link:component('Link'),useSearchParams:()=>[new URLSearchParams({item:stored.id}),()=>{}]};
  if(name.endsWith('/useAuth'))return {useAuth:()=>({user:{id:1,displayName:'테스트'},refresh:async()=>{}})};
  if(name.endsWith('/useRemote'))return {useRemote:()=>{const call=++remoteCall;return {loading:false,error:null,reload:async()=>{},data:call===1?[]:call===2?{items:[],total:0,groups:[]}:call===3?stored:live,...(call===4?status:{})}}};
  if(name==='./LibraryProvider')return {useLibrary:()=>lib};
  if(name==='./api'&&file.includes('/library/'))return {libraryApi:{}};
  if(name.endsWith('/UnsavedChanges'))return {useDirty:()=>()=>{}};
  if(name.endsWith('/dialogLifecycle'))return {openCatalogDialog:()=>()=>{}};
  if(name.endsWith('/Shared'))return {LocationText:component('LocationText'),SafeLink:component('SafeLink'),StoredImage:component('StoredImage'),scopes:{},saleStates:{}};
  if(name==='./ShareQr')return {ShareQr:component('ShareQr')};
 }});
 const mod=h.load('frontend/src/features/library/LibraryPage.tsx');
 function render(){remoteCall=0;return h.render(mod.LibraryPage,{})}
 function editor(){return nodes(render()).find(n=>n.type===mod.MemoryEditor)}
 return {h,mod,render,editor,stored,setLive(v){live=v},setStatus(v){status=v}};
}
test('open editor removes historical sales summary on current sales withdrawal',()=>{const x=setup(),e=x.editor().props.entry;assert.equal(e.available,true);assert.equal(e.saved.summary,'');assert.equal(e.note,'PRIVATE_NOTE');assert.equal(e.day,entry.day);assert.equal(e.hall,entry.hall);assert.equal(x.stored.saved.summary,'WITHDRAWN_SALE_TEXT')});
test('open editor removes old sales tags without deleting public booth identity',()=>{const e=setup().editor().props.entry;assert.equal(e.saved.tags.includes('WITHDRAWN_SALE_TAG'),false);assert.equal(e.saved.tags.includes('공개 작품'),true);assert.equal(e.saved.title,memory.title)});
test('public loading/error hides old description and image, but keeps private note',()=>{for(const status of [{loading:true,error:null},{loading:false,error:Error('503')}]){const x=setup();x.setLive({target,available:true,current:entry.current,image:{url:'https://image.test/old'}});x.setStatus(status);const e=x.editor().props.entry;assert.equal(e.available,false);assert.equal(e.current,null);assert.equal(e.saved,null);assert.equal(e.image,null);assert.equal(e.note,'PRIVATE_NOTE')}});
test('wrong target response cannot be merged into this private entry',()=>{const x=setup();x.setLive({target:{...target,id:21,participantId:21},available:true,current,image:null});assert.equal(x.editor().props.entry.available,false)});
test('public refresh does not change editor key or private entry revision',()=>{const x=setup(),before=x.editor();x.setLive({target,available:true,current:{...current,memory:{...current.memory,title:'변경된 공개 이름'}},image:null});const after=x.editor();assert.equal(after.key,before.key);assert.equal(after.props.entry.revision,entry.revision);assert.deepEqual(after.props.entry.visitedDays,entry.visitedDays)});
test('still-public sales history remains available',()=>{const x=setup();x.setLive({target,available:true,current:entry.current,image:null});const e=x.editor().props.entry;assert.equal(e.saved.summary,memory.summary);assert.equal(e.available,true)});
test('complete withdrawal hides all public projections without deleting personal notes',()=>{const x=setup();x.setLive({target,available:false,current:null,image:null});const e=x.editor().props.entry;assert.equal(e.available,false);assert.equal(e.saved,null);assert.equal(e.current,null);assert.equal(e.note,'PRIVATE_NOTE')});
test('later public refresh correctly marks newly changed public memory',()=>{const x=setup({changed:false});x.setLive({target,available:true,current:{...entry.current,memory:{...memory,title:'새 부스 이름'}},image:null});assert.equal(x.editor().props.entry.changed,true)});
const {usableAddress}=runtime().load('frontend/src/features/visit/visit.ts');
test('Seoul and Gyeonggi explicit addresses permit map/copy helpers',()=>{for(const a of ['서울특별시 강남구 영동대로 513','서울 강남구 영동대로 513','경기도 고양시 일산서구 킨텍스로 217-60','경기 수원시 영통구 광교중앙로 140',' 경기도 고양시 킨텍스로 217-60 '])assert.equal(usableAddress(a),true,a)});
test('Incheon, out-of-scope and private/unknown venues remain blocked',()=>{for(const a of [null,undefined,'','인천광역시 연수구 센트럴로 123','부산광역시 해운대구 센텀중앙로 55','경기도 모처 123','경기도 고양시 비공개 123','서울 미정 12','서울 미확인 123','킨텍스','경기도 고양시 일산서구','서울특별시X로 123','경기도X 123'])assert.equal(usableAddress(a),false,String(a))});
