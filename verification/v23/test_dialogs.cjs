const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('../v22/support/runtime.cjs');
function setup(overflow='auto'){
 const document={body:{style:{overflow}},querySelector:()=>null};const focus=[];
 const h=runtime({globals:{document}}),open=h.load('frontend/src/features/catalog/dialogLifecycle.ts').openCatalogDialog;
 const element=(name,parent=null)=>({name,isConnected:true,focus(){focus.push(name)},closest(){return parent}});
 function modal(name){const d={name,ownerDocument:document,open:false,showModal(){this.open=true},close(){this.open=false},contains(x){return x?.parent===d},focus(){focus.push(name)}};const heading=element(name+'-heading',d);heading.parent=d;return {d,heading}}
 return {document,focus,element,modal,open};
}
test('a single dialog restores the previous scroll state and trigger',()=>{const x=setup('scroll'),a=x.modal('A'),trigger=x.element('open');const close=x.open(a.d,a.heading,trigger);assert.equal(x.document.body.style.overflow,'hidden');close();assert.equal(x.document.body.style.overflow,'scroll');assert.equal(x.focus.at(-1),'open')});
test('unmounting an underlying dialog must not unlock scrolling below the top QR dialog',()=>{const x=setup(),a=x.modal('A'),b=x.modal('B');const closeA=x.open(a.d,a.heading,x.element('page'));const closeB=x.open(b.d,b.heading,x.element('share',a.d));closeA();assert.equal(x.document.body.style.overflow,'hidden');closeB();assert.equal(x.document.body.style.overflow,'auto')});
test('out-of-order cleanup must not move focus behind the active modal',()=>{const x=setup(),a=x.modal('A'),b=x.modal('B');const closeA=x.open(a.d,a.heading,x.element('page'));const closeB=x.open(b.d,b.heading,x.element('share',a.d));x.focus.length=0;closeA();assert.deepEqual(x.focus,[]);closeB()});
test('last cleanup after a parent disappeared does not focus a button in a closed dialog',()=>{const x=setup(),a=x.modal('A'),b=x.modal('B');const closeA=x.open(a.d,a.heading,x.element('page')),closeB=x.open(b.d,b.heading,x.element('share',a.d));closeA();x.focus.length=0;closeB();assert.equal(x.focus.includes('share'),false)});
test('nested dialog closed normally returns focus inside the still-open parent',()=>{const x=setup(),a=x.modal('A'),b=x.modal('B'),trigger=x.element('share',a.d);trigger.parent=a.d;const ca=x.open(a.d,a.heading,x.element('page')),cb=x.open(b.d,b.heading,trigger);cb();assert.equal(x.focus.at(-1),'share');assert.equal(x.document.body.style.overflow,'hidden');ca();assert.equal(x.document.body.style.overflow,'auto')});
test('repeated cleanup cannot unlock a subsequently opened modal',()=>{const x=setup(),a=x.modal('A'),b=x.modal('B');const ca=x.open(a.d,a.heading,x.element('page'));ca();const cb=x.open(b.d,b.heading,x.element('page'));ca();assert.equal(x.document.body.style.overflow,'hidden');cb()});
test('showModal failure leaves the page scroll state untouched',()=>{const x=setup('scroll'),a=x.modal('A');a.d.showModal=()=>{throw Error('detached')};assert.throws(()=>x.open(a.d,a.heading,null));assert.equal(x.document.body.style.overflow,'scroll')});
