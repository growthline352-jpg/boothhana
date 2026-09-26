# v17 보완 사항 및 적용 경계

2026-09-18 · 입력본: `BoothHana2-full-v16-20260918(1).zip`

## R16-01 · 인증 재확인 시 초안 소실

`AuthSession` 인스턴스에 `ConsoleDraftStore`를 두었습니다. 실제 편집 화면이 인증 게이트에서 제거되더라도 계정/권한으로 구분한 초안을 탭 메모리에 보관합니다. checking/error 동안 읽기·새로운 쓰기·저장 시작을 차단합니다. 같은 계정과 권한이 확인되면 복원하고, 401·명시적 로그아웃·계정/권한 변경 때 기존 epoch를 폐기합니다. A→B→A 전환으로 이전 응답이 되살아나지 않습니다.

적용 화면: `AdminEventFormPage`, `CreatorProductsPage`, `CreatorBoothsPage`. 행사 ID 및 행사 부스 ID로 초안을 구분합니다. 저장 요청의 pending도 화면 외부에 두어 확인 중 복귀 후 중복 생성 요청이 발생하지 않게 했습니다. 저장 성공/실패가 확인 중 도착해도 같은 epoch에만 반영하며 과거 화면의 이동 명령은 실행하지 않습니다.

보관 범위는 입력 JSON 값입니다. 비밀번호/쿠키를 보관하지 않고 localStorage/sessionStorage도 사용하지 않습니다. 새로고침·탭 종료 시 소멸합니다. 업로드 중 파일과 object URL은 보관하지 않으므로 다시 선택해야 합니다. 이미 완료된 업로드의 imageKey는 입력 JSON에 포함되지만 기존 이미지의 시각적 미리보기까지 복원하는 기능은 아닙니다. 업로드 동작은 기존 검증 흐름을 유지합니다.

모든 관리자 폼을 바꾼 것은 아닙니다. 수집 관리·고객센터 등 나머지 편집 폼의 적용 확대와 대형 JSX 파일 분리는 별도 후속 범위입니다.

## R16-02 · 검증 공백

독립 검사와 실제 통합 검사를 구분했습니다. `verification/v17/run_checks.py`는 원래 v16 검사와 새 테스트를 실행합니다. `release_gate.py`는 의존성 설치/실제 빌드, 실제 React/Chromium + 모의 API 검사, PostgreSQL 통합 테스트와 fresh JUnit 결과를 요구합니다. 매 시도 시작부터 `NOT_READY`를 기록하여 실패 후 과거의 성공 파일이 남지 않도록 했습니다.

`browser_drafts.py`는 실제 빌드된 프런트를 로컬에서 서비스하고 모든 API를 모의 응답으로 차단합니다. 외부 접속이나 운영 계정 없이 세 편집 화면의 입력 복원·다른 계정 초기화·중복 저장 방지·401 화면 차단을 확인하도록 추가했습니다. **실제 의존성 빌드가 필요한 이 브라우저 검사는 이번 작업 환경에서 실행되지 않았습니다.** CI 설정은 이 검사를 수행하도록 변경했으나 실제 GitHub에 반영/실행한 것은 아닙니다.

## R16-03 · 현재 지원 범위

공개 소개/푸터/메타 정보를 서울 서브컬처 중심으로 수정했습니다. 박람회·축제는 원래의 enabled=false를 유지하며 준비 중 문구를 명확하게 했습니다. 기능을 임의로 활성화하거나 수집 범위를 확대하지 않았습니다.

## R16-04 · 검색·공유용 초기 HTML

`lang=ko`, title/description/OG/Twitter/canonical, 필요한 경우 WebPage JSON-LD를 추가했습니다. `seo/metadata.mjs`를 서버와 SPA가 함께 사용합니다. `/discover/:id`는 설정된 백엔드의 공개 API에서만 조회하여 raw HTML 메타를 생성합니다. 요청자의 Cookie/Authorization은 전달하지 않고 리다이렉트는 거절합니다. 응답은 4초/4MiB 한도를 두었습니다.

