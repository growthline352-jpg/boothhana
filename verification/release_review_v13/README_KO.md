# 리뷰 재현 자료

원본 v13 코드는 변경하지 않습니다. 재현 결과의 exit0은 결함을 관측했다는 뜻입니다.

저장소 루트에서 Java21와 Python을 준비한 뒤:

```bash
PYTHONDONTWRITEBYTECODE=1 python verification/release_review_v13/reproduction/run_java_review.py .
PYTHONDONTWRITEBYTECODE=1 python verification/release_review_v13/reproduction/run_trade_replay.py .
```

첫 검사는 실제 SupportTargets/SupportService와 v13이 제공한 명시적인 JDBC/JSON/공개서비스 대역을 사용합니다. 둘째 검사는 실제 생성 메서드 본문을 변경 없이 추출하여 실제 재고 규칙·DTO·엔티티와 실행하고 메모리 저장소·유효한 공개/소유권 조건을 사용합니다.

DB·네트워크·카카오·R2·운영 데이터에 접속하지 않습니다. 실제 프로젝트 의존성 호환·SQL·권한·트랜잭션·HTTP 검사는 별도입니다. 기존 verification/v13/release_gate.py의 설정 누락 거절을 통합검증 통과로 해석하지 마세요.
