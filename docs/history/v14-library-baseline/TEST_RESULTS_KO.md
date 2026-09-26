# v14 실제 검증 결과 · 2026-09-17

## 기준과 한계

실제 확보된 v13 운영배포 검토 ZIP에 수정한 작업 사본에서 실행했습니다. 이전 회차에서 존재를 확인하지 못한 v14 결과·파일수를 재사용하지 않았습니다. 운영 DB·GitHub·배포·예약 작업에 접속해 변경하지 않았습니다.

## 이번 코드에서 완료한 독립 검사

| 검사 | 결과 | 검증 경계 |
|---|---|---|
| v14 집중 검증 실행기 | **종료코드0** | `verification/v14/results/focused-final.log` |
| 기존 지원 서비스 | **49개 조건 통과** | 실제 메서드+가짜 JDBC/JSON registry/private storage |
| v13 지원 안정성 | **24개 조건 및 거절 대조 통과** | 실제 메서드, Spring 프록시/SQL 실행 아님 |
| 신규 실제 내용·요청 순서·첨부 단계 | **21개 조건 및 거절 대조 통과** | 가격/위치와 시간 구분, 관련 없는 변경 거절, 과거 증거 보존, 순서 확인 |
| 신규 거래 규칙·receipt | **18개 조건 통과** | 실제 규칙/서비스, scripted JDBC |
| 예약·POS 생성 본문 | **동일 요청 재전송 1회 반영 확인** | 실제 메서드 본문 추출+재고 규칙+요청서비스. 메모리 저장소. 동시성/SQL 커밋을 실행한 것은 아님 |
| 신규 거래 복구 상태·훅·UI | **26개 조건 통과** | 최초ID 유지, 입력동결, receipt, 새로고침·계정/부스 분리, 모의 React 훅/API |
| 배포 게이트의 미설정·실패·생략·오래된 보고서 방어 | **9개 테스트 통과** | 가상 XML과 테스트 환경변수, 실제 빌드 성공 아님 |
| 기존 접수 복구·지원 UI | **29개 / 55개 조건 통과** | 실제 TSX 핸들러+모의 훅 |
| 수집기 | **170개 테스트 통과** | 기존 루트 실행기 앞 단계 완주. 가짜 CLI·로컬 모의 API |
| 기존 API·조회·카탈로그·일정·지도·방문·굿즈 | **각 독립 단계 통과** | 로그별 경계는 아래 참고. 실제 앱 E2E 아님 |
| 기존 디자인/내비게이션·대비 계약 | **62개 조건 통과** | 소스 JSX·선정 색상, 브라우저 전체 접근성 인증 아님 |
| TS/TSX 전체 구문 | **77개 파일 통과** | 실제 외부 라이브러리 전체 타입/번들 검사 아님 |
| Java 전체 구문 | **121개 파일 통과** | 새 JUnit 포함, 외부 프레임워크 타입 해석 아님 |
| 지원·거래·화면의 로컬 타입 연결 | **통과** | React/Router/Spring/JDBC는 명시적 테스트 stub |
| 새 Python 및 CI YAML 구문 | **통과** | CI 실제 실행은 아님 |

### 거래 재전송 검사 결과

동일 예약 또는 POS 요청 ID로2회 생성 본문을 실행한 결과 **거래1건·요청결과1건·재고10→8**이었습니다. 같은ID에 다른수량/결제수단은409이며 추가 차감하지 않았습니다. 다른UUID로 의도한 새POS를 생성하면 별도 거래로 인정해 재고6이 됐습니다. 검사용 생성자·기본 공개/소유 조건은 fixture이므로 실제 HTTP/DB/동시성 성공으로 해석하지 않습니다.

### 실제 실행 로그

- 신규 집중검사: `verification/v14/results/focused-final.log`
- 내용·거래 서비스: `java-v14-final.log`, 실제 생성 본문: `trade-bodies-final.log`
- 신규 클라이언트: `trade-ui-final.log`; v12~v13 지원 전체: `support-final.log`
- 앞 단계 회귀와 수집기: `base-regression.log`
- 완료한 나머지 회귀: `banner.log`, `floorplan-final.log`, `visit.log`, `goods-final.log`, `design-final.log`
- 배포 게이트 방어: `gate-unit.log`, `release-gate-refusal.log`
- 실제 빌드 실패: `frontend-build.log`, `backend-build.log`

기존 루트 실행기는 제한시간 때문에 배너 단계에서 중단됐습니다. 이미 완료된 결과를 보존하고 남은 검사를 별도 실행했습니다. **루트 실행기 한 번 완주로 표현하지 않습니다.** 신규 v14 집중 실행기는 실제 종료0으로 완주했습니다.

초기 테스트 실패 중에는 과거 fake HttpStatus에 value()가 없는 계약 누락, 새테이블 개수에 맞지 않는 assert, v12에서 추가한 고객지원 메뉴가 빠진 v10 예상값, 메서드 추출 검사의 JDBC callback stub 누락이 있었습니다. 애플리케이션에 대역을 넣지 않고 명시적 테스트 경계만 현 계약에 맞춘 뒤 최종 검사에 통과했습니다. 초기 실패 로그도 남기며 최종 로그와 구분합니다.

## 실제 시도한 전체 빌드 — 실패

- `npm run build --prefix frontend`: vite/client·node 타입 의존성이 설치되어 있지 않아 TS2688. 실제 Vite 번들·React/Router 전체 타입 검사를 완료하지 못했습니다.
- `sh gradlew test --no-daemon`: services.gradle.org DNS 오류로 Gradle 배포 다운로드 실패. 실제 Spring 컴파일·JUnit에 진입하지 못했습니다.
- npm/Maven/Gradle 호스트 DNS 확인도 실패했으며 PostgreSQL/psql/Docker 실행 환경은 없었습니다.
- `python verification/v14/release_gate.py`: 전용 테스트 DB 설정이 없어 **예상대로 NOT READY/exit2**. 통합 검사 통과가 아닙니다.

## 작성·구문 확인만 하고 실행하지 못한 것

새 full-app14개 테스트와 기존 support8개 테스트는 실제 SQL001~014/전체 Spring·작은풀·JPA/JDBC·HTTP 검증용으로 준비했습니다. 전체 의존성 및 DB가 없어 **실행하지 않았습니다**. `prepare_test_db.py`와 CI의 실제 SQL 적용, CI cloud 실행도 하지 않았습니다.

실제 Kakao 로그인·인증·CSRF/쿠키, 실제 private R2/PENDING 재시도·권한·orphan 정리, actual React 상태·모바일·브라우저 복구, Codex 검색/이미지 분석·스케줄, 부하·복원은 별도 스테이징 검증입니다.

## 재실행

```powershell
# 실제 외부 DB/배포를 하지 않는 독립 검사
python verification/v14/run_checks.py
# 실제 환경은 문서대로 준비한 뒤 — 미설정/스킵은 실패
python verification/v14/release_gate.py
```

[배포 검증 안내](docs/deployment/FULL_V14_KO.md) · [DB 검토](docs/deployment/V14_DATABASE_REVIEW_KO.md) · [변경 내역](docs/release/V14_CHANGES_KO.md)

**판정: 소스 수정·독립 검사·전체 소스 패키징 완료. 실제 운영배포 승인 아님.** 숫자나 압축 무결성은 코드 커버리지·개인정보 안전성·실제 서비스 성공의 보증이 아닙니다.
