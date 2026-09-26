# v13 운영배포 리뷰 자료 — 2026-09-17

**현재 판정 NO-GO. 소스 수정본이 아니라, 원본 v13 전체 소스에 검토 자료를 추가한 묶음입니다.**

[코드리뷰](docs/review/V13_PRODUCTION_REVIEW_20260917_KO.md) → [운영배포 승인 체크리스트](docs/deployment/V13_PRODUCTION_ACCEPTANCE_20260917_KO.md) 순서로 읽으세요.

원본 723개 파일은 그대로 보존했습니다. SQL을 실행하거나 운영 DB/스토리지/GitHub/스케줄을 변경하지 않았습니다. v13의 기존 문서·기존 SHA256SUMS는 원본 당시 기록이며, 이번 리뷰 추가물은 PRODUCTION_REVIEW_SHA256SUMS_20260917.txt로 확인합니다.

검증 로그는 verification/release_review_v13/results, 재현기는 verification/release_review_v13/reproduction 안에 있습니다.

재현기가 exit0이면 이번 결함을 **재현했다**는 뜻입니다. 코드가 수정됐거나 운영배포 승인을 얻었다는 뜻이 아닙니다.
