> **2026-09-21 운영 방침 추가 · v24-gcp-credit-notes (문서 보완)**  
> 사용자는 Google Cloud 신규 가입자이며 크레딧을 받을 수 있다고 확인했습니다. 초기 이미지 저장은 **Google Cloud Storage(GCS) + 신규 가입 크레딧**을 사용하는 방향입니다. 개인 Drive 저장이 아닙니다.  
> [크레딧 조건·설정 체크리스트·비용/만료 대응](docs/deployment/GCP_FREE_TRIAL_KO.md)을 먼저 확인하세요. **기존 코드는 여전히 R2이며 GCS 연결·버킷 생성·실제 이전은 미실행**입니다. DB·SQL·의존성·기존 데이터는 변경하지 않습니다.  
> 현재 ZIP: `BoothHana2-full-v24-gcp-credit-notes-20260921.zip`. 문서 패키지 정보는 `PACKAGE_GCP_CREDIT_NOTES.json`, 이번 변경은 `CHANGE_MANIFEST_GCP_CREDIT_NOTES.json`, 현재 전체 무결성은 `SHA256SUMS.txt`를 기준으로 합니다. 아래 v24 코드 변경·검사 기록은 기존 릴리스 이력입니다.

# 현재 코드 검토 시작점 · v24

현재 문서는 [START_HERE_KO.md](START_HERE_KO.md), [실행 결과](TEST_RESULTS_KO.md), [v24 적용 절차](docs/deployment/FULL_V24_KO.md)입니다. **운영 승인 문서가 아닙니다.**

현재 해시 검증 기준은 SHA256SUMS.txt와 별도 전달된 ZIP SHA-256입니다. 예전 REVIEW/PRODUCTION_REVIEW 해시·보고서는 docs/history/legacy-package-manifests에 원문 그대로 보관합니다. v10/v17 등의 기록을 현재 배포 검증 결과로 사용하지 않습니다.
