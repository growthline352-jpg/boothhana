# BoothHana2 — v13 재구축 전체 소스

2026-09-17. 실제 보관된 v12 전체 ZIP에서 다시 만든 소스입니다. 존재가 확인되지 않았던 이전 v13 안내를 기반으로 하지 않습니다.

**[적용 순서](START_HERE_KO.md) · [5건 수정 내역](docs/support/RELIABILITY_V13_KO.md) · [DB 검토표](docs/deployment/V13_DATABASE_REVIEW_KO.md) · [실제 검사 결과](TEST_RESULTS_KO.md)**

이 ZIP은 전체 소스이며 과거 패치나 생성기를 추가 적용하지 않습니다. 애플리케이션 코드 수정과 독립 검사를 수행했지만 전체 React/Spring 빌드·실제 DB·외부 서비스 통합은 아직 검증하지 못했습니다.

수정 범위는 신고 숨김의 트랜잭션 경계, 배치도 정정 판정, 사진 보완 상태, 대화 상한과 필수 관리자 처리 분리, 접수 응답 유실 복구입니다. CLI LLM 수집·일요일 배치·기존 디자인·POS 정책은 유지합니다.

기준 원본 SHA-256: `06843235f43177bfaed92e025e3a9ac66b755bd4d999caa48b2c29b787320cb1`.
실제 원본 690개 파일을 유지하며, 변경 파일과 추가 파일은 `verification/v13/results/package-report.json`에 기록했습니다. 이번 파일 무결성은 최상위 `SHA256SUMS.txt`를 사용합니다. 이전 `REVIEW_SHA256SUMS.txt`, `verification/v4~v12/results/`는 과거 기록이며 현재 전체본 검증으로 해석하지 않습니다.

- `frontend/`: 사용자·업체·관리자 React 화면.
- `backend/`: Spring API, 소유권·신고·업체 관계·정정 로직.
- `collector/`: Codex CLI를 호출하는 수집 실행기.
- `database/`: 담당자가 검토 후 직접 적용하는 SQL001~013.
- `verification/v13/`: 이번 독립 검사와 실제 환경 검증 실행기.

기존 서비스 설명: [v12 README 보존본](docs/history/v12-rebuild-baseline/README.md). 배포 기준은 위 v13 문서를 우선합니다.
