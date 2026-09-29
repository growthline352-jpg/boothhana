import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source=readFileSync(new URL('../../../public/offline/sw.js',import.meta.url),'utf8')
function setup(online:boolean){
 const handlers:Record<string,(e:any)=>void>={}
 const fallback={offline:true},live={ok:true,account:true}
 runInNewContext(source,{URL,AbortController,setTimeout,clearTimeout,
  self:{location:{origin:'https://boothana.kr'},addEventListener:(name:string,fn:any)=>{handlers[name]=fn}},
  caches:{open:async()=>({match:async()=>fallback})},
  fetch:async()=>{if(!online)throw Error('offline');return live},
 })
 function request(path:string,mode='navigate'){
  let result:Promise<unknown>|undefined
  handlers.fetch({request:{method:'GET',url:`https://boothana.kr${path}`,mode},respondWith:(p:Promise<unknown>)=>{result=p}})
  return result
 }
 return {request,fallback,live}
}
describe('library offline fallback',()=>{
 it('uses the public reader for cold offline library navigation',async()=>{
  const s=setup(false);expect(await s.request('/library?offline=1&offlineEvent=1')).toBe(s.fallback)
 })
 it('keeps online library responses network-only',async()=>{
  const s=setup(true);expect(await s.request('/library')).toBe(s.live)
 })
 it('does not intercept authentication, APIs, or other private pages',()=>{
  const s=setup(false)
  for(const path of ['/api/me','/oauth2/authorization/kakao','/admin','/creator','/reservations','/'])expect(s.request(path)).toBeUndefined()
  expect(s.request('/library','cors')).toBeUndefined()
 })
})
