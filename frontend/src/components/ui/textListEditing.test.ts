import { describe, expect, it } from 'vitest'
import { parseTextList, syncTextListDraft } from './textListEditing'

describe('multi-line list editing',()=>{
  it('preserves Enter and the space needed to type a multi-word Korean subject',()=>{
    for(const draft of ['블루 ', '블루 아카이브\n', '블루 아카이브\n하츠네 ']) {
      expect(syncTextListDraft(draft,parseTextList(draft))).toBe(draft)
    }
  })
  it('normalizes the saved array without blank values or duplicates',()=>{
    expect(parseTextList(' 블루 아카이브 \n\n하츠네 미쿠\n블루 아카이브\n')).toEqual(['블루 아카이브','하츠네 미쿠'])
  })
  it('accepts external checkbox additions and removals while a draft is present',()=>{
    expect(syncTextListDraft('블루 아카이브\n',['블루 아카이브','VOCALOID'])).toBe('블루 아카이브\nVOCALOID')
    expect(syncTextListDraft('VOCALOID\n',[])).toBe('')
  })
})
