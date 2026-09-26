# v6 리뷰 반영 v7 — 2026-09-17

| 리뷰 | 적용 파일 | 변경 |
|---|---|---|
| R6-01 일정 | discovery/browse.ts, DiscoveryPage.tsx | cardOccurrences가 기간에 맞는 운영 구간을 선택. 오늘/미래 우선, 지난 행사 전체조회는 최신 과거 우선. 원본 배열과 휴무 구간 보존. |
| R6-02 상세 동선 | CatalogPublicPage.tsx, BoothDrawer.tsx, dialogLifecycle.ts | native dialog 드로어. 실제 클릭 요소를 보관하고 제목 초점·Escape/닫기·원래 요소 복귀·body scroll 복구. 행사 변경 시 내부 상태 reset. |
| R6-03 배치도 | FloorPlans.tsx | 행사레벨 FLOOR_PLAN만 표시. 저장 이미지와 링크-only 구분, 원문·확대링크. 홀/날짜는 명시적으로 연결된 공개 위치 정보에서만 가져옴. |
| R6-04 검색 | publicSearch.ts | 공개 필드 whitelist, NFKC/공백/대소문자 정규화, 여러 검색어 AND. 상품명/작가별칭/판매·상품 주제 포함. |
| R6-05 모바일 | PublicLayout.tsx | 아이콘 링크 aria-label='내 예약'. |
| R6-06 대표 | BannerSelectionPanel.tsx, api.ts, CatalogMediaService/Models/Service/AdminController/PublicationService, SecurityConfig, SQL008 | 승인과 별개 선택/해제, 사건별 첫선택 잠금+revision, 선택 이미지 자격 재확인, 목록·상세 동일한 대표 반환. |

## 동작 정책

### 일정

기간 필터는 해당 기간과 겹치는 실제 운영 구간만 카드에 표시합니다. 전체조회는 진행/예정이 있으면 이를 우선하고 과거 개수는 별도 알립니다. 이미 모두 끝난 행사는 최근 운영일을 먼저 보여줍니다. 한 카드에 최대3개, 남은 개수는 ‘같은 조건의 추가 일정’입니다. 날짜 문자열·운영 구간을 잘라 다시 저장하거나 비연속 구간 사이 휴무일을 생성하지 않습니다. 상태 배지는 전체 행사 일정 기준이며 실시간 영업 상태를 의미하지 않습니다.

### 부스 드로어 및 검색

드로어는 목록 끝 DOM 흐름이 아닌 최상위 modal layer에서 열립니다. 배경은 native modal로 비활성화되고 키보드는 내부에 머뭅니다. 닫을 때 trigger가 문서에 남아 있으면 그 요소로 복귀합니다. 이미지와 상품 정보는 이미 공개된 응답만 사용합니다.

검색 범위는 공개된 참가자 등록명/주제/부스번호/홀/구역/구성원명·별칭과 공개 판매요약/품목/주제, 공개 productRows의 이름/설명/구성원명/품목/주제입니다. 객체 전체 JSON을 검색하지 않습니다. 판매정보가 비공개(null)이면 잔여 상품행을 검색하지 않습니다.

### 이미지

새 이미지 수집·다운로드 로직을 추가하지 않았습니다. 승인되고 저장된 자산만 사용하며 외부 후보 이미지를 자동 img src로 로드하지 않습니다. 배치도 좌표와 위치 핀을 자동으로 추정하지 않습니다. 배치도 링크가 문서/PDF이면 원문 새 창 링크로만 안내합니다.

대표는 사용권한 결정과 별개입니다. 아무 선택이 없는 기존 데이터는 최초 사용 가능 배너 자동 선택을 유지합니다. 명시적 선택이 무효화되면 예전 포스터로 silent fallback하지 않습니다. 관리자에게 이를 알리고 다시 선택하도록 합니다. **공개된 행사의 대표 변경은 별도 공개본 갱신 없이 다음 조회에 반영**됩니다. 기존 데이터 migration에서 배너를 추정 선택하지 않습니다.

## 검증과 한계

- 새 소스/hook/JSX49조건 + 대표 UI핸들러11조건, 실제 Java 서비스20조건(가짜 JDBC) 검사.
- native dialogLifecycle 실함수와 소스 기반 static DOM의 Chromium48조건. 실제 React 상태/effect와 서버까지 묶은 E2E는 아님.
- PostgreSQL 대표 선택/해제/권한철회/동시성/재마이그레이션8테스트를 추가했지만 미실행.
- 기존 프롬프트/일요일배치/POS/재고 정책 변경 없음.

공식 구현 참고(기능 설명용이며 이 환경의 전체 앱 검증을 대체하지 않음):
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://www.w3.org/WAI/WCAG22/Techniques/html/H102
- https://www.postgresql.org/docs/current/explicit-locking.html
