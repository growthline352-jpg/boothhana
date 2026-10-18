# 행사 상세 페이지와 공개 API

행사 안내를 먼저 보여 주고 참가 부스, 배치도, 후기는 각각 진입할 때만 읽는다. 탭 모양의 내비게이션은 유지하지만 실제 링크로 이동한다.

| 화면 | 주소 | 초기 데이터 API |
| --- | --- | --- |
| 행사 안내 | `/discover/:id` | `/api/public/catalog/events/:id/overview` |
| 참가 부스 | `/discover/:id/booths` | `/api/public/catalog/events/:id/booths?page=0&size=24` |
| 부스 상세 | `/discover/:id/booths/:participantId` | `/api/public/catalog/events/:id/booths/:participantId` |
| 배치도 | `/discover/:id/map` | `/api/public/catalog/events/:id/map` |
| 이번·지난 회차 후기 | `/discover/:id/reviews` | `/api/public/catalog/events/:id/reviews?page=0` |

- 기존 전체 행사 API는 오프라인 저장 및 이전 클라이언트를 위해 유지한다.
- 기존 `section`, `view`, `booth` 쿼리 주소는 새 주소로 영구 이동한다. 개별 부스 ID, 방문일, 전시관, 지도 포커스와 검색 조건은 유지한다.
- 목록은 서버에서 검색·필터·페이지를 적용하고 공개된 표시 필드만 검색한다. 수집 후보, 증거 전문과 비공개 원문은 검색하지 않는다.
- 지도는 좌표/부스 탐색에 필요한 요약만 읽는다. 전체 상품은 선택한 부스에서만 읽는다. 지도 코드도 해당 화면에서만 내려받는다.
- 공개 스냅샷을 읽되 현재 제외 상태와 이미지 이용 승인 철회를 즉시 적용한다. 스키마 변경과 데이터 마이그레이션은 없다.
- 기존 브라우저 세션 캐시와 요청 중복 제거를 재사용한다. 저장·방문 목록은 사용자 범위가 바뀌면 별도 캐시로 읽고 개인 ID 목록을 화면 URL에 쓰지 않는다.

각 페이지의 초기 HTML에 실제 공개 정보와 링크를 넣고 제목, 설명, canonical, breadcrumb를 구분한다. 부스 목록의 다음 페이지도 크롤링할 수 있다. 필터 조합과 빈 지도·후기는 `noindex,follow`로 처리하고 내용이 있는 페이지만 사이트맵에 추가한다. 구조화 데이터는 같은 행사 정체성을 유지하며 공개 본문과 일치하는 Event/WebPage/ItemList만 제공한다. AI 검색 전용 허구 스키마나 검색 노출 보장은 추가하지 않는다.

배포 순서는 호환 API 추가 → 프런트 배포다. 기존 API와 주소는 계속 유효하므로 백엔드만 이전 이미지로 복구하면 안 되며, 프런트를 먼저 복구하거나 새 API를 유지해야 한다.

검증은 `frontend`의 Vitest/SEO Node 테스트와 실제 PostgreSQL의 `CatalogEventPagesIntegrationTests`, `EventCommentsTests`를 사용한다. 통합 테스트는 기존 opt-in 격리 릴리스 DB에서만 실행된다.
