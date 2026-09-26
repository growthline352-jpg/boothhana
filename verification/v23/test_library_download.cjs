const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,nodes,text}=require('../v22/support/runtime.cjs');
const {setup}=require('./support/library.cjs');
const find=(tree,p)=>nodes(tree).find(p);
function panel(){const h=runtime({resolve(name){
 if(name.endsWith('/auth-context'))return {AuthContext:{value:{getSnapshot:()=>({status:'anonymous'})}}};
 if(name.endsWith('/api/client'))return {API_BASE_URL:'https://example.invalid'};
 if(name.endsWith('/LibraryProvider'))return {useLibrary:()=>({owner:'guest',loading:false,error:'',index:[]})};
 if(name.endsWith('/offlineModule'))return {loadOfflineModule:async()=>{throw Error('No automatic downloads in presentation test')}};
 if(name.endsWith('/OfflinePrivacyGuard'))return {offlineOwner:()=> 'guest'};
 }});return h.render(h.load('frontend/src/features/offline/OfflineDownloadPanel.tsx').OfflineDownloadPanel,{eventId:1,day:'2026-10-03'})}
test('consent, selection and save action remain together inside the disclosure',()=>{const tree=panel(),details=find(tree,n=>n.type==='details'&&n.props.className==='offline-download-options');assert.ok(details);assert.equal(nodes(details).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,2);assert.ok(find(details,n=>n.type==='button'&&text(n)==='이 행사 오프라인 저장'))});
test('offline download is disabled until explicit device consent',()=>{const tree=panel();assert.equal(find(tree,n=>n.type==='button'&&text(n)==='이 행사 오프라인 저장').props.disabled,true);assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox')[0].props.checked,false)});
test('saved reader has a direct visible entry outside the closed disclosure',()=>{const tree=panel(),overview=find(tree,n=>n.props.className==='offline-panel-overview');assert.ok(overview);assert.ok(find(overview,n=>n.type==='a'&&n.props.href==='/offline/index.html'));assert.ok(text(tree).includes('계정 메모·주문번호·결제·예약 내역은 저장하지 않습니다.'))});
test('library explicit search submits without waiting for debounce',()=>{const x=setup();let tree=x.render();find(tree,n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'엽서'}});tree=x.render();assert.equal(new URLSearchParams(x.calls[1].deps[2]).get('q'),'');find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});x.render();assert.equal(new URLSearchParams(x.calls[1].deps[2]).get('q'),'엽서')});
test('library clear button removes search only, preserving event and type',()=>{const x=setup({search:'q=엽서&event=7&type=PRODUCT&group=event'}),tree=x.render();const clear=find(tree,n=>n.type==='button'&&text(n)==='검색어 지우기');assert.ok(clear);clear.props.onClick();x.render();assert.equal(x.params.has('q'),false);assert.equal(x.params.get('event'),'7');assert.equal(x.params.get('type'),'PRODUCT');assert.equal(new URLSearchParams(x.calls[1].deps[2]).get('q'),'')});
test('selected event stays legible before its group label is loaded',()=>{const x=setup({search:'event=7'}),tree=x.render();assert.ok(find(tree,n=>n.type==='option'&&String(n.props.value)==='7'&&text(n).includes('선택한 행사')))});
test('guest list does not promise permanent account retention',()=>{const tree=setup({owner:'guest'}).render();assert.ok(text(tree).includes('기기 임시 기록 · 저장일로부터 90일'));assert.equal(text(tree).includes('행사가 끝나도 계정 저장 기록은 유지돼요.'),false)});
