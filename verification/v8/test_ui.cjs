/* Actual source functions/handlers with explicit React hook harness. Not application E2E. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness,toHtml,nodes}=require('../v6/source_harness.cjs');let n=0;
function ok(v,s){assert.ok(v,s);n++;console.log('PASS '+s)}
const h=harness();const geom=h.load('frontend/src/features/floorplan/geometry.ts');
ok(geom.normalizeCode(' Ｂ１ ')==='B1','normalize label');ok(geom.normalizeCode('A-03a')!==geom.normalizeCode('A-03b'),'half label distinct');
ok(!geom.safePoints([null,{},{}]),'malformed point filtered');ok(!geom.safePoints(null),'null polygon filtered');ok(!geom.safePoints([{x:NaN,y:0},{x:0,y:1},{x:1,y:0}]),'nonfinite coordinates rejected');
const shape=geom.rectangle('a',{x:.1,y:.1},{x:.3,y:.3});ok(geom.safePoints(shape.points),'manual rectangle bounded');ok(!shape.boundaryConfirmed,'manual shape starts unconfirmed');
ok(geom.dayLinks([{participantId:1,dates:['2026-10-10']}],'2026-10-11').length===0,'date switch drops other-day link');
const C=h.load('frontend/src/features/floorplan/PlanCanvas.tsx').PlanCanvas;let selected=null;
const props={width:1000,height:700,imageUrl:'https://stored.example.com/map.png',shapes:[{...shape,label:'<script>alert(1)</script>'}],selected:null,onSelect:(id,trigger)=>{selected=id}};
let tree=h.render(C,props,true),html=toHtml(tree);ok(html.includes('viewBox="0 0 1000 700"'),'fixed original coordinate viewBox');ok(html.includes('&lt;script&gt;')&&!html.includes('<script>'),'LLM label escaped, never injected HTML');ok(html.includes('role="button"'),'booth SVG keyboard role');ok(html.includes('100%'),'default zoom100');
h.slots[1].current={clientWidth:390,clientHeight:273,scrollLeft:0,scrollTop:0,scrollTo(){},focus(){}};
let plus=nodes(tree).find(x=>x.props?.['aria-label']==='배치도 확대');plus.props.onClick();tree=h.render(C,props);ok(toHtml(tree).includes('150%'),'zoom handler renders150');
let original=nodes(tree).find(x=>x.type==='input'&&x.props.type==='checkbox');original.props.onChange({target:{checked:false}});tree=h.render(C,props);ok(!toHtml(tree).includes('<image'),'background optional only polygons remain');
h.slots[1].current={focus(){}};nodes(tree).find(x=>x.type==='g').props.onKeyDown({key:'Enter',preventDefault(){}});ok(selected==='a','keyboard routes to selected booth handler');
const invalidProps={...props,shapes:[{...shape,points:[{x:-1,y:0},{x:1,y:0},{x:0,y:1}]}]};html=toHtml(h.render(C,invalidProps,true));ok(!html.includes('<polygon'),'out of bounds never rendered');
for(const status of ['SOURCE_CHANGED','ROSTER_CHANGED','SCOPE_CHANGED','PUBLICATION_STALE','UNAVAILABLE']){
 const f=harness({floorplanRemote:{loading:false,error:null,data:{plans:[{id:'version-1',assetId:12,state:status,scope:{title:'map',hall:'1관',dates:['2026-10-10']},sourceUrl:'https://example.com/map'}],managedAssetIds:[12]}}});
 const F=f.load('frontend/src/features/floorplan/InteractiveFloorPlans.tsx').InteractiveFloorPlans;
 const result=f.render(F,{eventId:'1',event:{discoveryLinks:[],occurrences:[{startDate:'2026-10-10',endDate:'2026-10-10'}],sources:[]},assets:[],participants:[],onOpen(){}});
 html=toHtml(result);ok(!html.includes('<polygon')&&!html.includes('<image'),status+' does not show stale geometry');
}
console.log(`PASS ${n} floorplan UI rule/handler conditions. No React DOM.`)
