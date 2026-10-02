# 로그인 유지

카카오 로그인은 마지막 요청 이후 30일간 유지합니다. 인증된 요청마다 서버의 유효기간과 브라우저 쿠키의 유효기간을 함께 갱신합니다. 브라우저를 닫거나 API 컨테이너를 교체해도 DB에 저장된 세션을 다시 읽습니다.

## 정책

- 카카오 로그인 성공: 30일 유휴 만료, 영속 SESSION 쿠키.
- 관리자 비밀번호 로그인: 30분 유휴 만료, 브라우저 세션 쿠키. 기존 카카오 세션에서 관리자 로그인으로 전환해도 장기 유지 설정을 제거합니다.
- 로그인 전 OAuth 상태·복귀 경로: 기본 30분 세션. 복귀 경로 자체의 10분 제한도 유지합니다.
- 명시적 로그아웃: CSRF 검증 후 저장된 세션을 즉시 삭제하고 쿠키를 만료합니다. 이미 만료된 세션은 갱신하지 않습니다.
- 쿠키는 API 호스트에만 전송되며 HttpOnly입니다. 운영의 Secure/SameSite 설정을 유지합니다. 프런트엔드 저장소에 인증 토큰을 저장하지 않습니다.
- 브라우저에서 쿠키를 지우거나 30일간 이용하지 않으면 재로그인이 필요합니다.

## 배포

1. 운영 DB를 백업하고 `database/025_persistent_sessions.sql`을 신뢰된 JDBC 역할 기준으로 적용합니다.
2. 새 API를 배포합니다. Spring Session JDBC 스키마 자동 생성은 꺼져 있습니다.
3. readiness 검사에서 세션 테이블·컬럼·RLS를 포함한 전체 스키마를 확인합니다.

기존 메모리 기반 JSESSIONID는 새 저장소로 이관할 수 없으므로 이번 전환 후에는 한 번 다시 로그인해야 합니다. 이후 로그인부터 재배포에도 유지됩니다. 이전 API로 롤백할 경우 새 SESSION 쿠키는 사용되지 않으므로 재로그인이 필요합니다. 추가한 테이블은 이전 API와 충돌하지 않습니다.

세션 테이블에는 인증 정보가 포함됩니다. `booth_session`, `booth_session_attributes`는 신뢰된 서버 역할만 접근하며 public/anon/authenticated 권한을 제거하고 RLS를 적용합니다. 만료된 행은 10분 주기로 정리합니다. 세션 쿠키나 직렬화된 속성을 로그·진단 출력에 노출하지 않습니다.

## 검증

실제 격리 PostgreSQL과 HTTP 테스트로 새 저장소 인스턴스에서 인증 복구, 활동에 따른 쿠키/서버 만료 갱신, 만료 후 401, CSRF 없는 로그아웃 거부, 로그아웃 후 재사용 거부, 테이블 접근 제한을 확인합니다. 관리자 전환 시 짧은 만료시간 복원과 세션 삭제 쿠키도 별도 검증합니다.

구성 근거: [Spring Boot Spring Session](https://docs.spring.io/spring-boot/reference/web/spring-session.html), [Spring Session 쿠키 구성](https://docs.spring.io/spring-session/reference/configuration/common.html).
