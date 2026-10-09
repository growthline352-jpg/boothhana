import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, onSessionExpired, resetCsrfToken } from './client'
import { clearReadCache } from './readCache'
import { remoteCache } from '../app/RemoteCache'
import { supportApi } from '../features/support/api'

afterEach(() => { resetCsrfToken(); vi.unstubAllGlobals() })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: {'Content-Type':'application/json'} })

describe('application-wide read reuse', () => {
  it('deduplicates simultaneous reads and reuses them on subsequent visits, including no-store', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({id:1})); vi.stubGlobal('fetch',fetch)
    await Promise.all([api('/api/public/items/1'),api('/api/public/items/1',{cache:'no-store'})])
    await api('/api/public/items/1')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('separates query/entity/header scopes while sharing equivalent parameter order', async () => {
    const fetch = vi.fn().mockImplementation(async () => json([])); vi.stubGlobal('fetch',fetch)
    for (const path of ['/api/items?a=1&b=2','/api/items?b=2&a=1','/api/items?a=2','/api/items/2']) await api(path)
    await api('/api/items/2',{headers:{'X-View':'other'}})
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('starts a fresh application cache after a page/session reset', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({id:1})); vi.stubGlobal('fetch',fetch)
    await api('/api/items'); clearReadCache(); await api('/api/items')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('supports explicit refresh without discarding unrelated reads', async () => {
    let version=0
    const fetch = vi.fn().mockImplementation(async () => json({version:++version})); vi.stubGlobal('fetch',fetch)
    await api('/api/items'); await api('/api/other')
    expect(await api('/api/items',{fresh:true})).toEqual({version:3})
    expect(await api('/api/other')).toEqual({version:2})
    expect(await api('/api/items')).toEqual({version:3})
  })
  it('does not cache identity checks or uncertain write receipts', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({found:false})); vi.stubGlobal('fetch',fetch)
    for (const path of ['/api/me','/api/me/reservation-requests/one','/api/me/support/requests/one']) { await api(path); await api(path) }
    expect(fetch).toHaveBeenCalledTimes(6)
  })
  it('failed reads can be retried', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(json({ok:true})); vi.stubGlobal('fetch',fetch)
    await expect(api('/api/items')).rejects.toThrow('offline')
    await expect(api('/api/items')).resolves.toEqual({ok:true})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('cancelling one caller leaves another caller’s shared request running', async () => {
    let finish!: (response:Response) => void
    const fetch = vi.fn(() => new Promise<Response>(resolve=>{finish=resolve})); vi.stubGlobal('fetch',fetch)
    const controller=new AbortController(), first=api('/api/items',{signal:controller.signal}), second=api('/api/items')
    const cancelled=expect(first).rejects.toMatchObject({name:'AbortError'})
    await Promise.resolve(); controller.abort(); finish(json({ok:true}))
    await cancelled; await expect(second).resolves.toEqual({ok:true})
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects a response from an old account and cannot repopulate the new cache', async () => {
    let finish!: (response:Response) => void
    const fetch = vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve})).mockResolvedValueOnce(json({user:'new'})); vi.stubGlobal('fetch',fetch)
    const old=api('/api/me/items'), rejected=expect(old).rejects.toMatchObject({code:'SESSION_CHANGED'})
    await Promise.resolve(); resetCsrfToken()
    await expect(api('/api/me/items')).resolves.toEqual({user:'new'})
    finish(json({user:'old'})); await rejected
    await expect(api('/api/me/items')).resolves.toEqual({user:'new'})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('a successful mutation refreshes mounted screens and invalidates visited queries', async () => {
    let version=0
    const fetch=vi.fn().mockImplementation(async (url:string,init:RequestInit)=>url.endsWith('/csrf')?json({token:'csrf'}):json({version: init.method==='PUT'?++version:version})); vi.stubGlobal('fetch',fetch)
    const entry=remoteCache.get<{version:number}>('items');entry.bind(()=>api('/api/items'))
    const leave=entry.subscribe(()=>{});await entry.load()
    await api('/api/items',{method:'PUT',body:'{}'}); await entry.load()
    expect(entry.read()).toEqual({data:{version:1},loading:false,error:null})
    await expect(api('/api/items')).resolves.toEqual({version:1});leave()
    expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/api/items')&&init.method==='GET')).toHaveLength(2)
  })
  it('read-only POST resolution is reused without triggering screen invalidation', async () => {
    const fetch=vi.fn().mockImplementation(async (url:string)=>url.endsWith('/csrf')?json({token:'csrf'}):json([]));vi.stubGlobal('fetch',fetch)
    const entry=remoteCache.get('stable'),load=vi.fn().mockResolvedValue('ready');entry.bind(load);const leave=entry.subscribe(()=>{});await entry.load()
    const init={method:'POST',readOnly:true,body:'{"targets":[1]}'}
    await api('/api/public/library/resolve',init);await api('/api/public/library/resolve',init)
    expect(fetch).toHaveBeenCalledTimes(2);expect(load).toHaveBeenCalledTimes(1);leave()
  })
  it('a support target lookup finishes once instead of invalidating and reloading itself', async () => {
    const fetch=vi.fn().mockImplementation(async(url:string)=>url.endsWith('/csrf')?json({token:'csrf'}):json({label:'행사',visible:true}));vi.stubGlobal('fetch',fetch)
    const entry=remoteCache.get('support-target');entry.bind(()=>supportApi.target({namespace:'CATALOG',type:'EVENT',eventId:1,id:null}))
    const leave=entry.subscribe(()=>{});await entry.load()
    expect(entry.read()).toMatchObject({loading:false,error:null,data:{label:'행사'}})
    await entry.load();expect(fetch).toHaveBeenCalledTimes(2);leave()
  })
  it('notifies authentication once on session expiry instead of repeatedly invalidating', async () => {
    const fetch=vi.fn().mockImplementation(async()=>json({status:401,code:'UNAUTHENTICATED',message:'로그인 필요'},401));vi.stubGlobal('fetch',fetch)
    const expired=vi.fn(),unsubscribe=onSessionExpired(expired)
    try { await expect(api('/api/me/items')).rejects.toMatchObject({status:401});await expect(api('/api/me/items')).rejects.toMatchObject({status:401});expect(expired).toHaveBeenCalledTimes(1) }
    finally { unsubscribe() }
  })
  it('allows an identity check already in flight to establish anonymous mode after another 401', async () => {
    let finish!: (response:Response) => void
    const unauthorized=()=>json({status:401,code:'UNAUTHENTICATED',message:'로그인 필요'},401)
    const fetch=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve})).mockImplementation(async()=>unauthorized());vi.stubGlobal('fetch',fetch)
    const checking=api('/api/me'),anonymous=expect(checking).rejects.toMatchObject({status:401})
    await expect(api('/api/me/items')).rejects.toMatchObject({status:401})
    finish(unauthorized());await anonymous
  })
})
