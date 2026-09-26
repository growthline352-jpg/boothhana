# 부스하나 v23 · 코드리뷰·사용성 디자인 개선

2026-09-18 · 입력v22 · **운영 배포 승인 아님**

공개 방문자 화면의 탐색·부스 확인·보관함·현장용 내려받기를 정리했습니다. 중첩 창의 스크롤/초점 복원, 개인 부스 필터 해제, 조회중/실패/날짜오류와 빈 결과의 혼동, 페이지 복귀 문제를 보완했습니다. 모바일 하단 이동과 접이식 저장 안내, 명시적인 검색/조건 표시를 추가했습니다.

**제품 변경 프런트11파일. 추가 SQL없음.** 서버·수집기·SQL001~016·의존성/잠금·오프라인 실행 파일·저장 형식 동일. 기존 메모/방문계획/유효한 오프라인자료는 초기화하지 않습니다.

[수정·디자인 내역](docs/release/V23_CHANGES_KO.md) → [이번 검증](TEST_RESULTS_KO.md) → [적용·수락](docs/deployment/FULL_V23_KO.md).

[정적 탐색 미리보기](preview/v23/discovery.html) / [행사상세](preview/v23/detail.html) / [보관함](preview/v23/library.html). 가상자료·실제 JSX/CSS 기반이며 로그인/검색/저장은 미연결입니다.

신규28개와 게이트3개, 이전 회귀·수집기170개 통과. 실제 Chromium 독립 모달3개와 정적 레이아웃16개도 통과했습니다. **정식 빌드·실제 API/DB·앱 브라우저·모바일 검증은 미완료**입니다. 대역·정적 검사를 운영 성공으로 해석하지 마세요.

현재 독립 검사: `python verification/run_checks.py`. 실제 게이트: `python verification/v23/release_gate.py`. 현재 로그: `verification/v23/results/`. 이전 v22 진입문서는 docs/history/v22-review-baseline에 보존했습니다.
