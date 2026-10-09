import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const transport=vi.hoisted(()=>({list:vi.fn(),save:vi.fn(),remove:vi.fn()}))
vi.mock('./personalApi',()=>({personalApi:transport}))
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useMemo:(factory:()=>unknown)=>factory(),useEffect:(effect:()=>void)=>effect(),useSyncExternalStore:(_subscribe:unknown,read:()=>unknown)=>read(),
}))
import {usePersonalPlans} from './usePersonalPlans'
import {remoteCache} from '../../app/RemoteCache'
beforeEach(()=>{remoteCache.clear();transport.list.mockReset().mockResolvedValue([]);vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}})})
afterEach(()=>{remoteCache.clear();vi.unstubAllGlobals()})
describe('personal plan session reuse',()=>{
 it('keeps the loaded store across screen visits without a second list request',async()=>{
  const first=usePersonalPlans('member:1');await vi.waitFor(()=>expect(first.store.read().status).toBe('ready'))
  const returned=usePersonalPlans('member:1')
  expect(returned.store).toBe(first.store);expect(returned.ready).toBe(true)
  expect(transport.list).toHaveBeenCalledTimes(1)
 })
 it('discards the previous account store and replaces it after a session boundary',async()=>{
  const first=usePersonalPlans('member:1');await first.store.refresh()
  remoteCache.clear();const next=usePersonalPlans('member:2')
  expect(first.store.read().owner).toBe('');expect(first.store.read().records).toEqual([])
  expect(next.store).not.toBe(first.store);expect(next.store.read().owner).toBe('member:2')
 })
})
