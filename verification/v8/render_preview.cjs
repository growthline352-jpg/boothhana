/* Source SVG + native drawer lifecycle; preview glue is not a React app. Fictional fixture only. */
const fs=require('node:fs'),path=require('node:path');
const {harness,toHtml,root}=require('../v6/source_harness.cjs'),ts=require('../v4/load_ts.cjs')();
const img='data:image/png;base64,'+fs.readFileSync(path.join(root,'collector/examples/floorplan-v8/map.png')).toString('base64');
const result=JSON.parse(fs.readFileSync(path.join(root,'collector/examples/floorplan-v8/layout.json')));const h=harness();
const canvas=toHtml(h.render(h.load('frontend/src/features/floorplan/PlanCanvas.tsx').PlanCanvas,{width:1000,height:700,imageUrl:img,shapes:result.shapes.map((s,i)=>({...s,id:'b'+i})),selected:null,onSelect(){}}));
const css=['frontend/src/styles/tokens.css','frontend/src/styles/global.css','frontend/src/features/catalog/catalog.css','frontend/src/features/floorplan/floorplan.css'].map(x=>fs.readFileSync(path.join(root,x),'utf8')).join('\n');
const lifecycle=ts.transpileModule(fs.readFileSync(path.join(root,'frontend/src/features/catalog/dialogLifecycle.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const script=`const exports={};${lifecycle}
let cleanup=null;const viewport=document.querySelector('.floorplan-viewport'),svg=viewport.querySelector('svg');let zoom=1;
const buttons=[...document.querySelectorAll('.floorplan-toolbar button')];const drawZoom=()=>{svg.style.width=(zoom*100)+'%';document.querySelector('output').textContent=Math.round(zoom*100)+'%';buttons[0].disabled=zoom<=1;buttons[1].disabled=zoom>=6};
buttons[0].onclick=()=>{zoom=Math.max(1,zoom-.5);drawZoom()};buttons[1].onclick=()=>{zoom=Math.min(6,zoom+.5);drawZoom()};buttons[2].onclick=()=>{zoom=1;drawZoom();viewport.scrollTo(0,0)};
document.querySelector('.floorplan-toolbar input').onchange=e=>svg.querySelector('image').style.display=e.target.checked?'':'none';
const show=(shape)=>{const d=document.querySelector('dialog');if(d.open)return;d.querySelector('h2').textContent='[TEST] '+shape.textContent+' 부스 · 판매정보';cleanup=exports.openCatalogDialog(d,d.querySelector('h2'),viewport);};
const close=()=>{if(cleanup)cleanup();document.querySelector('dialog').close();cleanup=null};document.querySelector('dialog button').onclick=close;document.querySelector('dialog').addEventListener('cancel',e=>{e.preventDefault();close()});
svg.querySelectorAll('g[role=button]').forEach(s=>{s.onclick=()=>show(s);s.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(s)}}});
`;
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>부스하나 v8 배치도 데모</title><style>${css}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}.demo-note{padding:14px;background:#fff1d5;border-radius:10px}dialog{max-width:560px;width:90vw;border:0;border-radius:14px;padding:28px}dialog::backdrop{background:#0008}</style><body><main><p class="demo-note">[TEST] 가상 도면·가상 부스입니다. 실제 CLI 추출 결과가 아닙니다. 화면 확인용 정적 데모로, React 앱이나 DB에 연결하지 않습니다.</p><h1>행사 부스 배치도</h1><p>일요일 전체 배치 · 행사 14일 전 보완 확인 · 부스 선택으로 판매정보 열기</p>${canvas}<p>B1 / B2 / A-03a / A-03b를 클릭하거나 키보드로 선택하세요.</p></main><dialog aria-label="가상 부스 판매정보"><h2 tabindex="-1">부스</h2><p>가상 문구·키링 소개. 실제 참가자 또는 판매 상품이 아닙니다.</p><button class="btn primary">닫기</button></dialog><script>${script}</script></body></html>`;
const dest=process.argv[2]||path.join(root,'preview/floorplan-v8.html');fs.writeFileSync(dest,html);console.log('Source SVG demo saved; preview interaction glue differs from React hooks.');
