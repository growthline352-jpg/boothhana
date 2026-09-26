const assert=require('node:assert/strict');const {harness,toHtml,nodes}=require('../v6/source_harness.cjs')
let count=0;function ok(v,name){assert.ok(v,name);count++;console.log('PASS '+name)}
const asset=(id,more={})=>({id,eventId:1,participantId:null,productId:null,revision:3,type:'BANNER',rightsState:'APPROVED',storageState:'STORED',storedUrl:'https://example.com/image.png',caption:'test'+id,pageUrl:'https://example.com/page',credit:'credit',...more})
async function main(){
 let sent=[],saved=0;let settle;
 const api={selectBanner:async(...args)=>{sent.push(args);await new Promise(r=>settle=r);return {assetId:args[2]?.id??null,revision:1}}}
 const h=harness({catalogApi:api}),fn=h.load('frontend/src/features/catalog/BannerSelectionPanel.tsx').BannerSelectionPanel
 const props={eventId:1,assets:[asset(10),asset(11),asset(12,{rightsState:'PENDING'}),asset(13,{type:'FLOOR_PLAN'}),asset(14,{participantId:2})],selection:{assetId:null,revision:0},saved:()=>saved++}
 let t=h.render(fn,props,true),html=toHtml(t)
 ok(html.includes('자동 선택'),'default selection described')
 ok(nodes(t).filter(n=>n.type==='option').length===4,'only event level banners plus auto option')
 ok(nodes(t).find(n=>n.type==='option'&&n.props.value==='12').props.disabled,'unapproved option disabled')
 nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'11'}});t=h.render(fn,props)
 ok(!nodes(t).find(n=>n.type==='button'&&String(n.props.children).includes('대표 배너 저장')).props.disabled,'eligible new choice can be saved')
 const button=nodes(t).find(n=>n.type==='button'&&String(n.props.children).includes('대표 배너 저장'))
 button.props.onClick();button.props.onClick()
 ok(sent.length===1,'instant double click sends one PUT')
 ok(sent[0][0]===1&&sent[0][1].revision===0&&sent[0][2].id===11&&sent[0][2].revision===3,'selected asset and both known revisions passed')
 settle();await new Promise(r=>setImmediate(r));ok(saved===1,'success reloads server state')
 const chosenProps={...props,selection:{assetId:11,revision:7},assets:[asset(10),asset(11,{rightsState:'REJECTED'})]}
 const rh=harness({catalogApi:{selectBanner:async(...args)=>{sent.push(args);return {assetId:null,revision:8}}}}),rf=rh.load('frontend/src/features/catalog/BannerSelectionPanel.tsx').BannerSelectionPanel
 t=rh.render(rf,chosenProps,true);html=toHtml(t)
 ok(html.includes('기본 이미지'),'revoked explicit choice explains safe fallback')
 nodes(t).find(n=>n.type==='select').props.onChange({target:{value:''}});t=rh.render(rf,chosenProps)
 nodes(t).find(n=>n.type==='button'&&String(n.props.children).includes('대표 배너 저장')).props.onClick();await new Promise(r=>setImmediate(r))
 ok(sent.at(-1)[2]===null&&sent.at(-1)[1].revision===7,'clear sends null ID not fabricated default banner')
 const err=harness({catalogApi:{selectBanner:async()=>{throw Error('대표 배너 선택이 변경되었습니다.')}}}),ef=err.load('frontend/src/features/catalog/BannerSelectionPanel.tsx').BannerSelectionPanel
 t=err.render(ef,props,true);nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'11'}});t=err.render(ef,props)
 nodes(t).find(n=>n.type==='button'&&String(n.props.children).includes('대표 배너 저장')).props.onClick();await new Promise(r=>setImmediate(r))
 t=err.render(ef,props);ok(toHtml(t).includes('선택이 변경되었습니다'),'server conflict surfaced instead of forced overwrite')
 const canceled=harness({confirm:()=>false,catalogApi:{selectBanner:async()=>{throw Error('must not send')}}}),cf=canceled.load('frontend/src/features/catalog/BannerSelectionPanel.tsx').BannerSelectionPanel
 t=canceled.render(cf,props,true);nodes(t).find(n=>n.type==='select').props.onChange({target:{value:'11'}});t=canceled.render(cf,props)
 nodes(t).find(n=>n.type==='button'&&String(n.props.children).includes('대표 배너 저장')).props.onClick();await new Promise(r=>setImmediate(r))
 ok(!toHtml(canceled.render(cf,props)).includes('must not send'),'cancel confirmation does not change public banner')
 console.log(`PASS: ${count} banner UI handler checks (isolated source harness).`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
