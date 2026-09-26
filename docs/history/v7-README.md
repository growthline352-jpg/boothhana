# 부스하나 전체 소스 v7 · v6 화면 코드리뷰 반영

이 저장소는 `BoothHana2-full-v6-20260916.zip` 전체 소스에 화면 리뷰 6건을 반영한 통합본입니다. 기존 v1~v6 기능과 원본 자산을 포함하며, 패치·overlay·전체본 생성기가 아닙니다. `apply_updates.py`를 추가 실행하지 않습니다.

**v7은 새 SQL `008_catalog_presentation.sql`이 필요합니다.** v5/v6에서 007까지 적용했다면 008만 추가합니다. 현재 적용 순서는 [START_HERE_KO.md](START_HERE_KO.md)와 [배포 안내](docs/deployment/FULL_V7_KO.md)를 확인하세요. 과거 버전 문서의 “추가 SQL 없음”은 이번 버전에 해당하지 않습니다.

## 이번 변경

| 항목 | 반영 |
|---|---|
| 카드 일정 | 선택한 기간에 맞는 운영일, 오늘·다음 운영일을 우선하고 과거 일정은 구분합니다. |
| 부스 판매정보 | 긴 부스 목록 아래 대신 native dialog 드로어로 엽니다. 닫기·Escape·초점 복귀를 처리합니다. |
| 배치도 | 승인·저장된 행사 배치도를 별도 영역에 표시하고 확대 링크·출처를 제공합니다. 링크만 확보한 경우는 별도 표시합니다. |
| 부스 검색 | 공개된 작가명·별칭·개별 상품명·상품 및 판매 주제를 포함합니다. 비공개 검토 정보는 검색하지 않습니다. |
| 모바일 헤더 | 아이콘만 남는 ‘내 예약’ 링크에도 접근성 이름을 제공합니다. |
| 대표 배너 | 사용 승인과 별도로 대표 이미지를 선택합니다. 지정한 이미지가 부적격이 되면 예전 포스터로 바꾸지 않고 기본 표시로 돌아갑니다. |

세부 정책과 API: [REVIEW_FIXES_V7_KO.md](docs/ui/REVIEW_FIXES_V7_KO.md).

## 유지되는 기능

공개 헤더의 **서브컬처 / 박람회 / 축제** 3개 분야는 유지합니다. 박람회·축제는 준비 화면이며, 수집 범위를 확장하지 않았습니다. `/events`는 기존 플랫폼 운영 행사, `/discover`는 외부 정보 제공용 카탈로그입니다. 외부 수집·공개가 예약·참가 신청·POS를 자동 생성하지 않습니다.

기존 카카오 로그인, 팬·크리에이터·관리자 권한, 상품·재고 동시성, 예약 취소·수령, 이미지 업로드 제한, CSRF·조회 범위 방어와 v5 누적 수집 보완은 유지합니다. **POS 취소 재고는 기존 D-009 정책대로 수동 조정**입니다.

```text
일요일 03:00 Asia/Seoul — 별도 PC/서버의 스케줄러
  → Codex CLI LLM: 행사 → 참가 부스 → 판매정보 검색·분석
  → Python: 실행 순서·검증·재시도·백엔드 전송
  → 백엔드: DB 저장
  → 사용 승인된 이미지: 제한된 다운로드·검증 후 R2 저장
  → 관리자: 검토 및 공개 승인
```

`collector/` 실행기·프롬프트·스케줄은 v6 파일을 그대로 보존했습니다. 설정/로그인/스케줄 설치는 [수집기 안내](collector/README_KO.md)를 따릅니다. 실제 예약 작업은 이 ZIP을 만드는 과정에서 등록하지 않았습니다.

## 폴더와 실행

```text
frontend/       React/TypeScript/Vite 화면
backend/        Java 21/Spring Boot API
collector/      Python 실행기 + Codex 프롬프트/규격 + 일요일 스케줄 템플릿
database/       순서대로 수동 적용할 PostgreSQL SQL 001~008
docs/           현재 안내 및 명시적으로 구분한 이전 기록
verification/   독립 검사·선택 통합 테스트·실제 실행 로그
```

원본 의존성 선언(React19/Router8/TypeScript6/Vite8, Java21/Spring Boot4.1)을 변경하지 않았습니다. Python 수집기는 3.11 이상입니다. `.env.example`은 템플릿이며 실제 비밀 값은 포함하지 않습니다.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

개발 서버는 기존 `backend/run-dev.ps1`과 프런트 `pnpm dev`를 사용합니다. 새 복사본에는 실제 `.env`, Codex 인증, `config.local.json`을 별도로 준비하고 Git에 올리지 마세요.

## 검증

[TEST_RESULTS_KO.md](TEST_RESULTS_KO.md)에 실행·미실행 검사를 구분했습니다. 독립 검사와 Chromium의 소스 기반 정적 DOM/실제 dialog helper 검사는 통과했지만, 전체 React/Spring 빌드·PostgreSQL·실제 Codex/R2 연동은 완료하지 못했습니다. 스테이징 통합 검증 전 운영 배포 승인본이 아닙니다.

기본 독립 검사: `python verification/run_checks.py`. 실제 DB 테스트는 **전용 로컬 테스트 DB를 초기화하는 opt-in 코드**이므로 배포 안내를 먼저 확인하세요.
