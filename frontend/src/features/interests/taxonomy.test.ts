import { describe, expect, it } from 'vitest'
import { categories, categoryForType } from '../discovery/categories'
import { calendarTone } from '../discovery/calendar'
import { matchesInterest } from '../catalog/eventInterestEditing'
import { eventSubjectLabels, eventTopicIssues, eventTypeOptions, taxonomyFields } from './taxonomy'

describe('shared event taxonomy', () => {
  it('keeps fandom subjects in popup and preserves legacy admin edits without a duplicate public filter',()=>{
    const popup=taxonomyFields.find(f=>f.code==='POPUP')!,sub=taxonomyFields.find(f=>f.code==='SUBCULTURE')!
    expect(sub.formats.some(f=>f.code==='POPUP_STORE')).toBe(false)
    expect(sub.formats.flatMap(f=>f.types).some(t=>t.startsWith('POPUP'))).toBe(false)
    expect(popup.topics.map(t=>t.code)).toEqual(expect.arrayContaining(['CHARACTER_IP','ANIME_MANGA','GAME','VOCALOID','VTUBER']))
    expect(eventSubjectLabels('POPUP_STORE',['GAME','원신'])).toEqual(['게임','원신'])
    expect(eventTypeOptions('POPUP').filter(f=>f.value)).toHaveLength(4)
    expect(eventTypeOptions('POPUP','POPUP_STORE').map(f=>f.value)).toContain('POPUP_STORE')
  })
  it('routes each new type and supplies a calendar color without moving general concerts to subculture', () => {
    for (const type of ['FAN_CAFE','CARD_COLLECTIBLES','FAN_CONVENTION']) {
      expect(categoryForType(type).code).toBe('SUBCULTURE')
      expect(calendarTone(type)).not.toBe('neutral')
    }
    for (const type of ['CONCERT','MUSIC_FESTIVAL']) expect(categoryForType(type).code).toBe('FESTIVAL')
    for (const type of ['POPUP_STORE','POPUP_RETAIL','POPUP_EXPERIENCE','POPUP_EXHIBITION','POPUP_MIXED']) {
      expect(categoryForType(type).code).toBe('POPUP')
      expect(calendarTone(type)).not.toBe('neutral')
    }
    expect(categories.flatMap(c=>c.filters.filter(f=>f.value))).toHaveLength(30)
  })
  it('keeps works visible while showing canonical codes as Korean labels', () => {
    expect(eventSubjectLabels('SUBCULTURE_MUSIC',['GAME','페르소나','GAME','게임'])).toEqual(['게임','페르소나'])
  })
  it('flags empty and type-only topics but accepts source-backed game and novel tags', () => {
    const sub=taxonomyFields.find(f=>f.code==='SUBCULTURE')!
    expect(eventTopicIssues(sub,'ONLY_EVENT',['ONLY_EVENT'])).toHaveLength(2)
    expect(eventTopicIssues(sub,'ONLY_EVENT',[])).toHaveLength(1)
    expect(eventTopicIssues(sub,'ONLY_EVENT',['괴담출근'])).toEqual([])
    expect(eventTopicIssues(sub,'SUBCULTURE_MUSIC',['GAME_OST_CONCERT'])).toEqual([])
    expect(matchesInterest(sub.topics.find(o=>o.code==='VTUBER')!,'SUBCULTURE_MUSIC',['VIRTUALS'])).toBe(false)
  })
  it('keeps broad exhibition preferences and adds distinct themes', () => {
    const expo=taxonomyFields.find(f=>f.code==='EXHIBITION')!
    expect(matchesInterest(expo.topics.find(o=>o.code==='LIFESTYLE')!,'LIFESTYLE',[])).toBe(true)
    expect(matchesInterest(expo.topics.find(o=>o.code==='PETS')!,'LIFESTYLE',['반려동물'])).toBe(true)
    expect(matchesInterest(expo.topics.find(o=>o.code==='PETS')!,'LIFESTYLE',['육아'])).toBe(false)
  })
})
