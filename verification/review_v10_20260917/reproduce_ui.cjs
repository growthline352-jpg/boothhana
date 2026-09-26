/* Real source functions with the existing explicit hook harness.
 * No React DOM/effects/HTTP. Screenshots or this test are NOT full app E2E.
 */
const path=require('path'),assert=require('node:assert/strict')
const root=path.resolve(process.argv[2]);const {harness,nodes,toHtml}=require(path.join(root,'verification/v6/source_harness.cjs'))
const output=[]
const status=harness().load('frontend/src/features/visit/eventStatus.ts')
const event={occurrences:[{startDate:'2026-10-10',endDate:'2026-10-10',startTime:null,endTime:null}],warnings:[]}
for(const state of ['CANCELED','POSTPONED','RESCHEDULED']){
 const before=status.eventStatus({...event,operationStatus:{state,note:'Official test notice',sourceUrl:'https://example.com/notice',checkedOn:'2026-09-17'}},'2026-09-17')
 const after=status.eventStatus({...event,operationStatus:{state:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null}},'2026-09-17')
 assert.equal(after.label,'개최 예정');assert.notEqual(before.label,after.label)
 output.push({check:'published-operation-display',input:state,before:before.label,after:after.label,scope:'Actual TS display function; after-input mirrors real Java publisher reproduction'})
}
const test=harness();const map=test.load('frontend/src/features/floorplan/InteractiveFloorPlans.tsx')
const points=[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2},{x:.1,y:.2}]
const plan={id:'plan-test',scope:{title:'[TEST]',hall:'1관',dates:['2026-10-10']},state:'READY',width:1000,height:600,imageUrl:null,sourceUrl:'https://example.com/map',credit:'test',publishedAt:'2026-09-17T00:00:00Z',shapes:[{id:'shape-test',label:'B1',points,status:'MATCHED',links:[{participantId:1,dates:['2026-10-10'],method:'AUTO'}]}]}
const row={id:1,participant:{registrationName:'[TEST] sample booth',locations:[],subjects:[],members:[]},sales:{summary:'[TEST] keyrings'}}
const props={plan,participants:[row],onOpen(){},day:'2026-10-10',focusParticipantId:1}
const tree=test.render(map.MapView,props,true)
const canvasNode=nodes(tree).find(n=>n.type?.name==='PlanCanvas')
assert(canvasNode)
assert(nodes(tree).some(n=>n.type==='button'&&n.props.children==='상품 보기'))
const canvasH=harness();const Canvas=canvasH.load('frontend/src/features/floorplan/PlanCanvas.tsx').PlanCanvas
let canvas=canvasH.render(Canvas,canvasNode.props,true)
nodes(canvas).find(n=>n.type==='button'&&n.props.children==='배치도 전체화면').props.onClick()
canvas=canvasH.render(Canvas,canvasNode.props)
assert.equal(canvas.type,'dialog')
assert(!toHtml(canvas).includes('[TEST] sample booth'))
assert(!nodes(canvas).some(n=>n.type==='button'&&n.props.children==='상품 보기'))
output.push({check:'fullscreen-map-context',dialogRendered:true,participantNameInsideDialog:false,productActionInsideDialog:false,productActionOutsideDialog:true,scope:'Actual component JSX/handlers only; native modal behavior not exercised by this harness'})
console.log(JSON.stringify(output,null,2))
console.log('REPRODUCED: operation status display changes and selected booth actions remain outside fullscreen dialog.')
