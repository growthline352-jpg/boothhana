import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe,expect,it } from 'vitest'
import { SubcultureBackLink } from './SubcultureBackLink'
const render=(from:unknown)=>renderToStaticMarkup(<MemoryRouter initialEntries={[{pathname:'/subculture/subjects/one',state:{subcultureReturnTo:from}}]}><SubcultureBackLink fallback="/subculture/subjects" label="작품·캐릭터"/></MemoryRouter>)
describe('subculture detail return navigation',()=>{
 it('restores the actual list search, filter and page',()=>{expect(decodeURIComponent(render('/subculture/subjects?q=루나&kind=CHARACTER&page=2'))).toContain('href="/subculture/subjects?q=루나&amp;kind=CHARACTER&amp;page=2"')})
 it('keeps a useful fallback when navigation state is missing or unsafe',()=>{
  for(const from of [undefined,'https://example.com/','//example.com/','/admin',42])expect(render(from)).toContain('href="/subculture/subjects"')
 })
})
