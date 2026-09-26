# v6 헤더·카테고리 탐색

## 화면

공개 영역만 변경한다. 운영자/관리자 콘솔의 레이아웃과 업무 기능은 v5를 유지한다.

| URL | 화면 |
|---|---|
| `/` | 서브컬처 기본 탐색. category 쿼리가 있으면 해당 분야 |
| `/discover` | 기존 호환 주소, 서브컬처 기본 탐색 |
| `/discover?category=subculture` | 서브컬처 공개 목록 |
| `/discover?category=exhibitions` | 박람회 준비 안내 |
| `/discover?category=festivals` | 축제 준비 안내 |
| `/discover/:eventId` | 기존 서브컬처 행사·부스·판매 상세 |
| `/events` | 기존 플랫폼 운영 행사 |

헤더는 페이지 이동용 `<nav>`와 링크다. 탭처럼 보이지만 ARIA tab widget을 흉내내지 않고 `aria-current="page"`를 한 항목에만 부여한다. 모바일에서도 3개 분야를 항상 표시한다. 서비스 메뉴는 native details/summary, Escape·외부 클릭 닫기를 제공한다.

## URL 상태

`category`, `q`, `type`, `period`, `sort`, `page`를 사용한다. 기본값: subculture, 검색어 없음, 전체 세부분류, 오늘 이후, 일정순, 0페이지.

- 탭 이동은 각 분야의 기본조건으로 진입한다.
- 검색·세부분류·기간·정렬 변경은 page를 초기화한다.
- 상세 링크에는 검증된 복귀 위치를 history state에 보관한다. 직접 상세 접속 시 서브컬처 목록으로 돌아간다.
- 일정은 KST 오늘을 기준으로 한다. 앞으로7일은 오늘 포함7일이며 이번달은 오늘~말일이다.
- 카드의 '오늘 운영일'은 날짜 기준이지 현재 시각에 영업 중이라는 뜻이 아니다.

## 서버 목록 필터

`GET /api/public/catalog/events`

| 매개변수 | 허용값 |
|---|---|
| page / size | page 0~100000, size 1~100 (화면20) |
| category | SUBCULTURE / EXHIBITION / FESTIVAL |
| q | 행사명·장소·주소·주최·주제 검색, 100자 이하 |
| subcategory | 기존 서브컬처 5분류 또는 빈값 |
| from / to | YYYY-MM-DD, 지정한 기간과 실제 occurrence가 겹치는 행사 |
| sort | DATE_ASC / RECENT |

매개변수가 없는 기존 호출은 RECENT 정렬로 유지한다. EXHIBITION/FESTIVAL은 현재 저장소가 연결되지 않았으므로 빈 목록을 반환하며 서브컬처 쿼리를 실행하지 않는다. 잘못된 분류·날짜·정렬은 400이다.

필터와 정렬에 SQL 문자열 입력을 직접 삽입하지 않는다. 검색어는 strpos로 부분 일치를 확인하므로 %, _를 와일드카드로 해석하지 않는다. 기간 범위의 시작·끝 조건은 **동일 occurrence**에서 검사하여 휴무일을 포함하지 않는다.

검색 대상은 검토 전 candidate가 아니라 publication snapshot이다. 행사 제외 상태는 기존처럼 조회 시 확인한다.

목록 응답은 기존 items/page/size/total 구조를 유지하며 항목에 `publishedAt`과 `banner`를 추가한다. banner는 승인·저장·행사레벨 BANNER만 배치 조회하며, 출처페이지·표기문구·자체저장 URL 외 내부 권한 메모는 반환하지 않는다. 추가 마이그레이션은 없다.

## 확장하지 않은 범위

- 박람회·축제의 CLI 프롬프트, 데이터 모델, 관리자 검토·공개 기능은 구현하지 않았다. categories.ts의 enabled만 바꾸는 것으로 전체 연동이 완성되지 않는다.
- 수집 배치, 기존 v5 저장·중복·재시도·이미지 승인 규칙, 예약·POS 정책은 그대로다.
- 운영 홈페이지의 가상 통계/행사를 제거했으며, 미리보기 예시는 preview/와 테스트에만 존재한다.

## 참고

라우팅 API 확인: React Router 공식 `useSearchParams` 및 `NavLink` 문서(2026-09-16).
- https://reactrouter.com/api/hooks/useSearchParams
- https://api.reactrouter.com/v7/variables/react-router.NavLink.html
위 문서 확인은 실제 프로젝트에 선언된 React Router 8/React19 의존성 빌드 검증을 대체하지 않는다.
