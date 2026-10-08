import { describe,it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const source=readFileSync(new URL('../../../public/push-sw.js',import.meta.url),'utf8')
describe('interest push worker',()=>{
 it('uses generic lock-screen text and a fixed same-origin destination',async()=>{
  const handlers:Record<string,(event:any)=>void>={},shown:any[]=[]
  runInNewContext(source,{URL,self:{location:{origin:'https://example.com'},addEventListener:(type:string,handler:any)=>handlers[type]=handler,registration:{showNotification:async(...args:any[])=>shown.push(args)}}})
  let pending:Promise<unknown>|undefined
  handlers.push({data:{json:()=>({title:'Private character',body:'Private author',url:'https://evil.test',tag:'one'})},waitUntil:(value:Promise<unknown>)=>pending=value});await pending
  expect(JSON.stringify(shown)).not.toContain('Private');expect(shown[0][1].data.url).toBe('/account/notifications');expect(shown[0][1].tag).toBe('one')
  expect(handlers.fetch).toBeUndefined()
 })
 it('navigates to the inbox even when the payload carries a different URL',async()=>{
  const handlers:Record<string,(event:any)=>void>={},opened:string[]=[]
  runInNewContext(source,{URL,self:{location:{origin:'https://example.com'},addEventListener:(type:string,handler:any)=>handlers[type]=handler,clients:{matchAll:async()=>[],openWindow:async(url:string)=>opened.push(url)}}})
  let pending:Promise<unknown>|undefined
  handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.test'}},waitUntil:(value:Promise<unknown>)=>pending=value});await pending
  expect(opened).toEqual(['https://example.com/account/notifications'])
 })
})
