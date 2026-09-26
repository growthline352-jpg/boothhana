"""Bundle the source-rendered design samples into ONE offline visual preview.
This does not embed production React, mock a successful API save, or collect data.
"""
import json
from pathlib import Path
R=Path(__file__).resolve().parents[2]
VIEWS={'home':'홈 · 서브컬처','exhibitions':'박람회 · 준비 중','festivals':'축제 · 준비 중','booths':'행사 상세 · 참가 부스','map':'행사 상세 · 배치도','drawer':'부스 판매정보','info':'행사 안내','admin':'관리자 · 수집 관리','creator':'크리에이터 홈','products':'상품·재고 목록','product-form':'상품 등록 폼','event-form':'행사 등록 폼','empty':'행사 없음','error':'연결 오류'}
pages={}
for key in VIEWS:
 text=(R/f'preview/v10/{key}.html').read_text()
 # Links between static preview documents route through the wrapper. This glue is
 # preview-only and never imported into the production frontend bundle.
 glue="""<style>.preview-bar{display:none!important}</style><script>
 const goPreview=view=>parent.postMessage({type:'boothhana-design-preview',view},'*');
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){const match=a.getAttribute('href')?.match(/^([a-z-]+)\\.html$/);if(match){e.preventDefault();e.stopImmediatePropagation();goPreview(match[1]);return}}
 const b=e.target.closest('button');if(!b)return;
 if(b.closest('.visit-view-switch')){e.preventDefault();e.stopImmediatePropagation();goPreview(['booths','map','info'][[...b.parentNode.querySelectorAll('button')].indexOf(b)]);return}
 if(b.textContent==='지도에서 보기'||b.textContent==='상품 보기'){e.preventDefault();e.stopImmediatePropagation();goPreview(b.textContent==='지도에서 보기'?'map':'drawer')}
 },true);
 document.addEventListener('submit',e=>{e.preventDefault();alert('디자인 미리보기에서는 검색·저장 요청을 실행하지 않습니다.');});
 </script>"""
 pages[key]=text.replace('</body>',glue+'</body>')
encoded=json.dumps(pages,ensure_ascii=False).replace('</','<\\/')
options=''.join(f'<option value="{k}">{v}</option>' for k,v in VIEWS.items())
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>부스하나 v10 · 디자인 미리보기</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,"Malgun Gothic",sans-serif;background:#e9edf2;color:#1f3042}.preview-controls{padding:12px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#203c55;color:white;min-height:76px}.preview-controls strong{font-size:17px}.preview-controls small{display:block;color:#e3ecf4}select,button{min-height:40px;padding:7px 11px;border-radius:7px;border:1px solid #70899f;font:inherit;background:white;color:#223a51}button[aria-pressed=true]{background:#e9f1f8;border:2px solid #476f90}.preview-size{display:flex;gap:6px;margin-left:auto}iframe{display:block;background:#fff;border:0;width:100%;height:calc(100dvh - 90px);min-height:600px;margin:0 auto;box-shadow:0 0 30px #233d5617}iframe.is-mobile{width:min(390px,100%)}label{display:flex;align-items:center;gap:8px} :focus-visible{outline:3px solid #9fcaff;outline-offset:3px}@media(max-width:650px){.preview-controls{padding:10px 12px}.preview-controls>div:first-child{width:100%}.preview-controls small{font-size:12px}.preview-size{margin-left:0}iframe{height:calc(100dvh - 140px)}}
</style></head><body><header class="preview-controls"><div><strong>부스하나 v10 디자인 미리보기</strong><small>가상 데이터 · 실제 React 앱이 아닌 화면 시안 · 검색·저장·결제는 실행하지 않습니다.</small></div><label>화면 <select id="views">OPTIONS</select></label><div class="preview-size"><button id="desktop" aria-pressed="true">PC</button><button id="mobile" aria-pressed="false">모바일</button></div></header><iframe id="preview" title="선택한 부스하나 화면" sandbox="allow-scripts allow-same-origin allow-modals allow-popups"></iframe><script>
const pages=PAGES, frame=document.getElementById('preview'), select=document.getElementById('views');
function show(view){if(!Object.hasOwn(pages,view))return;select.value=view;frame.srcdoc=pages[view];frame.title='부스하나 '+select.options[select.selectedIndex].text}
select.addEventListener('change',()=>show(select.value));
addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data?.type==='boothhana-design-preview')show(e.data.view)});
for(const id of ['desktop','mobile'])document.getElementById(id).onclick=()=>{frame.classList.toggle('is-mobile',id==='mobile');for(const t of ['desktop','mobile'])document.getElementById(t).setAttribute('aria-pressed',String(t===id))};show('home');
</script></body></html>'''.replace('OPTIONS',options).replace('PAGES',encoded)
(R/'preview/v10/index.html').write_text(html)
print('Offline preview gallery written; 14 static views, embedded example images.')
