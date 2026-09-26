> **운영 배포 작업본 · GitHub/Vercel/Render/GCS**
>
> 공개 이미지와 비공개 첨부의 저장 코드를 Google Cloud Storage로 전환했습니다. 실제 GitHub 원격 저장소, Vercel·Render·Supabase·GCS 리소스 생성과 실환경 수락검사는 아직 남아 있습니다.
>
> 배포 순서는 [운영 라이브 배포 가이드](docs/deployment/LIVE_GITHUB_VERCEL_GCS_KO.md)를 따르세요. 기존 v24 패키지 기록은 기준 이력이며 현재 작업본의 배포 승인 근거가 아닙니다.
> 현재 ZIP: `BoothHana2-full-v24-gcp-credit-notes-20260921.zip`. 문서 패키지 정보는 `PACKAGE_GCP_CREDIT_NOTES.json`, 이번 변경은 `CHANGE_MANIFEST_GCP_CREDIT_NOTES.json`, 현재 전체 무결성은 `SHA256SUMS.txt`를 기준으로 합니다. 아래 v24 코드 변경·검사 기록은 기존 릴리스 이력입니다.

# 현재 코드 검토 시작점 · v24

현재 문서는 [START_HERE_KO.md](START_HERE_KO.md), [실행 결과](TEST_RESULTS_KO.md), [v24 적용 절차](docs/deployment/FULL_V24_KO.md)입니다. **운영 승인 문서가 아닙니다.**

현재 해시 검증 기준은 SHA256SUMS.txt와 별도 전달된 ZIP SHA-256입니다. 예전 REVIEW/PRODUCTION_REVIEW 해시·보고서는 docs/history/legacy-package-manifests에 원문 그대로 보관합니다. v10/v17 등의 기록을 현재 배포 검증 결과로 사용하지 않습니다.
