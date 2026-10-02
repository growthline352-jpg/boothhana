const test=require('node:test'),assert=require('node:assert/strict'),{loadSource}=require('../v21/load_source.cjs')
function setup(){const calls=[];const mod=loadSource('frontend/src/api/index.ts',{'./client':{api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return {}},resetCsrfToken(){}},'./image-upload':{createImageUploadTask(){throw Error('unused')}}});return {...mod,calls}}
const keys=x=>Object.keys(x).sort()
test('event write removes read-only fields and preserves image removal intent',async()=>{
 const {adminApi,calls}=setup();const view={id:4,name:'Event',startAt:'2026-10-01T00:00:00Z',endAt:'2026-10-01T08:00:00Z',venue:'Seoul',status:'DRAFT',imageUrl:'https://image.example.com',boothCount:3,applicationStatus:'APPROVED',removeImage:true,imageKey:'key'}
 await adminApi.updateEvent(4,view);assert.deepEqual(keys(calls[0].body),['name','startAt','endAt','venue','status','removeImage','imageKey'].sort());assert.equal(calls[0].body.removeImage,true);assert.equal(view.boothCount,3)
})
test('booth write does not submit public ownership labels or counters',async()=>{
 const {creatorApi,calls}=setup();await creatorApi.updateBooth(3,{id:3,name:'Booth',intro:'Info',imageKey:'key',snsUrl:'https://example.com',creatorName:'private-view-label',productCount:4,eventId:8,isPublic:true})
 assert.deepEqual(keys(calls[0].body),['name','intro','imageKey','snsUrl'].sort())
})
test('product update keeps optimistic-lock revisions but omits response IDs and image URL',async()=>{
 const {creatorApi,calls}=setup();await creatorApi.updateProduct(3,{id:3,eventBoothId:9,name:'Product',description:'d',imageKey:'k',imageUrl:'https://example.com',imagePreviewFile:new Blob(['preview'],{type:'image/png'}),price:100,stockMode:'FINITE',stockQuantity:5,soldOut:false,isPublic:true,reservationEnabled:true,version:8,productVersion:4})
 assert.deepEqual(keys(calls[0].body),['name','description','imageKey','price','stockMode','stockQuantity','soldOut','isPublic','reservationEnabled','version','productVersion'].sort());assert.equal(calls[0].body.version,8);assert.equal(calls[0].body.productVersion,4)
})
test('event booth write contains only the three input fields',async()=>{
 const {creatorApi,calls}=setup();await creatorApi.updateEventBooth(1,{boothNumber:'A1',intro:'Info',isPublic:false,status:'APPROVED',creatorName:'label'});assert.deepEqual(keys(calls[0].body),['boothNumber','intro','isPublic'].sort())
})
test('notice write strips creation metadata without changing pinned false',async()=>{
 const {creatorApi,calls}=setup();await creatorApi.updateNotice(1,{id:1,eventBoothId:2,title:'N',body:'B',pinned:false,createdAt:'now'});assert.deepEqual(calls[0].body,{title:'N',body:'B',pinned:false})
})
test('reservation and POS replay retain requestId but send only input line fields',async()=>{
 const {reservationApi,creatorApi,calls}=setup();const lines=[{id:99,eventProductId:1,quantity:2,productName:'view label',unitPrice:100}],id='d9b89617-cf9a-4be5-87e6-32eb6eafaf0f'
 await reservationApi.create(3,lines,id);await creatorApi.createPosSale(3,'CASH',lines,id)
 for(const c of calls){assert.deepEqual(c.body.items,[{eventProductId:1,quantity:2}]);assert.equal(c.body.requestId,id)};assert.equal(lines[0].unitPrice,100)
})
