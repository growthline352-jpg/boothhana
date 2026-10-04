> **현재 코드와 운영 배포 · GitHub/Vercel/Ubuntu/GCS**
>
> v0.3.0.0은 2026-10-04 운영 배포 승인을 받아 일괄 반영을 준비 중입니다. 배포와 운영 수락검사 완료 여부는 해당 커밋의 CI·배포 기록으로 확인합니다. 행사 비교·방문 준비, 상세 화면 개선과 수집기 오류 처리를 포함하며 동네 팝업 탐색과 새 자동 수집 일정은 공급 검증 후 공개합니다. [행사 탐색·방문 준비 및 공개 조건](docs/DISCOVERY_IMPLEMENTATION_KO.md), [팝업 출시 순서](docs/POPUP_LAUNCH_KO.md), [공개 행사 이미지 보완 절차](collector/IMAGE_REPAIR_KO.md), [부스 상세 화면 동작](frontend/README.md#routes), [변경 내역](CHANGELOG.md)을 확인하세요.
>
> v0.2.4.0 관리자·업체 화면의 공개 행사 관리, 방문 안내 편집, 운영일 묶음과 SQL022 적용 순서는 [운영 화면 안내](docs/OPERATIONS_CONSOLE_SYNC_KO.md)를 확인하세요.
>
> 현재 운영은 GitHub `main` 기반 Vercel 프런트와 Ubuntu의 BoothHana 전용 API·Cloudflare Tunnel을 사용합니다. 공개 이미지와 비공개 첨부는 Google Cloud Storage를 사용합니다. 변경 배포는 해당 커밋의 CI와 실제 운영 수락검사 결과를 기준으로 확인합니다.
>
> 현재 API·수집기 운영 방식은 [Ubuntu 터널 배포 가이드](deploy/ubuntu/TUNNEL_KO.md), 수집·분류 규격은 [수집기 안내](collector/README_KO.md), API 계약·개발 설정은 [백엔드 README](backend/README.md), 프런트 빌드·미리보기는 [프런트 README](frontend/README.md)를 확인하세요. 분야별 주소와 상세 페이지 연결은 [분야별 사이트 안내](docs/CATEGORY_SITES_KO.md)를 확인하세요. 기존 v24 패키지 기록은 기준 이력이며 현재 Git 배포의 승인 근거가 아닙니다.
> 분야별 관심 설정과 저장 인원순 추천의 사용 방법은 [내 정보 안내](docs/ACCOUNT_PAGE_KO.md), API·회귀·SQL020~021 적용 순서는 [관심분야 검증 및 배포 계획](docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 확인하세요. v0.2.2.0은 애니·게임·버추얼 공연, 애니·게임 행사, 아트북·독립출판, 보드게임, 캐릭터·아트, 일러스트 행사를 서브컬처 유형으로 지원합니다. 이 기능의 운영 적용 완료 여부는 해당 커밋의 CI와 배포 수락 결과로 확인합니다.
> 분야별 월별 캘린더와 대표 이미지의 동작은 [프런트 안내](frontend/README.md#routes), 개선 의견 접수와 회원 답변 이력은 [고객지원 안내](docs/support/SUPPORT_AND_ROLES_V12_KO.md#5-고객문의답변비회원)를 확인하세요. 비회원 개선 의견은 접수번호만 제공하며 개별 답변 조회는 지원하지 않습니다.
> 아래 ZIP·manifest·해시는 `BoothHana2-full-v24-gcp-credit-notes-20260921.zip` 패키지에 관한 과거 기록입니다. 현재 Git 작업본의 파일 목록이나 무결성을 나타내지 않습니다.

# BoothHana2 · v24 패키지 이력

2026-09-21. 서울·경기(인천 제외)의 서브컬처·박람회·축제 행사·부스·상품 서비스입니다. v24는 API·스키마·계약·해시 코드리뷰 수정본입니다.

[START_HERE_KO.md](START_HERE_KO.md)부터 확인하세요. [변경 내역](docs/release/V24_CHANGES_KO.md), [실행 결과](TEST_RESULTS_KO.md), [적용 및 수락](docs/deployment/FULL_V24_KO.md).

프런트·백엔드·수집기를 함께 반영합니다. 추가 SQL은 없으며 SQL001~016과 의존성/잠금 파일을 유지합니다. 제품 회귀54개/검증도구15개 및 기존 독립·수집기 검사는 통과했지만 실빌드·HTTP·PostgreSQL·모바일 검증은 미완료입니다. **운영 배포 승인 false, 실환경 게이트 NOT_READY입니다.**

v24 코드 릴리스 기준은 RELEASE_V24.json과 CHANGE_MANIFEST_V24.json입니다. 문서 보완 후 현재 전체 파일 기준은 SHA256SUMS.txt이며, 문서 패키지 정보/변경 목록은 위 안내를 사용합니다. 파일 수·해시는 완성 ZIP의 외부 package_check.json에서 확인합니다. 과거 REVIEW/PRODUCTION_REVIEW 해시 목록과 보고서는 docs/history/legacy-package-manifests로 이동했습니다. 과거 release·preview·results는 현재 성공 근거가 아닙니다.
