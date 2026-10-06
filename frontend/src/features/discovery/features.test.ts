import {afterEach,describe,expect,it,vi} from 'vitest'
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
describe('popup public rollout',()=>{
 it('opens the screen when no deployment override is configured',async()=>{
  vi.stubEnv('VITE_POPUP_EXPLORE_ENABLED',undefined)
  expect((await import('./features')).discoveryFeatures.popupExplore).toBe(true)
 })
 it('keeps an explicit deployment kill switch available',async()=>{
  vi.stubEnv('VITE_POPUP_EXPLORE_ENABLED','false')
  expect((await import('./features')).discoveryFeatures.popupExplore).toBe(false)
 })
 it('activates popup exploration without activating unrelated discovery features',async()=>{
  vi.stubEnv('VITE_POPUP_EXPLORE_ENABLED','true');vi.stubEnv('VITE_EVENT_COMPARE_ENABLED','false');vi.stubEnv('VITE_VISIT_PREPARATION_ENABLED','false')
  expect((await import('./features')).discoveryFeatures).toEqual({popupExplore:true,comparison:false,visitPreparation:false})
 })
})
