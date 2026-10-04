> **현재 코드와 운영 배포 · GitHub/Vercel/Ubuntu/GCS**
>
> v0.3.1.0(PR #51)의 API·수집기·프런트는 2026-10-05 운영에 반영했습니다. 카카오 장소 연동의 활성화 상태와 운영 검색·주변·주소 조회의 200 응답도 확인했습니다. v0.3.1.1은 썸네일 출처별 감사 복구를 추가하며, 수집기 적용 여부는 해당 커밋의 CI·운영 배포 기록으로 확인합니다. 목적별 행사·데이트 일정과 지도·최종 편집·브라우저 저장, 팝업 전용 분류와 공식 이미지 추가 조사는 [일정 안내](docs/ITINERARY_BUILDER_KO.md), [팝업 안내](docs/POPUP_LAUNCH_KO.md), [공개 행사 이미지 보완 절차](collector/IMAGE_REPAIR_KO.md), [변경 내역](CHANGELOG.md)을 확인하세요. 내 일정은 대표 도메인에서 회원·게스트별 최대 20개를 이 브라우저에 저장하며 서버 저장·기기 간 동기화·공유·변경 알림은 아직 지원하지 않습니다.
>
> 현재 운영은 GitHub `main` 기반 Vercel 프런트와 Ubuntu의 BoothHana 전용 API·Cloudflare Tunnel을 사용합니다. 공개 이미지와 비공개 첨부는 Google Cloud Storage를 사용합니다. 변경 배포는 해당 커밋의 CI와 실제 운영 수락검사 결과를 기준으로 확인합니다.
>
> 현재 배포는 [Ubuntu 터널 배포 가이드](deploy/ubuntu/TUNNEL_KO.md)를 따르세요. v0.2.2.0의 서브컬처 행사 유형 확장과 SQL020~021 적용·검증 순서는 [관심분야 검증 및 배포 계획](docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 확인하세요. 분야별 캘린더·대표 이미지는 [프런트 안내](frontend/README.md), 비회원 개선 의견과 회원 답변 이력은 [고객지원 안내](docs/support/SUPPORT_AND_ROLES_V12_KO.md)를 확인하세요. 기존 v24 패키지 기록은 기준 이력이며 현재 작업본의 배포 승인 근거가 아닙니다.
> 아래 ZIP·manifest·해시는 `BoothHana2-full-v24-gcp-credit-notes-20260921.zip` 패키지에 관한 과거 기록입니다. 현재 Git 작업본의 파일 목록이나 무결성을 나타내지 않습니다.

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
