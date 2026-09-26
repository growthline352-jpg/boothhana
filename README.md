> **2026-09-21 운영 방침 추가 · v24-gcp-credit-notes (문서 보완)**  
> 사용자는 Google Cloud 신규 가입자이며 크레딧을 받을 수 있다고 확인했습니다. 초기 이미지 저장은 **Google Cloud Storage(GCS) + 신규 가입 크레딧**을 사용하는 방향입니다. 개인 Drive 저장이 아닙니다.  
> [크레딧 조건·설정 체크리스트·비용/만료 대응](docs/deployment/GCP_FREE_TRIAL_KO.md)을 먼저 확인하세요. **기존 코드는 여전히 R2이며 GCS 연결·버킷 생성·실제 이전은 미실행**입니다. DB·SQL·의존성·기존 데이터는 변경하지 않습니다.  
> 현재 ZIP: `BoothHana2-full-v24-gcp-credit-notes-20260921.zip`. 문서 패키지 정보는 `PACKAGE_GCP_CREDIT_NOTES.json`, 이번 변경은 `CHANGE_MANIFEST_GCP_CREDIT_NOTES.json`, 현재 전체 무결성은 `SHA256SUMS.txt`를 기준으로 합니다. 아래 v24 코드 변경·검사 기록은 기존 릴리스 이력입니다.

# BoothHana2 · v24

2026-09-21. 서울·경기(인천 제외)의 서브컬처·박람회·축제 행사·부스·상품 서비스입니다. v24는 API·스키마·계약·해시 코드리뷰 수정본입니다.

[START_HERE_KO.md](START_HERE_KO.md)부터 확인하세요. [변경 내역](docs/release/V24_CHANGES_KO.md), [실행 결과](TEST_RESULTS_KO.md), [적용 및 수락](docs/deployment/FULL_V24_KO.md).

프런트·백엔드·수집기를 함께 반영합니다. 추가 SQL은 없으며 SQL001~016과 의존성/잠금 파일을 유지합니다. 제품 회귀54개/검증도구15개 및 기존 독립·수집기 검사는 통과했지만 실빌드·HTTP·PostgreSQL·모바일 검증은 미완료입니다. **운영 배포 승인 false, 실환경 게이트 NOT_READY입니다.**

v24 코드 릴리스 기준은 RELEASE_V24.json과 CHANGE_MANIFEST_V24.json입니다. 문서 보완 후 현재 전체 파일 기준은 SHA256SUMS.txt이며, 문서 패키지 정보/변경 목록은 위 안내를 사용합니다. 파일 수·해시는 완성 ZIP의 외부 package_check.json에서 확인합니다. 과거 REVIEW/PRODUCTION_REVIEW 해시 목록과 보고서는 docs/history/legacy-package-manifests로 이동했습니다. 과거 release·preview·results는 현재 성공 근거가 아닙니다.
