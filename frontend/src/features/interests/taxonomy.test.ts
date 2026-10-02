import { describe, expect, it } from 'vitest'
import { categories, categoryForType } from '../discovery/categories'
import { calendarTone } from '../discovery/calendar'
import { matchesInterest } from '../catalog/eventInterestEditing'
import { eventSubjectLabels, eventTopicIssues, taxonomyFields } from './taxonomy'

describe('shared event taxonomy', () => {
  it('routes each new type and supplies a calendar color without moving general concerts to subculture', () => {
    for (const type of ['FAN_CAFE','POPUP_STORE','CARD_COLLECTIBLES','FAN_CONVENTION']) {
      expect(categoryForType(type).code).toBe('SUBCULTURE')
      expect(calendarTone(type)).not.toBe('neutral')
    }
    for (const type of ['CONCERT','MUSIC_FESTIVAL']) expect(categoryForType(type).code).toBe('FESTIVAL')
    expect(categories.flatMap(c=>c.filters.filter(f=>f.value))).toHaveLength(27)
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
