> **운영 배포 작업본 · GitHub/Vercel/Render/GCS**
>
> 공개 이미지와 비공개 첨부의 저장 코드를 Google Cloud Storage로 전환했습니다. 실제 GitHub 원격 저장소, Vercel·Render·Supabase·GCS 리소스 생성과 실환경 수락검사는 아직 남아 있습니다.
>
> 배포 순서는 [운영 라이브 배포 가이드](docs/deployment/LIVE_GITHUB_VERCEL_GCS_KO.md)를 따르세요. 기존 v24 패키지 기록은 기준 이력이며 현재 작업본의 배포 승인 근거가 아닙니다.
> 현재 ZIP: `BoothHana2-full-v24-gcp-credit-notes-20260921.zip`. 문서 패키지 정보는 `PACKAGE_GCP_CREDIT_NOTES.json`, 이번 변경은 `CHANGE_MANIFEST_GCP_CREDIT_NOTES.json`, 현재 전체 무결성은 `SHA256SUMS.txt`를 기준으로 합니다. 아래 v24 코드 변경·검사 기록은 기존 릴리스 이력입니다.

# 부스하나 v24 · 여기서 시작하세요

2026-09-21 · 입력 v23 · **운영 배포 승인본이 아닙니다.**

API 빈 성공 응답, API 원점 주소, 쓰기 DTO, 수집 규격/재시작 해시, 배치도 범위 키, 오프라인 파일 해시, 실제 DB 준비 검사 계약을 보완했습니다.

- 변경사항: `docs/release/V24_CHANGES_KO.md`
- 적용/영향/실환경 수락: `docs/deployment/FULL_V24_KO.md`
- 이번 실행 결과와 미완료 항목: `TEST_RESULTS_KO.md`
- API/DTO/SQL 자동대조: `verification/v24/results/contract-audit.json`
- 원본/수정 비교: `verification/v24/results/comparison.json`
- 파일별 변경 해시: `CHANGE_MANIFEST_V24.json`
- 배포 ZIP 무결성: `python verification/v24/verify_package.py <ZIP경로>`

프런트·백엔드·수집기를 함께 적용하세요. SQL001~016·의존성/잠금 파일은 유지합니다. 전시관/구역명에 `%` 또는 `|`가 있으면 기존 게시의 재검토가 필요할 수 있습니다. 과거 관리 배치도 파일은 검증 해시가 없어 온라인 재확인에서 제외될 수 있으나 전체 보관함이나 오프라인 패키지를 일괄 초기화하지 않습니다.

`verification/run_checks.py` 통과는 실빌드/HTTP/PostgreSQL/모바일 검증 완료가 아닙니다. 현재 실환경 게이트는 NOT_READY입니다. 과거 release·preview·results는 이력이며 이번 성공 근거가 아닙니다. 원본 v23 안내는 `docs/history/v23-review-baseline/`에 보존했습니다.
