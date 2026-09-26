# 현재 검증 안내 · v22

루트에서 `python verification/run_checks.py`를 실행합니다. 새 제품 회귀22개, 도구3개, 기존 v21 및 이전 연쇄 회귀, 수집기170개 검사를 포함합니다. 실행 횟수나 assertion을 합산해 고유 테스트 수로 부풀리지 않습니다.

실제 모듈을 실행하지만 hooks/JSX/HTTP/JDBC/JSON/저장소 등에 명시적 대역을 사용합니다. 실제 React/DB/브라우저/모바일 검사의 대체가 아닙니다. 신규 도구 검사는 릴리스 보고 상태를 검사할 뿐 실제 빌드를 수행하지 않습니다.

현재 로그는 `v22/results/`, 실제 게이트는 `python verification/v22/release_gate.py`입니다. v21의 SQL 준비·실제 빌드·브라우저 요구사항과 판매 철회 SQL 테스트를 유지하며 신규22개 검사 실패도 차단합니다. 전용 로컬 DB 준비는 v18 도구를 사용합니다. 운영/공유 DB를 넣지 않습니다. CI에 실제 배포 동작은 없습니다.

[실제 결과](../TEST_RESULTS_KO.md) · [적용 절차](../docs/deployment/FULL_V22_KO.md) · [이전 안내](../docs/history/v21-review-baseline/verification/README_KO.md).
