import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanCanvas } from './PlanCanvas'
import type { Shape } from './api'

const booth:Shape={
  id:'A-01',
  label:'A-01',
  recognition:'READABLE',
  boundaryConfirmed:true,
  points:[{x:.1,y:.1},{x:.3,y:.1},{x:.3,y:.3},{x:.1,y:.3}],
}

describe('PlanCanvas source image presentation',()=>{
  it('keeps the verified source image as the public map without a hide toggle',()=>{
    const html=renderToStaticMarkup(<PlanCanvas width={1000} height={700} imageUrl="https://cdn.example/map.png" shapes={[booth]} selected={null} onSelect={()=>{}}/>)

    expect(html).toContain('has-source-image')
    expect(html).toContain('<image href="https://cdn.example/map.png"')
    expect(html).not.toContain('원본 배경')
    expect(html).toContain('공식 원본 배치도를 그대로 표시합니다')
  })

  it('does not apply source-image presentation to generated schematics',()=>{
    const html=renderToStaticMarkup(<PlanCanvas width={1000} height={700} imageUrl={null} shapes={[booth]} selected={null} onSelect={()=>{}}/>)

    expect(html).not.toContain('has-source-image')
    expect(html).not.toContain('<image')
  })

  it('renders facilities as labeled map elements instead of unresolved booths',()=>{
    const facility:Shape={...booth,id:'facility-wc',kind:'RESTROOM',label:'화장실'}
    const html=renderToStaticMarkup(<PlanCanvas width={1000} height={700} imageUrl={null} shapes={[facility]} selected={null} onSelect={()=>{}} linkedIds={[]}/>)

    expect(html).toContain('시설 화장실')
    expect(html).toContain('is-facility kind-restroom')
    expect(html).not.toContain('참가자 연결 미확인')
    expect(html).toContain('◆ 편의시설')
  })
})
