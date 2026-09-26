# v13 스테이징·배포 검증

이번 작업에서 실제 빌드와 PostgreSQL 연결을 완료하지 못했습니다. **아래는 실행해야 할 절차이지 이미 실행됐다는 보고가 아닙니다.**

## 일반 빌드

실제 소스가 선언한 버전·lockfile을 사용합니다. 다운로드가 안 된다고 검증 없이 버전을 내리거나 mock 타입을 서비스 의존성으로 복사하지 마세요.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

Java21, 해당 프런트의 Node/패키지 매니저 환경을 준비합니다. DB 변경은 [DB 검토표](V13_DATABASE_REVIEW_KO.md)의 SQL013을 먼저 검토·적용해야 합니다.

## 별도 실제 Spring/PostgreSQL 회귀

비어 있는 테스트 전용 `boothhana_support_test` DB와 해당 DB 안에서 private 스키마를 만들 수 있는 테스트 역할을 준비합니다. 실제 운영 사용자 데이터는 넣지 않습니다. localhost 운영 포트포워딩도 금지입니다.

```powershell
# 저장소 루트. 접속값은 전용 로컬 테스트 DB의 값만 사용합니다.
$env:BOOTH_SUPPORT_TEST_URL = 'jdbc:postgresql://localhost:5432/boothhana_support_test'
$env:BOOTH_SUPPORT_TEST_USER = '전용_테스트_역할'
$env:BOOTH_SUPPORT_TEST_PASSWORD = '전용_테스트_DB_비밀번호'
python verification/v13/release_gate.py
```

실제 비밀번호는 파일·공유 로그·Git에 넣지 마세요. 다른 파괴적 DB 테스트 환경변수는 이 실행 세션에서 제거해야 합니다. 자세한 이름은 실행기가 안내합니다.

`release_gate.py`는 프런트 lint/build → Gradle test(`--rerun-tasks`) → **실제 DB 회귀 8개 이상, 실패/오류/건너뜀0**의 JUnit XML 확인 → bootJar 순서입니다. DB 설정 누락·잘못된 URL·테스트 생략·결과 누락은 NOT READY로 중단하며 성공으로 표시하지 않습니다. 실제 test report의 이름은 `TEST-com.boothhana.support.SupportReliabilityPostgresTests.xml`입니다.

이 gate는 사용자 DB 마이그레이션이나 배포를 자동 수행하지 않습니다. 통과해도 다음 실제 브라우저/OAuth/R2 수락 검사는 별도입니다.

### 포함한 8개 실제 환경용 테스트 — 이번 환경에서는 미실행

1. 행사 숨김과 신고 완료의 동일 트랜잭션 커밋.
2. 이미 숨겨진 행사 신고의 관리자 상세 조회.
3. 정상 비공개 조회가 외부 트랜잭션을 rollback-only로 만들지 않음.
4. 실제 SQL 제약 실패에서 행사와 티켓 변경 모두 롤백.
5. 대화 상한200과 시스템 안내/일반 메시지의 구분.
6. 대화 상한 상태에서 업체 관리권 회수 커밋.
7. 이미지 보완 OPEN 전환과 동일 업로드 멱등성.
8. 본인 접수 확인·타인 ID 비노출 및 SQL013 재실행/시스템 메시지 제약.

실제 프록시·DB에서 실행하도록 만들었지만 필요한 support 최소 fixture를 사용하는 테스트입니다. 외부 R2·카탈로그 편집 일부·레이트 제한기는 mock 경계입니다. 실제 API나 전체 스키마 인증 통합이라고 주장하지 않습니다.

## 사용자 과업 스테이징 체크

- [ ] 회원 접수 뒤 응답을 의도적으로 끊기 → 편집 잠김 → 본인 receipt 확인 → 원래 접수 열기.
- [ ] receipt 미발견과 최초 요청 지연 저장 경합에서 같은 ID 유지, 신규 티켓 중복 없음.
- [ ] 새로고침 시 sessionStorage에는 UUID만 남고 본문/증거 링크/연락처 없음. 저장 불가 브라우저는 경고함.
- [ ] 일반400 오류 후 수정 가능. 409/5xx/네트워크 오류는 먼저 접수 확인.
- [ ] 회원A가 B의 receipt/detail/첨부를 읽을 수 없음. 관리자 사용자 receipt도 자기 접수만 확인.
- [ ] 지도 신고에서 공개시간만 바꾸면 정정 완료 거절. 좌표·연결·적용일 변경은 감지하고 관리자 의미 판단이 필요함.
- [ ] 구버전 지도 신고는 비교 제한 표시, 실제 숨김은 확인 가능.
- [ ] WAITING_USER에서 사진만 업로드하면 운영팀 확인 상태로 이동. 동일파일 응답 유실 재전송은 중복 상태 변경 없음.
- [ ] 일반 대화200건 후에도 관리권 회수/숨김/종료가 가능하고, 시스템 안내는 내부 메모를 노출하지 않음.
- [ ] 실제 Kakao 로그인/CSRF·쿠키/첨부 비공개 R2·스마트폰 작성/뒤로 가기 정상.
- [ ] `/api/public/health/ready`와 관리자 readiness 확인. 성공이라도 모든 실제 업무 흐름 검증을 대신하지 않음.

## 운영 보존

신고·문의 답변은 사이트 내역에서 조회하며 이메일/SMS를 새로 추가하지 않았습니다. 첨부/비회원 기본 활성 설정·보관 정책은 v12와 같습니다. 수집기 코드는 변경하지 않았으므로 일요일03시/월~토04시 스케줄 재등록이나 새 Codex 인증은 필요하지 않습니다. 업데이트 동안 중지했다면 검증 후 다시 켭니다.

[현재 실행 로그/한계](../../TEST_RESULTS_KO.md) · [v12 전체 준비항목](FULL_V12_KO.md)
