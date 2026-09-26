# v6 README 보존본 — 현재 적용 안내가 아닙니다

현재 버전의 적용은 저장소 루트 START_HERE_KO.md와 docs/deployment/FULL_V7_KO.md를 따르세요. 아래 내용은 v6 당시 기록이며 “추가 SQL 없음” 안내는 v7에 적용되지 않습니다.

# v6 · 서브컬처 / 박람회 / 축제 헤더 탭

전체 소스입니다. 시작·배포: [START_HERE_KO.md](START_HERE_KO.md). UI/API: [CATEGORY_TABS_V6_KO.md](docs/ui/CATEGORY_TABS_V6_KO.md).

공개 홈을 실제 데이터 탐색 화면으로 바꿨습니다. **박람회·축제는 준비 화면이며 수집 범위는 서브컬처 그대로입니다.** v5 적용 DB에 추가 SQL은 없고 프런트·백엔드를 함께 배포합니다. 미리보기의 가상 데이터는 앱/DB에 넣지 않습니다.

---

# 부스하나 · 전체 통합 소스 v5

**첨부 원본 + 이 대화에서 작성한 v1·v2·v3 수정 + 일요일 3단계 서브컬처 배치와 v4 코드리뷰 보완 8건을 통합한 전체 저장소 소스**입니다. 패치·overlay·전체본 생성기가 아닙니다. 별도 `apply_updates.py`를 실행하지 않습니다.

기준 커밋: `f52839479746e195b0b503f0114485ebaed11298` (업로드된 원본과 일치 확인). 원본 이미지와 Gradle wrapper를 포함합니다. `.git`, 실제 `.env`, 인증정보, 의존성 캐시, 실행 결과 DB는 포함하지 않습니다.

## 먼저 읽기

- **[START_HERE_KO.md](START_HERE_KO.md)**: GitHub 반영, DB/환경변수, 실행 순서
- **[전체 배포 안내](docs/deployment/FULL_V5_KO.md)**: 001~007 마이그레이션, 기존 업로드 변경, 보안·롤백
- **[주간 수집기 안내](collector/README_KO.md)**: Codex 준비, Windows/Linux 일요일 예약, 재실행
- **[실제 검증 결과](TEST_RESULTS_KO.md)**: 실행한 검사와 실행하지 못한 통합 검증 구분
- [변경사항](RELEASE_NOTES_KO.md), [수집 데이터 계약](docs/catalog/MODEL_V4_KO.md)

## v5 핵심 보완

검토 상태만 저장하면 수집값을 고정하지 않습니다. 실제 수정 필드만 유지하며 필드별 해제가 가능합니다. 명단은 DB 커서로 다음 주에 이어 수집하고, 판매정보 미발견·실패도 조사 시각을 기록합니다. 안정적인 출처 ID/별칭을 사용하며 일부 상품만 발견한 결과로 기존 상품을 지우지 않습니다. 서버 수신 결과로 건수를 집계하고 CLI 한도가 소진되어도 이미지 처리는 별도로 수행합니다. 품절·취소·재확인 미완료가 상품 카드에 표시됩니다.

**이미 v4를 사용 중이면 수집기를 잠시 중지하고 SQL 007 → 백엔드/프런트/수집기 동시 업데이트 순서로 적용하세요.** v5 체크포인트는 `~/.boothhana-collector/weekly-v5/`에 따로 보관합니다. 이전 v4 폴더를 v5로 강제 재개하지 않습니다. 기존 DB 내용과 수동 수정값은 자동 삭제하지 않습니다.

## 기능

기존 팬·크리에이터·관리자 화면, 카카오 로그인, 부스·상품·예약·POS·이미지 기능을 유지합니다. 이전 수정의 재고 동시성 방어, 상품 두 엔티티 버전 검사, 이미지 보존과 제한, CSRF 및 조회 scope 방어를 포함합니다. **POS 취소 재고는 기존 D-009 정책대로 수동 조정**입니다.

새 기능은 외부 정보 제공용 catalogue입니다.

```text
일요일 03:00 Asia/Seoul (별도 실행 PC/서버)
  → 1. 서울 서브컬처 행사 검색 (진행 중 + 앞으로 90일)
  → 2. 행사별 참가 부스·명칭·부스번호·배치도 링크 수집
  → 3. 부스별 판매 한줄요약·주제·품목·확인된 상품/가격·이미지 후보 수집
  → 이전에 사용 승인된 이미지에 한해 허용 호스트에서 다운로드·검증·R2 저장
  → 관리자 검토 / 공개본 갱신 (자동 공개하지 않음)
```

관리자는 `/admin/subculture`에서 결과를 확인·수정·승인하고, 공개를 선택한 정보는 `/discover`와 `/discover/:eventId`에서 읽기 전용으로 노출됩니다. **기존 `/events` 운영 행사와 별도**입니다. 외부 수집으로 크리에이터 소유권·참가 승인·재고·예약은 생성하지 않습니다. 관리자 화면에는 원격 CLI 실행 버튼이 없습니다.

## 구조

```text
frontend/      기존 React·TypeScript·Vite + 관리자 수집 workspace/공개 catalogue
backend/       Java 21·Spring Boot API + collection/catalog 서비스
collector/     Python CLI orchestrator + Codex 3단계 프롬프트·스키마·주간 스케줄
database/     수동 적용하는 순서 있는 PostgreSQL SQL (001~007)
docs/          현재 배포/계약과 이전 계획·QA(과거 기록)
verification/  외부 서비스 없이 재실행할 수 있는 검증과 실행 로그
```

프런트 React19/TypeScript6/Vite8, 백엔드 Java21/Spring Boot4.1 의존성 선언은 원본을 유지했습니다. 실제 배포에는 해당 의존성을 설치해야 합니다. Python 수집기는 3.11 이상입니다.

## 로컬 시작

DB를 백업한 후 `database/001_initial_schema.sql`부터 `007_catalog_review_fixes.sql`까지 **아직 적용하지 않은 SQL만 번호 순서대로** 적용합니다. 개발 seed는 자동 실행하지 않습니다.

`backend/.env.example` → `backend/.env`, `frontend/.env.example` → `frontend/.env`를 복사하고 실제 값을 채웁니다. **절대 Git에 커밋하지 마세요.** PowerShell 개발 서버는 `backend/run-dev.ps1`이 `.env`를 로드합니다.

```powershell
cd backend
.\run-dev.ps1
# 별도 터미널
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

실제 수집·로그인·R2·DB 전체 연결은 별도 환경이 필요합니다. 이 소스는 통합 스테이징 검증 전 운영 배포 승인본이 아닙니다.
