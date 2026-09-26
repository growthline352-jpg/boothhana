# v12 배포 안내 — 실제 DB는 미적용

## 1. 배포 전 구분

이 패키지는 전체 소스이며 v11과 비교해 신고/문의·업체 관계·로그인/신청 흐름을 변경했다. **새 SQL과 환경변수가 있으므로 v11 프런트만 교체하면 안 된다.** 외부 DB·호스팅·Kakao·R2·스케줄을 작성 과정에서 변경하지 않았다.

먼저 [DB 검토 체크리스트](V12_DATABASE_REVIEW_KO.md)를 실제 담당자가 채운다. 기존 readiness는 필수 SQL012가 없으면 503, event_booth.version이 없으면 JPA검증 오류가 날 수 있다. 이를 피하려 readiness를 항상200으로 바꾸지 않는다.

## 2. 적용 순서

1. 운영/스테이징 대상, 최신 Git·DB backup, 복원 방법과 담당자 확인.
2. 배치와 동시 관리자 변경을 멈추고 실행중 요청을 종료할 배포 시간 확보.
3. 읽기 전용 점검 `verification/v12/db_preflight_readonly.sql`을 별도 SQL Editor/psql에서 확인. 조회 결과에도 내부 권한 정보가 있으므로 공개 게시하지 않는다.
4. 실제 미적용 SQL을 순서대로 적용. v11까지면012만. SQL은 자동 실행기가 없고 각 파일의 트랜잭션/순서를 유지한다.
5. 같은 세션에서 `boothhana.backend_role`을 실제 기존 JDBC역할로 지정한 뒤012 실행. 비밀 비밀번호를 명령에 넣지 않는다. 현재 SQL실행 역할과 실제 JDBC역할이 같은 경우 별도 지정이 불필요할 수 있으나 확인해야 한다.
6. 프런트/백엔드 전체 빌드·테스트 후 함께 배포. backend/.env.example을 참고하고 기존 실제 값은 보존한다.
7. `/api/public/health/live`, `/api/public/health/ready`, ADMIN의 `/api/admin/health/readiness`와 신규 흐름 smoke.
8. 첨부·비회원은 기본 false로 일반 회원 문의 먼저 검증 후 각각 활성화.
9. 팬·업체·ADMIN 2개 계정과 소유권 차단, 정정 공개·지도 폐기 여부 검증.
10. 정상 확인 후 기존 스케줄을 재활성화. 수집기·스케줄 파일을 변경하지 않아 새 예약 등록이 필요하지 않다.

## 3. 환경 설정

| 변수 | 적용 서버 | 역할/필수 조건 |
|---|---|---|
| `SUPPORT_GUEST_ENABLED=false` | 백엔드 | 비회원 ACCOUNT 문의만. true는 아래 준비 후 사용 |
| `SUPPORT_RATE_SECRET=` | 백엔드 | guest=true일 때32자 이상 난수. 토큰에 이메일/전화번호를 쓰지 않는다 |
| `SUPPORT_ATTACHMENTS_ENABLED=false` | 백엔드 | private bucket 점검 후 true |
| `SUPPORT_PRIVATE_BUCKET=` | 백엔드 | 별도 R2 버킷, 기존 public 이미지 버킷과 달라야 함 |
| 기존 `R2_*` 자격증명 | 백엔드 | 기존 공개 이미지용과 별개로 private 버킷에도 필요한 read/write 권한. 브라우저/collector에 제공 금지 |
| 기존 Kakao/FRONTEND_URL/ALLOWED_ORIGINS/session 설정 | 백엔드 | 변경하지 않되 로그인 후 복귀/CSRF와 새 페이지 검증 |

private bucket은 R2.dev·custom public domain을 연결하지 않고 public R2_PUBLIC_URL을 만들지 않는다. prefix의 이름만 private이라고 비공개가 되는 것은 아니다. 서버는 버킷명이 다름을 확인하지만 Cloudflare 관리콘솔의 외부 공개 설정까지 자동 검증하지 못한다. **테스트 객체가 인증 없이 열리지 않는지 운영자가 직접 확인**해야 한다.

회원 첨부 없이도 본문/공개근거링크 접수·답변은 사용 가능하다. 비회원 기능이 꺼져 있으면 로그인 장애 사용자의 접수는 불가능하므로 실제 오픈 전에 비회원 준비를 마치거나 운영팀의 별도 연락 수단을 결정해야 한다. 존재하지 않는 이메일주소를 소스에 넣지 않았다.

## 4. 빌드·기본 검사

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

