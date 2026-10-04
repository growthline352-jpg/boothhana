const {runtime,jsx,component,nodes,text}=require('../../v22/support/runtime.cjs');
function setup({search='',owner='member:1'}={}){
 let params=new URLSearchParams(search),calls=[];const changes=[];
 const library={owner,index:[],guest:[],version:0,publicVersion:0,loading:false,error:'',refreshPublic(){},resolvePublic:async()=>[]};
 const h=runtime({globals:{window:{location:{host:'subculture.boothana.kr'},setInterval,clearInterval,confirm:()=>false},document:{visibilityState:'visible'}},resolve(name,file){
  if(name==='react-router')return {Link:p=>jsx('a',{...p,href:p.to}),useSearchParams:()=>[params,(next)=>{params=new URLSearchParams(next);changes.push(params.toString())}]};
  if(name.endsWith('/useAuth'))return {useAuth:()=>({user:owner==='guest'?null:{id:1,displayName:'가상 사용자'},refresh:async()=>{},loginUrl:'#preview-login'})};
  if(name.endsWith('/useRemote'))return {useRemote:(fn,deps)=>{calls.push({fn,deps});return {data:calls.length===1?[]:calls.length===2?{items:[],total:0,groups:[]}:null,loading:false,error:null,reload:async()=>{}}}};
  if(name==='./LibraryProvider')return {useLibrary:()=>library};
  if(name==='./api'&&file.includes('/library/'))return {libraryApi:{}};
  if(name.endsWith('/UnsavedChanges'))return {useDirty:()=>()=>{}};
  if(name.endsWith('/Shared'))return {LocationText:component('LocationText'),SafeLink:component('SafeLink'),StoredImage:component('StoredImage'),scopes:{},saleStates:{}};
  if(name==='./ShareQr')return {ShareQr:component('ShareQr')};
 }});
 const page=h.load('frontend/src/features/library/LibraryPage.tsx').LibraryPage;
 return {h,render(){calls=[];return h.render(page,{})},get params(){return params},get calls(){return calls},changes};
}
module.exports={setup,nodes,text};