공개 철회는 404, 일시 오류/잘못된 응답은 503 및 noindex로 처리합니다. 계정 화면은 일반적인 설명과 noindex만 제공하며 메모/검색어/개인 방문 필터는 출력하지 않습니다. 이미지도 공개 승인된 배너만 사용하고, 명시적 banner=null이면 과거 후보 이미지로 되돌아가지 않습니다. meta는 이스케이프하고 JSON-LD 안의 `<`를 유니코드 이스케이프하여 태그 삽입을 방어합니다.

외부 크롤러를 위해 Node HTML 함수와 Vercel 설정을 추가했습니다. 정적 파일 우선 처리로 서버 메타가 우회되지 않게 `build:hosting`은 생성된 index를 비공개 템플릿 경로로 옮깁니다. 실제 Vercel에서 함수 묶음·정적 자산·라우팅·초기 HTML을 확인해야 합니다. **본문 전체 SSR·검색 순위 개선·모든 공유 서비스의 이미지 갱신을 보장하는 작업은 아닙니다.** 이미지 자체의 권리 범위가 공유 미리보기까지 허용되는지도 운영자가 확인해야 합니다.

PUBLIC_SITE_URL 미설정 시 도메인을 추정하지 않고 canonical 없이 noindex로 처리합니다. 운영 적용에는 실제 환경변수가 필수입니다. 서버 응답은 private,no-store이며 이미 다른 서비스가 보관한 미리보기는 소급 삭제할 수 없습니다.

## R16-05 · 조회 비용과 성능 측정

`LibraryTargets.resolveAll`은 원래 요청 개수 200 제한을 먼저 적용한 뒤 전체 Target(eventId/type/id/participantId)을 중복 제거합니다. SQL은 유일한 대상만 조회하고 결과를 원래 요청의 순서와 중복대로 복원합니다. 반복 200개가 한 대상이면 바인딩도 200개분이 아닌 1개분으로 줄어듭니다. 공개/권리 판정 SQL과 회원 프라이버시는 유지합니다.

최대 500개 회원 목록을 메모리에서 필터링하는 기존 설계는 유지했습니다. DB 페이지네이션으로 무리하게 바꾸면서 비공개 전환/개인 메모 검색 의미를 달리하지 않았습니다. `library_probe.py`는 1/24/200개 실제 공개 대상 및 선택적으로 회원 500개 계정의 처음/마지막 페이지를 측정합니다. 실제 데이터로 측정하지 않았으므로 p95 개선 수치나 운영 용량을 주장하지 않습니다. SQL 비용은 별도로 EXPLAIN ANALYZE 등의 검토가 필요합니다.

## R16-06 · 문서 정리

현재 시작점·릴리스 노트·검증 결과를 v17로 통일하고 v16 입력본 원문은 `docs/history/v16-review-baseline`에 보존했습니다. 과거 release JSON/preview/로그는 이력이라고 명시했습니다.

## 유지한 항목

SQL001~015, 기존 DB 데이터, 기기 저장 키, 200개 API 한도, 회원 500개 제한, 예약/POS 정책, 수집 카탈로그와 운영 상품의 구분, 수집기 예약 실행 템플릿, 실제 의존성 버전과 잠금 파일. GitHub/운영 인프라는 변경하지 않았습니다.

## 참고한 구현 문서

React 상태 보존: https://react.dev/learn/preserving-and-resetting-state
React 외부 저장소 구독: https://react.dev/reference/react/useSyncExternalStore
Vercel Node 함수: https://vercel.com/docs/functions/runtimes/node-js
Vercel 정적 파일/rewrites 및 includeFiles: https://vercel.com/docs/project-configuration/vercel-json
확인일: 2026-09-18. 외부 문서는 구현 방식의 참고이며 이 패키지의 실환경 실행 증거가 아닙니다.
