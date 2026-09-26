# 부스하나 v18 · 이번 검증 결과

2026-09-18 · 대상: 수정된 전체 소스 · 운영 배포 승인: **false**

## 이번 환경에서 통과

| 검사 | 실제 결과 / 경계 |
|---|---|
| 현재 진입점 `python verification/run_checks.py` | 완료 exit0. v18 독립 검사와 수집기 전체 포함 |
| 새 지역·분류·스키마·프롬프트·드라이런 | Python10개 테스트 통과. 15분류×2지역 사례 포함. 원문 사실/실DB 아닌 가상자료 |
| 오프라인 공개 투영·동의 대상 분리·한도·만료·권한·요청·캐시 범위 | Node18개 테스트 통과. 실제 모듈/Service Worker 소스 사용, fetch/cache/worker환경은 명시적 대역. 실제 IDB/브라우저 검증 대체 아님 |
| Java 지역·분류·쿼리 파라미터·기본 허용값 | 492개 assertion + 공개 조회86개 assertion. 실제 순수 Java 컴파일/실행; SQL 실행 아님 |
| 기존 배너 및 새 이미지 오프라인 승인·철회·revision | 24개 조건 통과. 실제 서비스 코드 + 명시적 JDBC 대역 |
| 기존 v16/v17 인증·초안·메타·보관함 회귀 | v17 집중 검사(27 Node), v16 인증/Provider(28 Node), 메모/UI/서비스/게이트 등 통과. React/JDBC 등 일부 외부 경계 대역 |
| TypeScript | 편집된 카탈로그 관리자·오프라인 연결 포함 로컬 타입계약 통과. TS/TSX98개 문법 통과. 정식 외부 의존성 빌드 아님 |
| Java | 전체129개 파일 문법 검사 통과. Spring/AWS/JPA 종속 타입 해석/실행 아님 |
| 수집기 | 170개 테스트 통과. 로컬 HTTP/API/CLI 가상 경계. 실제 행사 데이터 수집 아님 |

최종 원본 로그: `verification/v18/results/final-checks.log`와 `final-checks-exit.json`입니다. 중첩 실행된 검사/조건 수를 합산해 전체 고유 테스트 수로 표시하지 않습니다.

## 시도했지만 완료하지 못함

| 검사 | 상태 | 사유 |
|---|---|---|
| frozen 프런트 의존성 설치 | NOT_READY | npm registry DNS EAI_AGAIN |
| 프런트 전체 타입/프로덕션 빌드 | NOT_READY | 의존성 미설치로 vite/client·node 타입 없음(TS2688). 정식 Vite 빌드 미도달 |
| 백엔드 Gradle test/bootJar | NOT_READY | services.gradle.org DNS UnknownHostException. 실제 Spring 컴파일/JUnit 미도달 |
| 실제 Chromium 오프라인 리더 | NOT_READY | 관리된 브라우저가 로컬 HTTP 페이지를 ERR_BLOCKED_BY_ADMINISTRATOR로 차단. 브라우저 시나리오 0개 완료. 정책을 변경·우회하지 않음 |
| SQL001~016·릴리스 통합 게이트 | NOT_READY | 새 격리 로컬 테스트 DB 준비/접속 설정 없음. 실제 마이그레이션 미실행 |
| 실제 모바일/호스팅/CORS/OAuth/R2/Codex/부하 | 미실행 | 배포/외부 계정/운영 데이터를 사용하지 않음 |

관련 로그: build-attempts.json 및 frontend-install/frontend-build/backend-build.log, browser-offline.json/log, release-gate.json/log.

브라우저 스크립트는 `/offline/index.html`의 실제 JS/Service Worker/IndexedDB를 사용하는 검사이며 로컬 가상 공개 API·이미지에 연결하도록 작성했습니다. 다만 이번 환경에서는 페이지 열기 단계가 차단됐으므로 모바일 오프라인 동작을 이미 입증했다고 표현하면 안 됩니다. 의존성 오류 역시 소스 자체의 오류를 입증하지 않지만 실제 빌드 성공을 보장하지도 않습니다.

## 추가된 실환경 회귀 대상

격리 PostgreSQL에 서울·경기/세 분야 조회 분리, 이미지 기본 미허용·승인·철회·낡은 revision 거절, readiness 신규 열을 확인하는 테스트를 추가했습니다. 실행되지 않았으며 v18 게이트가 새 SQL 준비 보고서와 실제 통과를 요구합니다.

원본 v17 ZIP/운영 DB/계정/GitHub/배포/예약 작업은 변경하지 않았습니다. 적용 절차는 `docs/deployment/FULL_V18_KO.md`, 전체 변경·제약은 `docs/release/V18_CHANGES_KO.md`를 참조하세요.
