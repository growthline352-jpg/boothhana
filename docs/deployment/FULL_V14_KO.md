# v14 실제 빌드·전체 DB·CI 검증

여기 적힌 통합 절차는 **실행해야 할 기준**입니다. 작성 환경에서 실제 의존성 빌드·PostgreSQL·외부 연동을 통과했다는 보고가 아닙니다.

## 1. 필요한 환경

Java21, Node22, pnpm10(제공 CI는10.13.1), Python3.11+, PostgreSQL16+ 서버와 psql 클라이언트. 운영 의존성은 원래 package.json/build.gradle/lockfile 그대로 유지했습니다. 설치가 실패하면 임의 하향 변경 또는 테스트 stub을 애플리케이션에 복사하지 마세요.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
./gradlew.bat test
./gradlew.bat bootJar
```

## 2. 실제 전체 스키마 테스트 DB 준비

운영과 완전히 분리된 **새 로컬 PostgreSQL 클러스터**를 준비합니다. `boothhana_release_test`, `boothhana_support_test` 두 DB를 만들고 실제 테스트 접속정보를 환경변수로 설정합니다. 실사용 데이터를 넣지 않으며, 운영으로 이어지는 터널은 금지입니다.

```bash
# Linux 예시. 비밀번호 값은 비공개 로컬 환경에서 준비하고 Git/공유 로그에 넣지 않습니다.
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
# PGPASSWORD = 테스트 클러스터 관리자 비밀번호
# BOOTH_FULL_TEST_PASSWORD = 테스트 전용 runtime 비밀번호
createdb boothhana_release_test
createdb boothhana_support_test
PGDATABASE=boothhana_release_test python verification/v14/prepare_test_db.py --confirm-isolated-empty-test-cluster
```

준비기는 실제 SQL001~014를 번호순으로 실행합니다. 서버용 `boothhana_release_runtime`은 superuser/BYPASSRLS가 아닌 전용 역할이며, anon/authenticated는 직접 테이블 접근이 금지된 테스트 역할입니다. 기존 역할·데이터가 있으면 중단하므로 다른 앱이 있는 클러스터에서 강제 실행하지 마세요. 실패한 클러스터는 원인을 확인한 후 새 테스트 환경으로 다시 만드세요.

Windows PowerShell에서도 psql/createdb가 PATH에 있는 상태로 `$env:PGHOST` 등의 값을 설정한 뒤 같은 Python 경로 명령을 사용할 수 있습니다. 특수 제어문자 없는 슬래시 경로를 사용합니다.

## 3. 통합 게이트

아래 환경변수를 **테스트 전용 값**으로 설정합니다.

```text
BOOTH_FULL_TEST_URL=jdbc:postgresql://127.0.0.1:5432/boothhana_release_test
BOOTH_FULL_TEST_USER=boothhana_release_runtime
BOOTH_FULL_TEST_PASSWORD=<테스트 runtime 비밀번호>
BOOTH_SUPPORT_TEST_URL=jdbc:postgresql://127.0.0.1:5432/boothhana_support_test
BOOTH_SUPPORT_TEST_USER=<support 테스트 스키마 생성 가능한 테스트 역할>
BOOTH_SUPPORT_TEST_PASSWORD=<테스트 비밀번호>
```

```powershell
# 저장소 루트
python verification/v14/release_gate.py
```

게이트: frozen install→프런트 lint/build→수집기 로컬 회귀→Gradle clean test→**full-app14개+support8개 JUnit 결과의 실패/건너뜀0·최신성 확인**→bootJar.

full-app은 실제 Spring 전체 컨텍스트·실제 HTTP 및 MockMvc 보안 계층·실제 JPA/JDBC를 사용하도록 작성했습니다. MockMvc의 테스트 사용자 주입은 실제 Kakao 인증을 대체하지 않으며, real HTTP 검사도 공개 readiness/미인증 경계의 범위입니다. OAuth·R2·Codex·실물 브라우저를 이 테스트에서 성공한 것으로 만들지 않습니다.

최종 문구는 `AUTOMATED CHECKS PASSED`입니다. **운영 승인이라는 문구는 반환하지 않습니다.** 별도 사용자 과업·외부 서비스·부하·복구 검토가 남습니다.

## 4. 실제환경용 테스트14개

1. 41개 스키마 조회, RLS·일반 API 역할 권한·최소권한 JDBC 확인
2. 예약 같은 요청 재전송 → 거래·재고·receipt 1회
3. POS 같은 요청 재전송 → 1회
4. 같은 ID/다른 입력 거절
5. 새 ID의 정상 반복 판매 허용
6. 외부 트랜잭션 실패 → JPA 거래·재고·JDBC receipt 전부 롤백
7. 동시 같은 요청 → 1회 커밋
8. 취소한 예약의 재전송 → 새 예약/재고 차감 없음
9. 타인 receipt 비노출
10. 실제 서버의 미인증 차단 및 HTTP CSRF 경계
11. HTTP requestId 누락400 및 정상 요청 재전송
12. 지원 요청 façade가 기존 업무 트랜잭션 안에서 호출되는 것을 거절
13. 작은 풀에서 지원 요청 여러 건 완료
14. 실제 전체 스키마로 공개 readiness 확인

## 5. CI와 배포 연결

`.github/workflows/release-verification.yml`은 새 임시 PostgreSQL16·두 테스트 DB를 준비하고 위 게이트를 실행합니다. workflow 안의 비밀번호는 **격리 CI DB 전용**이며 운영용 비밀정보가 아닙니다. 운영/카카오/R2 토큰을 이 CI에 넣지 않습니다.

- [ ] 저장소에 workflow를 반영하고 실제 같은 커밋에서 성공했는지 확인.
- [ ] `full-schema-and-app` 작업을 보호 브랜치의 필수 상태 검사로 지정.
- [ ] Render/Vercel 자동배포가 필수 검사보다 먼저 실행되지 않도록 호스팅 설정 검토.
- [ ] 운영 환경의 별도 승인·복구 절차, 외부 스테이징 수락 기록을 릴리스 SHA와 연결.
- [ ] 필요하면 공급망 정책에 맞춰 Actions·이미지를 검증된 SHA/digest로 고정.

Dockerfile에도 기본 test를 추가했지만, opt-in DB 변수가 없는 컨테이너 빌드의 test만으로 통합 테스트가 실행되지는 않습니다. **CI와 별도 스테이징 검증을 건너뛰는 대안이 아닙니다.** 이 작업은 GitHub 설정·호스팅·배포를 직접 변경하지 않았습니다.

## 6. 별도 운영 승인 필수

실제 Kakao 로그인/복귀/CSRF, private R2와 첨부 권한·취소·응답 유실, 실제 Codex 조사/배치도 인식·스케줄, PC/iOS/Android 거래 복구·뒤로가기·모달·개인정보 비노출, 운영과 같은 풀·인스턴스·프록시 설정의 부하, 알림·백업복원·롤백을 실제로 확인해야 합니다. 검증된 처리량/허용 지연 목표는 운영자가 정하며 여기서 추정하지 않습니다.

공식 참고:
- https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html
- https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/JpaTransactionManager.html
- https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
- https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers

[DB 검토표](V14_DATABASE_REVIEW_KO.md) · [이번 실제 결과](../../TEST_RESULTS_KO.md)
