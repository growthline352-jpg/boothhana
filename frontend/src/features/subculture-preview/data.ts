// Fictional fixtures for the isolated UX preview. Never imported by the production catalogue.
import type { CustomCharacter, InterestWork } from './interests'
export const base = '/assets/boothup/'
export const subjects = [
  { id: 'luna', name: '달토끼 루나', work: '달빛 우체국', aliases: '루나 luna 달토끼', image: 'moon-rabbit-keychains.png', color: 'peach', description: '달 위에서 작은 편지를 배달하는 토끼. 루나를 담은 굿즈와 만날 수 있는 행사를 찾아보세요.' },
  { id: 'momo', name: '픽셀캣 모모', work: '모모의 작은 세계', aliases: '모모 momo 픽셀 고양이', image: 'pixel-cat-stickers.png', color: 'mint', description: '네모난 세상을 여행하는 작은 고양이. 모모의 새로운 모험을 만나보세요.' },
  { id: 'star', name: '별우체부', work: '달빛 우체국', aliases: '별 우체부 star', image: 'star-courier-posters.png', color: 'blue', description: '밤하늘을 건너 도착한 한 장의 편지. 달빛 우체국에서 루나와 함께 편지를 배달하는 별우체부.' },
]
export const creators = [
  { id: 'moon', name: '달작업실', initials: '달', subject: 'luna', bio: '오래 곁에 두고 싶은 작은 이야기를 그려요.', color: 'peach', tags: '일러스트 · 아크릴 굿즈' },
  { id: 'pixel', name: '네모네모', initials: '네', subject: 'momo', bio: '작고 귀여운 것들을 픽셀에 담습니다.', color: 'mint', tags: '픽셀아트 · 스티커' },
  { id: 'night', name: '밤의 편지', initials: '밤', subject: 'star', bio: '당신의 방에 작은 밤하늘을 선물해요.', color: 'blue', tags: '일러스트 · 포스터' },
]
export const events = [
  { id: 'autumn', name: '가을빛 일러스트 마켓', edition: '제3회', place: '서울 · 성수 아트홀', region: '서울', dates: ['2026-10-17', '2026-10-18'], label: '10.17 토 — 10.18 일', type: '일러스트 · 굿즈', color: 'orange', english: 'AUTUMN\nDRAWING\nMARKET', admission: '1일권 8,000원', hours: '11:00 – 18:00', description: '좋아하는 그림을 만나고, 작가와 이야기를 나누는 가을의 이틀.', booth: 'A-12', series: ['제3회 · 2026.10', '제2회 · 2026.06', '제1회 · 2026.03'] },
  { id: 'moonfest', name: '달빛 우체국 온리전', edition: '첫 번째 편지', place: '서울 · 합정 작은전시장', region: '서울', dates: ['2026-10-24'], label: '10.24 토', type: '온리전', color: 'navy', english: 'A LETTER\nFROM\nTHE MOON', admission: '사전 예매 5,000원', hours: '12:00 – 17:00', description: '달빛 우체국을 좋아하는 사람들이 한자리에 모이는 하루.', booth: 'B-03', series: ['첫 번째 편지 · 2026.10'] },
  { id: 'paper', name: '작은종이 페스타', edition: '가을호', place: '경기 · 수원 창작홀', region: '경기', dates: ['2026-10-31', '2026-11-01'], label: '10.31 토 — 11.01 일', type: '문구 · 독립출판', color: 'green', english: 'SMALL\nPAPER\nBIG LOVE', admission: '무료 입장', hours: '10:00 – 18:00', description: '노트 사이에 넣어두고 싶은 그림과 종이의 세계.', booth: 'C-07', series: ['가을호 · 2026.10', '여름호 · 2026.07'] },
]
export const goods = [
  { id: 'keyring', name: '루나의 달 산책 아크릴 키링', creator: 'moon', subject: 'luna', image: 'moon-rabbit-keychains.png', price: 12000, event: 'autumn', booth: 'A-12', kind: '키링', description: '가방에 달아두는 작은 달빛. 약 6cm 크기의 아크릴 키링입니다.', dates: ['2026-10-17', '2026-10-18'] },
  { id: 'sticker', name: '모모의 하루 리무버블 스티커', creator: 'pixel', subject: 'momo', image: 'pixel-cat-stickers.png', price: 4500, event: 'autumn', booth: 'A-18', kind: '스티커', description: '모모의 느긋한 하루를 노트에 붙여보세요. 리무버블 스티커 1매.', dates: ['2026-10-18'] },
  { id: 'poster', name: '별우체부 일러스트 포스터', creator: 'night', subject: 'star', image: 'star-courier-posters.png', price: 8000, event: 'paper', booth: 'C-07', kind: '포스터', description: '벽 한쪽에 펼쳐지는 밤하늘. A4 사이즈 일러스트 포스터입니다.', dates: ['2026-10-31', '2026-11-01'] },
  { id: 'pouch', name: '여름 고양이 미니 파우치', creator: 'pixel', subject: 'momo', image: 'summer-cat-pouch.png', price: 15000, event: null, booth: null, kind: '파우치', description: '작은 소지품을 넣기 좋은 패브릭 파우치. 작가의 기존 상품이며 이번 행사 판매 여부는 아직 확인되지 않았어요.', dates: [] as string[] },
]
export const notices = [
  { id: 'n1', target: 'subject:luna', title: '루나 키링, 가을빛 마켓에서 만나요', body: '달작업실의 이번 회차 판매표에서 루나 키링을 확인했어요. 10월 17·18일, A-12 부스에서 판매 예정이에요.', reason: '관심 캐릭터 · 달토끼 루나', time: '오늘 10:30', to: '/goods/keyring', type: '판매 확인', image: 'moon-rabbit-keychains.png' },
  { id: 'n2', target: 'creator:moon', title: '달작업실의 온리전 참가 소식', body: '10월 24일 달빛 우체국 온리전 참가가 확인됐어요. 판매표는 아직 공개되지 않았어요.', reason: '관심 작가 · 달작업실', time: '어제 18:00', to: '/events/moonfest', type: '참가 확인', image: 'moon-rabbit-keychains.png' },
]
export type Good = typeof goods[number]
export type Event = typeof events[number]
export type SavedItem = { id: string; goodId: string; day: string; done: boolean; note: string }
export type Review = { id: string; eventId: string; edition: string; body: string; mine: boolean; author: string }
export type PreviewState = { follows: string[]; read: string[]; saved: SavedItem[]; reviews: Review[]; push: boolean; customWorks: InterestWork[]; customCharacters: CustomCharacter[]; interestWorks: string[]; onboardingStatus: 'new' | 'done' | 'skipped' }
export const initialState: PreviewState = {
  follows: [], read: [], saved: [], push: false, customWorks: [], customCharacters: [], interestWorks: [], onboardingStatus: 'new',
  reviews: [{ id: 'r1', eventId: 'autumn', edition: '제2회 · 2026.06', body: '오후에 방문하니 조금 여유로웠어요. 작가님들과 이야기 나눌 수 있어서 좋았고, 작은 굿즈를 담을 가방을 챙기면 편해요.', mine: false, author: '그림 모으는 사람' }, { id: 'r2', eventId: 'autumn', edition: '제2회 · 2026.06', body: '토요일에 다녀왔어요. 판매표를 미리 보고 부스 번호를 적어두니 찾기 쉬웠어요.', mine: false, author: '주말의 수집가' }],
}
export const storageKey = 'boothhana-subculture-ux-preview-v1'
export function dayLabel(day: string) {
  if (!day) return '방문일 미정'
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(day+'T12:00:00+09:00'))
}
export function priceLabel(price: number) { return price.toLocaleString('ko-KR')+'원' }
