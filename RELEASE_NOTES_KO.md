> **현재 코드와 운영 배포 · GitHub/Vercel/Ubuntu/GCS**
>
> v0.2.9.0은 2026-10-04 운영 배포 승인을 받아 일괄 반영을 준비 중입니다. 배포와 운영 수락검사 완료 여부는 아직 확인되지 않았습니다. 공개 행사 이미지 보완, 부스 상세 배치·이미지 크게 보기, 부스 없는 행사의 바로가기 숨김과 행사 상세 안내 문구 제거는 [변경 내역](CHANGELOG.md)을 확인하세요.
>
> 현재 운영은 GitHub `main` 기반 Vercel 프런트와 Ubuntu API·Cloudflare Tunnel, Google Cloud Storage를 사용합니다. [Ubuntu 터널 배포 가이드](deploy/ubuntu/TUNNEL_KO.md)와 [이미지 보완 수락 절차](collector/IMAGE_REPAIR_KO.md)를 따르세요.
> 아래 ZIP·manifest·해시는 `BoothHana2-full-v24-gcp-credit-notes-20260921.zip` 패키지에 관한 과거 기록입니다. 현재 Git 작업본의 파일 목록·무결성이나 배포 승인 근거를 나타내지 않습니다.

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
