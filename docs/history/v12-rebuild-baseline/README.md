# BoothHana2 · 부스하나 v12

행사·부스·상품 예약/POS 운영 기능과, CLI LLM으로 수집한 서브컬처 행사·참가 부스·판매정보·클릭형 배치도를 제공하는 통합 소스입니다.

v12에는 **정보 오류 신고, 일반 고객문의, 관리자 처리, 수집된 업체 관리 관계 확인, 로그인 복귀·참가 신청 이력 보완**을 추가했습니다. 문의/신고 자료는 공개 카탈로그·LLM 수집과 분리합니다.

**[처음 시작](START_HERE_KO.md) · [DB 수동 적용 체크리스트](docs/deployment/V12_DATABASE_REVIEW_KO.md) · [배포 안내](docs/deployment/FULL_V12_KO.md) · [기능/권한 플로우](docs/support/SUPPORT_AND_ROLES_V12_KO.md) · [검증 결과](TEST_RESULTS_KO.md)**

## 구성

| 디렉터리 | 내용 |
|---|---|
| frontend | React/TypeScript/Vite, 공개·팬·업체·관리자 UI |
| backend | Java21/Spring Boot, OAuth/권한/JPA·JDBC/API |
| database | **001~012 수동 마이그레이션**. 자동 실행하지 않음 |
| collector | Codex CLI LLM 조사, Python 실행/검증/전송. 기존 배치 유지 |
| docs | 현재 배포/기능 문서 + 과거 버전 이력 |
| verification | 독립 규칙·명시적 stub·정적 UI 검사. 실제 E2E와 구분 |
| preview | 가상 데이터의 정적 시안. 운영 DB seed나 실제 작동 앱 아님 |

## 현재 사용자 영역

- `/discover`: 공개 정보 제공용 행사·부스·판매·배치도. 박람회·축제는 준비 화면.
- `/events`, `/reservations`: 기존 플랫폼 운영 행사·로그인 사용자의 예약.
- `/creator`: 본인 운영 부스/상품/수령/POS. `/creator/managed-exhibitors`는 수집 업체 관계·정정 요청.
- `/support`: 내 신고/문의/관리권 신청. `/support/guest`는 설정된 경우 로그인 장애용 제한 접수.
- `/admin/reports`, `/admin/inquiries`, `/admin/ownership`: 관리자 고객지원·업체 심사.
- `/admin/subculture`, `/admin/goods-showcase`: 기존 수집검토/공개/배치도/메인 굿즈.

일반 계정은 FAN+CREATOR, 지정 계정에 ADMIN을 추가합니다. 업체 관리 관계가 생겨도 다른 구성원의 상품·신고자 신원·운영 예약 접근권을 얻지 않습니다. 온라인 PG결제·환불·정산·자동 메일/SMS·회원 정지/전체 계정 관리 UI는 이번 구현 범위가 아닙니다.

## 실행 전 필수

1. 실제 DB에 적용된 SQL을 확인하고 `database/001~012` 중 미적용분을 **운영 담당자가** 순서대로 적용합니다. 011/012 서버전용권한의 공유앱 영향을 먼저 확인하세요. `database/dev` seed는 운영에 실행하지 않습니다.
2. `frontend/.env.example`, `backend/.env.example`, `collector/config.example.json`을 참고해 실제 사용자 설정을 보안 관리합니다. ZIP에는 키나 운영설정이 없습니다.
3. frontend `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`; backend `gradlew test`, `gradlew bootJar`를 실행합니다. 개발 PowerShell `backend/run-dev.ps1`은 기존 `.env`를 읽어 실행합니다.
4. 준비상태, Kakao 복귀/CSRF, private첨부, 문의 권한·정정 결과를 스테이징에서 확인합니다. 전체 빌드/DB통합은 이 작성 환경에서 검증 완료하지 못했습니다.

현재 코드·SQL의 기준은 이 v12 문서입니다. 과거 계획·검토 보고서는 당시 제외 범위/상태를 담고 있으며 `docs/history/`와 과거 verification 로그는 이번 결과로 해석하지 않습니다. 기존 원본 README는 `docs/history/v11/README.md`에 보관했습니다.
