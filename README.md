> **운영 배포 작업본 · GitHub/Vercel/Render/GCS**
>
> 공개 이미지와 비공개 첨부의 저장 코드를 Google Cloud Storage로 전환했습니다. 실제 GitHub 원격 저장소, Vercel·Render·Supabase·GCS 리소스 생성과 실환경 수락검사는 아직 남아 있습니다.
>
> 배포 순서는 [운영 라이브 배포 가이드](docs/deployment/LIVE_GITHUB_VERCEL_GCS_KO.md)를 따르세요. 기존 v24 패키지 기록은 기준 이력이며 현재 작업본의 배포 승인 근거가 아닙니다.
> 현재 ZIP: `BoothHana2-full-v24-gcp-credit-notes-20260921.zip`. 문서 패키지 정보는 `PACKAGE_GCP_CREDIT_NOTES.json`, 이번 변경은 `CHANGE_MANIFEST_GCP_CREDIT_NOTES.json`, 현재 전체 무결성은 `SHA256SUMS.txt`를 기준으로 합니다. 아래 v24 코드 변경·검사 기록은 기존 릴리스 이력입니다.

# BoothHana2 · v24

2026-09-21. 서울·경기(인천 제외)의 서브컬처·박람회·축제 행사·부스·상품 서비스입니다. v24는 API·스키마·계약·해시 코드리뷰 수정본입니다.

[START_HERE_KO.md](START_HERE_KO.md)부터 확인하세요. [변경 내역](docs/release/V24_CHANGES_KO.md), [실행 결과](TEST_RESULTS_KO.md), [적용 및 수락](docs/deployment/FULL_V24_KO.md).

프런트·백엔드·수집기를 함께 반영합니다. 추가 SQL은 없으며 SQL001~016과 의존성/잠금 파일을 유지합니다. 제품 회귀54개/검증도구15개 및 기존 독립·수집기 검사는 통과했지만 실빌드·HTTP·PostgreSQL·모바일 검증은 미완료입니다. **운영 배포 승인 false, 실환경 게이트 NOT_READY입니다.**

v24 코드 릴리스 기준은 RELEASE_V24.json과 CHANGE_MANIFEST_V24.json입니다. 문서 보완 후 현재 전체 파일 기준은 SHA256SUMS.txt이며, 문서 패키지 정보/변경 목록은 위 안내를 사용합니다. 파일 수·해시는 완성 ZIP의 외부 package_check.json에서 확인합니다. 과거 REVIEW/PRODUCTION_REVIEW 해시 목록과 보고서는 docs/history/legacy-package-manifests로 이동했습니다. 과거 release·preview·results는 현재 성공 근거가 아닙니다.
