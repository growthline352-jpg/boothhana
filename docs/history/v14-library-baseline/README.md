# 부스하나 — 전체 소스 v14

2026-09-17. 실제 v13 운영배포 검토본에서 다시 구성한 **누적 전체 소스**입니다. 이전 패치/생성기를 실행하지 않습니다.

행사·참가 부스·판매정보의 CLI LLM 수집, 클릭형 배치도, 팬/업체/관리자 화면, 예약·재고·POS, 메인 굿즈, 신고·고객문의를 포함합니다. 이번 릴리스는 새 분야 확장이 아니라 **정정 판정·거래 재전송·DB 연결 점유·검증 흐름 안정화**입니다.

## 먼저 읽기

- [시작·적용 안내](START_HERE_KO.md)
- [DB 검토·SQL014 적용 체크리스트](docs/deployment/V14_DATABASE_REVIEW_KO.md)
- [변경사항과 보존 정책](docs/release/V14_CHANGES_KO.md)
- [실제 빌드·DB·CI 검증 절차](docs/deployment/FULL_V14_KO.md)
- [이번 실행 결과와 미검증 범위](TEST_RESULTS_KO.md)

## 폴더

`frontend/` React/TypeScript · `backend/` Java21/Spring · `collector/` Python 실행기+Codex CLI · `database/` 수동 SQL001~014 · `docs/` 적용/운영/과거 이력 · `verification/` 독립·통합 검증

## 주요 URL

공개 행사 `/discover`, 운영 행사 `/events`, 업체 `/creator`, 관리자 `/admin/events`, 수집함 `/admin/subculture`, 고객센터 `/support`, 관리자 신고 `/admin/reports`·문의 `/admin/inquiries`·관리권 `/admin/ownership`.

박람회·축제는 준비 화면입니다. 외부 수집 상품에 가상의 판매량·재고·부스 소유권을 부여하지 않습니다. 일반 로그인은 FAN+CREATOR이며 ADMIN은 지정된 계정에만 추가됩니다.

**운영 DB·GitHub·호스팅·예약 작업은 변경하지 않았습니다.** 문서나 ZIP이 존재하는 것과 실제 운영 배포 승인은 다릅니다. 실제 의존성 빌드·DB·외부 서비스·브라우저 검증을 통과한 후 운영에 반영하세요.
