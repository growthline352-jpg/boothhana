# 현재 검사: v24

`python verification/run_checks.py`가 독립 검사를 실행합니다. 실배포 게이트는 `python verification/v24/release_gate.py`입니다. 원본 매핑/필드/DDL 자동대조는 `v24/audit_contracts.py`, 완성 ZIP 검사는 `v24/verify_package.py`입니다.

실행 범위, 미실행 경계와 원본/수정 차이는 최상위 `TEST_RESULTS_KO.md`, `v24/results/comparison.json`, `docs/release/V24_CHANGES_KO.md`를 확인하세요. 정적 AST와 테스트 대역은 실제 HTTP·DB 연결을 대신하지 않습니다.
