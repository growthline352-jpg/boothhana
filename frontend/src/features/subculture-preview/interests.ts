import { subjects } from './data'
import type { PreviewState } from './data'

export const workKinds = ['게임', '애니메이션', '만화·웹툰', '소설', '오리지널·기타'] as const
export type WorkKind = typeof workKinds[number]
export type InterestWork = { id: string; title: string; kind: WorkKind }
export type CustomCharacter = { id: string; name: string; workId: string }
export const catalogWorks: InterestWork[] = [
  { id: 'moon-post', title: '달빛 우체국', kind: '애니메이션' },
  { id: 'momo-world', title: '모모의 작은 세계', kind: '게임' },
]
export const normalizeName = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
export const subjectWorkId = (id: string) => catalogWorks.find(w => w.title === subjects.find(s => s.id === id)?.work)?.id
export function selectedInterestWorks(state: PreviewState) {
  return [...new Set([...state.interestWorks, ...subjects.filter(s => state.follows.includes('subject:'+s.id)).map(s => subjectWorkId(s.id)!), ...state.customCharacters.filter(c => state.follows.includes('custom:'+c.id)).map(c=>c.workId)])]
}
export function favoriteCatalogSubjects(state: PreviewState) {
  const followed = subjects.filter(s => state.follows.includes('subject:'+s.id))
  const characterWorks = new Set([...followed.map(s=>subjectWorkId(s.id)), ...state.customCharacters.filter(c=>state.follows.includes('custom:'+c.id)).map(c=>c.workId)])
  return subjects.filter(s => followed.includes(s) || (state.interestWorks.includes(subjectWorkId(s.id)!) && !characterWorks.has(subjectWorkId(s.id))))
}
export function interestDefaults(value: Partial<PreviewState>) {
  const customWorks = Array.isArray(value.customWorks) ? value.customWorks.filter(w => w && typeof w.id==='string' && w.id.startsWith('custom-work:') && typeof w.title==='string' && w.title.trim() && workKinds.includes(w.kind)) : []
  const works = [...catalogWorks,...customWorks]
  const customCharacters = Array.isArray(value.customCharacters) ? value.customCharacters.filter(c => c && typeof c.id==='string' && typeof c.name==='string' && c.name.trim() && works.some(w=>w.id===c.workId)) : []
  return { customWorks, customCharacters, interestWorks: Array.isArray(value.interestWorks) ? value.interestWorks.filter(id=>works.some(w=>w.id===id)) : [], onboardingStatus: value.onboardingStatus === 'done' || value.onboardingStatus === 'new' ? value.onboardingStatus : 'skipped' as const }
}
