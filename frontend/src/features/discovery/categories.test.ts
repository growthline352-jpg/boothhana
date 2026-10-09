import {describe,expect,it} from 'vitest'
import {safeReturnTo} from './categories'
describe('public discovery return context',()=>{
 it('preserves character and creator exploration when returning from an event',()=>{
  for(const path of ['/subculture/subjects/character-1','/subculture/creators/42?q=artist&page=2','/subculture/search?q=blue','/discover?category=subculture&period=all&page=1'])expect(safeReturnTo(path)).toBe(path)
 })
 it('does not allow external or unrelated private return routes',()=>{
  for(const path of ['https://bad.test/subculture/creators/42','//bad.test','/subculture/unknown','/admin','/subculture/subjects/%2f%2fbad.test'])expect(safeReturnTo(path)).not.toBe(path)
 })
})
