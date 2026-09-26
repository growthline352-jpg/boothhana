// Execute the real PlanCanvas pointer/zoom handlers with test viewport and pointer capture.
const assert=require('node:assert/strict');const {harness,nodes}=require('../v6/source_harness.cjs')
let count=0;const ok=(v,m)=>{assert.ok(v,m);count++;console.log('PASS '+m)}
const h=harness(),C=h.load('frontend/src/features/floorplan/PlanCanvas.tsx').PlanCanvas
let picked=[];const props={width:1000,height:500,imageUrl:null,shapes:[{id:'s',label:'B1',recognition:'READABLE',boundaryConfirmed:true,points:[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2},{x:.1,y:.2}]}],selected:null,onSelect:id=>picked.push(id),linkedIds:[]}
let tree=h.render(C,props,true)
const box={clientWidth:400,clientHeight:200,scrollLeft:0,scrollTop:0,getBoundingClientRect(){return{left:0,top:0}},scrollTo(arg,top){if(typeof arg==='number'){this.scrollLeft=arg;this.scrollTop=top}else{this.scrollLeft=arg.left;this.scrollTop=arg.top}},focus(){}}
const captures=new Set(),svgNode={setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)}
h.slots[0].current=svgNode;h.slots[1].current=box
const ev=(id,x,y,shape=true)=>({pointerId:id,clientX:x,clientY:y,button:0,preventDefault(){},currentTarget:svgNode,target:{closest(selector){return shape&&selector==='[data-shape]'?{getAttribute:()=> 's'}:null}}})
const svg=()=>nodes(tree).find(n=>n.type==='svg')
svg().props.onPointerDown(ev(1,100,80));svg().props.onPointerUp(ev(1,100,80));ok(picked.length===1&&picked[0]==='s','tap selects exact booth without enlarged overlapping hitboxes')
svg().props.onPointerDown(ev(1,100,80));svg().props.onPointerMove(ev(1,150,110));svg().props.onPointerUp(ev(1,150,110));ok(picked.length===1,'drag never triggers accidental booth selection');ok(box.scrollLeft===-50&&box.scrollTop===-30,'pointer drag updates viewport scrolling')
box.scrollLeft=0;box.scrollTop=0
svg().props.onPointerDown(ev(1,100,100,false));svg().props.onPointerDown(ev(2,200,100,false));svg().props.onPointerMove(ev(2,300,100,false));tree=h.render(C,props)
ok(nodes(tree).find(n=>n.type==='output').props.children[0]===200,'two-finger distance scales actual zoom state to 200%')
svg().props.onPointerUp(ev(2,300,100,false));svg().props.onPointerUp(ev(1,100,100,false));ok(picked.length===1,'pinch end does not open unrelated booth')
svg().props.onPointerDown(ev(1,100,80));svg().props.onPointerCancel(ev(1,100,80));ok(picked.length===1,'pointer cancellation never selects')
nodes(tree).find(n=>n.type==='button'&&n.props.children==='전체 보기').props.onClick();tree=h.render(C,props)
ok(nodes(tree).find(n=>n.type==='output').props.children[0]===100&&box.scrollLeft===0,'whole-view button resets scale and position')
const g=nodes(tree).find(n=>n.type==='g');g.props.onKeyDown({key:'Enter',preventDefault(){}});ok(picked.length===2,'keyboard still reaches booth in same renderer')
ok(g.props['aria-label'].includes('연결 미확인'),'unmapped geometry has accessible warning not false booth label')
nodes(tree).find(n=>n.type==='button'&&n.props.children==='배치도 전체화면').props.onClick();tree=h.render(C,props)
ok(tree.type==='dialog'&&tree.props['aria-label']==='배치도 전체화면','fullscreen is a named native modal')
let prevented=false;tree.props.onCancel({preventDefault(){prevented=true}});tree=h.render(C,props)
ok(prevented&&tree.type!=='dialog','Escape handler restores inline canvas')
console.log(`PASS ${count} actual pointer-handler checks using mock DOM geometry. Not physical device/React E2E.`)
