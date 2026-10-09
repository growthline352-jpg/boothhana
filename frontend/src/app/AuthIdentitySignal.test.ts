import {describe,expect,it,vi} from 'vitest'
import {AuthIdentitySignal,identityFingerprint,listenIdentitySignal} from './AuthIdentitySignal'
describe('account hints without focus requests',()=>{
 it('repeated tab returns do not verify an unchanged account',()=>{
  const changed=vi.fn(),write=vi.fn(),signal=new AuthIdentitySignal(()=>'one',write,changed)
  signal.observe('one');signal.check();signal.check();signal.check()
  expect(changed).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled()
 })
 it('checks a changed account once, including returning to an earlier identity',()=>{
  let value='one';const changed=vi.fn(),signal=new AuthIdentitySignal(()=>value,next=>{value=next},changed)
  value='two';signal.check();signal.check();expect(changed).toHaveBeenCalledTimes(1)
  signal.observe('two');value='one';signal.check();expect(changed).toHaveBeenCalledTimes(2)
 })
 it('only publishes verified identities, then ignores its own notification',()=>{
  let value='one';const changed=vi.fn(),write=vi.fn((next:string)=>{value=next}),signal=new AuthIdentitySignal(()=>value,write,changed)
  signal.observe('two');signal.check();expect(write).toHaveBeenCalledWith('two');expect(changed).not.toHaveBeenCalled()
 })
 it('uses an opaque fingerprint that contains no account or permission text',async()=>{
  const one=await identityFingerprint('member:1:ADMIN'),same=await identityFingerprint('member:1:ADMIN'),other=await identityFingerprint('member:2:ADMIN')
  expect(one).toMatch(/^[a-f0-9]{64}$/);expect(one).toBe(same);expect(one).not.toBe(other)
 })
 it('removes focus and storage listeners when the provider leaves',()=>{
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget();vi.stubGlobal('window',fakeWindow);vi.stubGlobal('document',fakeDocument)
  try{const check=vi.fn(),leave=listenIdentitySignal(check);fakeWindow.dispatchEvent(new Event('focus'));expect(check).toHaveBeenCalledTimes(1);leave();fakeWindow.dispatchEvent(new Event('focus'));expect(check).toHaveBeenCalledTimes(1)}
  finally{vi.unstubAllGlobals()}
 })
})
