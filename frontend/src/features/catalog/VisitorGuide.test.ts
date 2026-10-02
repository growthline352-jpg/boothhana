import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {describe,it,expect} from 'vitest'
import {VisitorGuide} from './VisitorGuide'
import type {PublicEvent} from './api'
import type {ProgramInfo} from '../collection/api'

function program(name:string,day:string|null):ProgramInfo {
  return {id:name,name,day,type:'STAGE',subjects:[],startTime:null,endTime:null,venue:null,ticketRequirement:'UNKNOWN',ticketId:null,status:'PUBLISHED',note:null,sourceUrl:'https://example.com/current-edition',checkedOn:'2026-10-02'}
}
describe('visitor program attendance dates',()=>{
  it('keeps undated performances out of the selected day schedule',()=>{
    const value={id:173,participants:[],event:{discoveryLinks:[],visitorGuide:{tickets:[],programs:[program('SaturdayConcert','2026-10-10'),program('SundayConcert','2026-10-11'),program('DateUnconfirmed',null)],faq:[],sales:[],coverage:[]}}} as unknown as PublicEvent
    for(const [day,shown,hidden] of [['2026-10-10','SaturdayConcert','SundayConcert'],['2026-10-11','SundayConcert','SaturdayConcert']]){
      const html=renderToStaticMarkup(createElement(VisitorGuide,{value,day}))
      const undated=html.match(/<section aria-label="요일 미확인 프로그램">([\s\S]*?)<\/section>/)?.[1]
      expect(undated).toContain('DateUnconfirmed')
      expect(undated).not.toContain(shown)
      expect(html).toContain(shown)
      expect(html).not.toContain(hidden)
      expect(html.indexOf(shown)).toBeLessThan(html.indexOf('요일 미확인 프로그램'))
    }
  })
})
