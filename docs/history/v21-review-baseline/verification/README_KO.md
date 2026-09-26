# 현재 검증 안내 · v21

루트에서 `python verification/run_checks.py`를 실행합니다. v21 신규26개 시나리오, 기존 v20 및 이전 회귀, 지원/거래 폼 검사, 수집기170개 검사를 포함합니다. 중첩 실행을 고유 검사 수로 합산하지 않습니다.

실제 제품 모듈을 실행하지만 일부 React/Router/HTTP/Spring/JDBC/JSON/저장소 경계에 명시적 대역을 사용합니다. 전체 프레임워크 빌드·PostgreSQL·브라우저·모바일 검증의 대체가 아닙니다.

현재 로그는 `v21/results/`, 실제 환경 게이트는 `python verification/v21/release_gate.py`입니다. 전용 로컬 DB 준비는 기존 v18 도구를 사용하며 운영/공유 DB를 넣으면 안 됩니다. 릴리스 게이트는 새 판매 철회 SQL 테스트가 실패·누락·skip된 경우 통과시키지 않습니다. CI는 실제 배포를 수행하지 않습니다.

[실제 결과](../TEST_RESULTS_KO.md) · [적용 절차](../docs/deployment/FULL_V21_KO.md) · [과거 검증 안내](../docs/history/v20-review-baseline/verification/README_KO.md).