프로젝트가 선언한 의존성 버전을 사용한다. 이 작성 환경에서는 다운로드 DNS/설치된 타입 부재로 전체 빌드를 완료하지 못했다. `verification`의 stub·순수 규칙·정적 화면 성공을 실제 프레임워크 빌드로 대체하지 않는다.

```powershell
# 저장소 루트 — 운영 DB/계정 없이 독립 검사
python verification/v12/run_checks.py
# 기존 회귀검사 별도
python verification/run_checks.py
python verification/v11/run_checks.py
```

## 5. 배포 수락 기준 (전부 실제 환경에서 체크)

- [ ] 본인 신고/문의만 조회, B계정의 UUID로도404. CREATOR/ADMIN 권한 차이 확인.
- [ ] 일반사용자·수집토큰으로 관리자/내부메모/첨부 접근 불가. CSRF 없는 쓰기 거절.
- [ ] 공개 행사/부스/상품/이미지/지도영역에서 올바른 namespace·parentID·day/hall/version 연결.
- [ ] 원문 사라진 경우 일반문의대안, 타인예약 연결 거절, client snapshot을 사실로 사용하지 않음.
- [ ] 동일 requestId+같은내용 재전송 한건, 다른내용409, 동시답변/심사 revision충돌.
- [ ] 답변 완료와 내부메모구분, 자기담당지정이 처리결과를 초기화하지 않음.
- [ ] 신고 정정·공개는 대상내용변화확인 후 완료. 같은내용재발행/공개실패는 완료금지. 공동행사 다른검토본도 함께공개될수있음 확인.
- [ ] 임시비공개 후 사용자조회차단, 다음배치에 기존 overrides/EXCLUDED/권리철회가 유지됨.
- [ ] 지도수정·철회/다른날다른부스번호의 공개상태확인. 티켓완료로 새지도자동승인금지.
- [ ] 자기 관리권 승인 거절, 다른관리자 승인/반려/추가정보, 업체관계회수시 담당계정통지·이력.
- [ ] 공동부스 일부인증으로 전체편집/타인신고/예약/POS를 열지 않음.
- [ ] DRAFT가 일반 업체행사API에 노출되지 않음; 반려사유·재신청·대기철회·경합승인검사.
- [ ] 로그인 복귀 정상/외부URL거절/10분만료/여러탭/취소후 재시도. 본문·비밀키URL없음.
- [ ] member private첨부 크기/헤더/hash/owner체크; 버킷공개URL없음; 권한없는계정download거절; 오류재시도와본문보존.
- [ ] guest 키 원문DB/URL/로그없음, 잘못된키·30일만료 및 생성 재전송조회차단, 키분실안내, 자동메일미제공 확인.
- [ ] rate한도/HTTP413/시간초과/DB죽음/스토리지실패에 원문·토큰·이메일이 오류로그에남지 않음.
- [ ] 모바일320/390과 PC에서 실제 작성·저장·뒤로가기·첨부·키파일보관·미저장이탈 확인.

## 6. 운영 제한/보관/복구

HTTP JSON은128KiB, raw첨부는5MiB를 서버에서 확인한다. 별도 reverseproxy의 요청크기/읽기시간/동시요청 제한과 edge rate 정책이 필요하다. `forward-headers-strategy: framework`를 쓰므로 외부 Forwarded헤더를 프록시가 정리하고 신뢰 가능한 홉만 유지하도록 설정한다. guest의 원격IP 기반 한도는 이것을 대신하지 않는다.

rate counter는 REQUIRES_NEW 별도 트랜잭션으로 실패 요청도 기록한다. 외부 티켓 트랜잭션이 커넥션을 쥔 채 호출하므로 연결풀/동시요청 예산을 검토한다. 최소 하나의 추가 커넥션이 필요하며 전체 동시성보다 여유를 두어 스테이징에서 대기·풀고갈을 확인한다.

소스에는 자동 접수 삭제/첨부 정리/메일발송 job이 없다. 30일 guest조회만료를 보관기간으로 혼동하지 않는다. 실제 보관·삭제 정책과 첨부 고아객체·rate행 정리 절차를 결정한다. 티켓/claim/audit FK를 무시하고 계정·내역을 임의삭제하지 않는다.

코드 롤백은 프런트/백엔드를 함께 한다. SQL012 추가 테이블은 즉시 삭제하지 않는다. 구버전은 새 신고/답변을 보지 못하고 개인정보/수집지원흐름이 사라지므로 운영 공지가 필요하다. 권한문제를 해결하려 anon/authenticated를 다시전체허용하지 않는다. private bucket·키·접수데이터 백업은 원본 공개이미지와 별도 관리한다.
