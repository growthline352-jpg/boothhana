import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe,expect,it,vi } from 'vitest'
import { TasteSubjectCard,TasteCreatorCard,TasteImageCredit } from './SubcultureUI'
import { TasteProductCard } from './CreatorProductPages'
import { ProductCard } from '../catalog/Shared'
import { newInterest,type CreatorProduct,type Subject } from './api'

vi.mock('./FollowButton',()=>({FollowButton:()=>null}))
const subject:Subject={id:'character',kind:'CHARACTER',name:'관심 캐릭터',workId:'work',workName:'게임',medium:'게임',sourceUrl:'https://example.com/characters',revision:1,imageUrl:'https://media.example.com/verified/character.png',imageSourceUrl:'https://example.com/characters',imageCredit:'공식 캐릭터 소개'}
const product:CreatorProduct={id:'product',creatorId:1,creator:{id:1,name:'작가',kind:'ARTIST',profileUrl:null},subjects:[],status:'작가 상품',imageUrl:'https://media.example.com/verified/product.png',data:{sourceEntryId:null,name:'키링',summary:'',memberName:'작가',categories:[],subjects:[],evidenceScope:'GENERAL_CATALOG',price:null,saleState:'UNKNOWN',productUrl:null,sources:[],images:[{type:'PRODUCT',imageUrl:'https://unreviewed.example.com/candidate.png',pageUrl:'https://unreviewed.example.com',caption:null,rightsEvidence:null}],warnings:[]}}
const render=(node:React.ReactNode)=>renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('reviewed public entity images',()=>{
 it('renders the supplied subject and creator portrait while retaining detail links',()=>{
  const html=render(<><TasteSubjectCard subject={subject}/><TasteCreatorCard creator={{...product.creator,imageUrl:'https://media.example.com/verified/creator.png'}}/></>)
  expect(html).toContain('src="'+subject.imageUrl+'"')
  expect(html).toContain('src="https://media.example.com/verified/creator.png"')
  expect(html).toContain('href="/subculture/subjects/character"')
  expect(html).toContain('href="/subculture/creators/1"')
 })
 it('uses the approved top-level product portrait and never exposes a collected remote candidate',()=>{
  expect(render(<TasteProductCard product={product}/>)).toContain('src="'+product.imageUrl+'"')
  const missing=render(<TasteProductCard product={{...product,imageUrl:null}}/>)
  expect(missing).toContain('/assets/fallback/product.svg')
  expect(missing).not.toContain('unreviewed.example.com')
 })
 it('supplements legacy goods with verified media while preserving a selected catalog image',()=>{
  const html=render(<ProductCard product={product.data} imageUrl={product.imageUrl} imageSourceUrl="https://example.com/product" imageCredit="작가 판매 안내"/>)
  expect(html).toContain('src="'+product.imageUrl+'"')
  expect(html).toContain('href="https://example.com/product"')
  expect(html).not.toContain('unreviewed.example.com')
  const selected='https://media.example.com/manual.png'
  expect(render(<ProductCard product={product.data} imageUrl={product.imageUrl} images={[{id:1,participantId:1,productId:1,type:'PRODUCT',url:selected,caption:null,attribution:'',credit:''}]}/>)).toContain('src="'+selected+'"')
 })
 it('preserves the initial fallback for missing or invalid portrait sources',()=>{
  const html=render(<TasteSubjectCard subject={{...subject,imageUrl:'javascript:alert(1)'}}/>)
  expect(html).toContain('대표 이미지 미등록')
  expect(html).not.toContain('<img')
 })
 it('carries verified metadata into the selected-interest view and shows a separate source link',()=>{
  const entry=newInterest(subject)
  expect(entry.imageUrl).toBe(subject.imageUrl)
  expect(entry.imageSourceUrl).toBe(subject.imageSourceUrl)
  const html=render(<TasteImageCredit image={subject}/>)
  expect(html).toContain('href="https://example.com/characters"')
  expect(html).toContain('공식 캐릭터 소개')
 })
})
