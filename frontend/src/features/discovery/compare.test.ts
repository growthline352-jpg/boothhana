import {it,expect} from 'vitest'
import {compareIds,compareHref,toggleComparison,editionId} from './compare'
it('keeps two distinct public IDs and rejects private or unsafe URL data',()=>{expect(compareIds('1,1,2,3')).toEqual([1,2]);expect(compareIds('0,-2,http://evil,9007199254740993,3')).toEqual([3]);expect(compareHref([1,2])).toBe('/compare?ids=1,2')})
it('allows removal while preventing a third choice',()=>{expect(toggleComparison([1,2],3)).toEqual([1,2]);expect(toggleComparison([1,2],1)).toEqual([2]);expect(toggleComparison([1],2)).toEqual([1,2])})
it('selects a published member when the edition root has been withdrawn',()=>{
 const group={rootEventId:1,name:'같은 회차',members:[{eventId:2,name:'첫 운영일',venueName:'장소',occurrences:[]},{eventId:3,name:'둘째 운영일',venueName:'장소',occurrences:[]}]}
 expect(editionId({id:2,operatingGroup:group})).toBe(2)
 expect(editionId({id:3,operatingGroup:group})).toBe(2)
 expect(editionId({id:3,operatingGroup:{...group,members:[{...group.members[0],eventId:1},...group.members]}})).toBe(1)
})
