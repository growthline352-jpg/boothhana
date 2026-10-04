import type { IconName } from './DiscoveryIcon'
import type { CategoryKey } from './categories'

export interface HomeQuickLink {
  label: string
  detail: string
  icon: IconName
  to: string
}

const categoryLinks: Record<CategoryKey, HomeQuickLink[]> = {
  subculture: [
    { label: '코믹·동인', detail: '창작 행사', icon: 'sparkles', to: '?category=subculture&type=COMIC_DOUJIN&period=upcoming' },
    { label: '인형', detail: '인형 행사', icon: 'ticket', to: '?category=subculture&type=DOLL&period=upcoming' },
    { label: '생일카페', detail: '팬 이벤트', icon: 'calendar', to: '?category=subculture&type=BIRTHDAY_CAFE&period=upcoming' },
    { label: '굿즈 행사', detail: '문구와 굿즈', icon: 'bookmark', to: '?category=subculture&type=STATIONERY_GOODS&period=upcoming' },
  ],
  exhibitions: [
    { label: '주류·와인', detail: '테이스팅 행사', icon: 'sparkles', to: '?category=exhibitions&type=WINE&period=upcoming' },
    { label: '웨딩', detail: '웨딩 박람회', icon: 'calendar', to: '?category=exhibitions&type=WEDDING&period=upcoming' },
    { label: '생활·취미', detail: '라이프스타일', icon: 'ticket', to: '?category=exhibitions&type=LIFESTYLE&period=upcoming' },
    { label: '디자인·아트', detail: '창작과 브랜드', icon: 'building', to: '?category=exhibitions&type=DESIGN&period=upcoming' },
  ],
  popups: [
    { label: '팝업스토어', detail: '브랜드와 굿즈', icon: 'bookmark', to: '?category=popups&type=POPUP_RETAIL&period=upcoming' },
    { label: '체험형', detail: '직접 즐기는 공간', icon: 'ticket', to: '?category=popups&type=POPUP_EXPERIENCE&period=upcoming' },
    { label: '전시형', detail: '보고 만나는 공간', icon: 'building', to: '?category=popups&type=POPUP_EXHIBITION&period=upcoming' },
    { label: '복합형', detail: '체험과 쇼핑', icon: 'sparkles', to: '?category=popups&type=POPUP_MIXED&period=upcoming' },
  ],
  festivals: [
    { label: '걷기·거리', detail: '거리 행사', icon: 'pin', to: '?category=festivals&type=WALK&period=upcoming' },
    { label: '불꽃·빛', detail: '야간 축제', icon: 'sparkles', to: '?category=festivals&type=LIGHT&period=upcoming' },
    { label: '음악·공연', detail: '라이브 무대', icon: 'festival', to: '?category=festivals&type=MUSIC&period=upcoming' },
    { label: '먹거리', detail: '푸드 축제', icon: 'ticket', to: '?category=festivals&type=FOOD&period=upcoming' },
  ],
}

export function homeQuickLinks(category: CategoryKey): HomeQuickLink[] {
  return [
    { label: '오늘 이후', detail: '곧 열리는 행사', icon: 'calendar', to: `?category=${category}&period=upcoming` },
    { label: '이번 주말', detail: '주말 일정만', icon: 'sparkles', to: `?category=${category}&period=weekend` },
    { label: '서울', detail: '서울 지역', icon: 'pin', to: `?category=${category}&region=SEOUL&period=upcoming` },
    { label: '경기', detail: '경기 지역', icon: 'pin', to: `?category=${category}&region=GYEONGGI&period=upcoming` },
    ...categoryLinks[category],
  ]
}
