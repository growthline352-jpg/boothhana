# v17 적용·검증 절차

현재 소스 상태는 `START_HERE_KO.md`, 실제 실행 결과는 `TEST_RESULTS_KO.md`를 우선합니다. 아래 명령은 적용 환경에서 수행할 절차이며 이미 운영에서 실행됐다는 뜻이 아닙니다.

## 1. 보존과 DB

기존 코드·DB·업로드 파일·환경변수·수집기 인증을 백업합니다. 새 브랜치에서 반영하고 `.env`와 로컬 인증은 보존합니다. SQL015까지 적용돼 있다면 추가 migration은 없습니다. SQL016은 없습니다. 기존 DB 세부 정책은 `V16_DATABASE_REVIEW_KO.md`에 유지돼 있습니다.

의존성 잠금 파일을 삭제하거나 임의의 구버전으로 바꿔 빌드 성공처럼 처리하지 않습니다. Node 22/Java21 및 현재 잠금 파일의 라이브러리가 설치되는 환경에서 검증해야 합니다.

## 2. 빠른 독립 검사

저장소 루트:

```sh
python verification/v17/run_checks.py
cd collector
python -m unittest discover -s tests -v
```

이 경로의 일부 React/Router/JDBC는 명시적 대역입니다. 실제 빌드·운영 승인과 구분합니다.

## 3. 실제 의존성·브라우저·DB 통합 게이트

`.github/workflows/release-verification.yml`은 격리 PostgreSQL, Node22, Java21, Python, pnpm10.13.1, Playwright1.57.0/Chromium 설치와 v17 게이트를 정의합니다. 실제 저장소에 적용하고 필요한 검사로 지정하는 것은 운영자의 별도 작업입니다.

실제 DB 게이트는 다음의 **전용 localhost 테스트 DB만** 허용합니다. 운영 DB를 localhost로 포워딩해서 사용해서는 안 됩니다.

- `BOOTH_FULL_TEST_URL=jdbc:postgresql://127.0.0.1:5432/boothhana_release_test`, 별도 USER/PASSWORD
- `BOOTH_SUPPORT_TEST_URL=jdbc:postgresql://127.0.0.1:5432/boothhana_support_test`, 별도 USER/PASSWORD

SQL 준비는 기존 `verification/v15/prepare_test_db.py --confirm-isolated-empty-test-cluster`를 사용합니다. 빈 격리 클러스터만 허용합니다. 정확한 CI 변수/role 구성은 workflow 파일을 따릅니다. 이후 저장소 루트에서:

```sh
python verification/v17/release_gate.py
```

게이트는 frozen install → lint/build → 회귀 검사 → 실제 React/Chromium 모의 API 검사 → hosting 템플릿 준비 → 수집기 검사 → 실제 Gradle/PostgreSQL 통합 테스트 → 새 JUnit 보고서 확인 → bootJar 순서입니다. 새 보고서의 실패/오류/skip이나 필요한 suite 누락은 모두 차단합니다. 이전 성공 파일을 재사용하지 않습니다. 자동 게이트가 통과해도 실서비스 OAuth/R2/Codex·모바일·부하·운영 수락은 별개입니다.

브라우저 검사만 재실행할 때는 frontend에서 `pnpm run build`를 다시 수행한 뒤 루트에서 `python verification/v17/browser_drafts.py`를 실행합니다. hosting 준비 후에는 `dist/index.html`이 이동되었으므로 일반 build가 먼저 필요합니다. 모의 API는 테스트 브라우저 안에서만 사용됩니다.

## 4. 프런트/메타 환경변수

| 변수 | 위치 | 값 |
|---|---|---|
| VITE_API_BASE_URL | 빌드 시 프런트 | 사용자의 실제 백엔드 원점 |
| VITE_PUBLIC_SITE_URL | 빌드 시 프런트 | 실제 공개 HTTPS 원점, 경로·query 없음 |
| PUBLIC_SITE_URL | Node HTML 함수 | VITE_PUBLIC_SITE_URL과 동일 |
| SEO_API_BASE_URL | Node HTML 함수 | 공개 catalog API를 가진 실제 백엔드 원점 |

비밀키를 VITE_ 변수에 넣지 않습니다. Preview는 PUBLIC_SITE_URL/VITE_PUBLIC_SITE_URL을 비워 noindex로 유지할 수 있습니다. 미설정은 운영 준비 완료가 아닙니다. 검색·공유 도메인을 추정하거나 `example` 주소를 운영에 사용하지 않습니다.

## 5. Vercel

프로젝트 Root Directory는 `frontend`, Output Directory는 `dist`, Node runtime 사용. `frontend/vercel.json`의 Build Command `pnpm run build:hosting`을 사용합니다. 이 명령은 일반 빌드 이후 템플릿을 `seo-template/index.html`로 옮기고 `dist/index.html`을 제거합니다. Vercel 함수 `api/page.mjs`에 해당 템플릿이 includeFiles로 포함돼야 합니다.

프런트의 API 함수·공유 metadata 모듈·템플릿과 정적 assets를 함께 배포해야 합니다. **dist 폴더만 정적 호스팅에 복사하는 배포로는 서버 메타 기능이 작동하지 않습니다.** 다른 호스팅을 사용하면 동일한 server renderer 연결이 필요합니다. 현재 패키지에서 다른 제공자의 배포까지 구현·검증한 것은 아닙니다.

실제 배포 프리뷰에서 JavaScript를 실행하지 않은 응답 본문을 확인합니다. 공개 행사 `/discover/실제ID`에 올바른 title/description/OG/canonical이 있어야 하고 canonical에는 day/my 등의 query가 없어야 합니다. `/`도 서버 메타를 거쳐야 합니다. `/assets/...js`는 HTML이 아닌 JavaScript로, 이미지도 올바른 Content-Type으로 내려와야 합니다. 계정 화면은 noindex이고 다른 사용자 정보가 포함되면 안 됩니다. 권리 철회·행사 공개 철회 후 새 요청에서 이전 제목/이미지가 남지 않는지 확인합니다. Node renderer의 단위검사는 통과했지만 이 실제 hosting 검사는 별도입니다.

## 6. 읽기 전용 성능 표본

`verification/v17/library_probe.py`는 콘텐츠 생성/수정/삭제를 하지 않습니다. `/api/auth/csrf` 및 공개 resolve를 사용하고, 회원 검사는 Cookie 환경변수와 기존 500개 테스트 기록을 요구합니다. 응답 본문·메모·Cookie·토큰은 결과 파일에 기록하지 않습니다. 기본 localhost, 명시적 `--allow-staging`을 넣은 승인된 HTTPS staging만 추가 허용합니다. 운영 데이터에 부하를 가하지 않습니다.

실제로 공개된 서로 다른 200개 대상을 아래 형식의 배열 JSON 파일에 준비합니다. ID는 테스트 DB에 존재하는 실제 값으로 넣으며 임의 값으로 성공을 주장하지 않습니다.

```json
[{"type":"EVENT","eventId":1,"id":1,"participantId":null}]
```

위 한 항목은 구조 예시일 뿐이며 실제 파일에는 서로 다른 유효 대상 200개 이상이 필요합니다. 참가 부스는 `type=PARTICIPANT`, `participantId=id`, 상품은 `type=PRODUCT`와 실제 상위 참가 부스 ID를 사용합니다.

```sh
python verification/v17/library_probe.py --base http://127.0.0.1:8080 --targets /safe/path/targets.json --confirm-read-only --runs 10 --concurrency 4 --out library-probe.json
```

회원 500개 검사는 전용 테스트 계정의 Cookie를 `BOOTH_BENCH_COOKIE` 환경변수로 설정한 뒤 `--member500`을 추가합니다. 명령행·Git·대화에 Cookie를 남기지 않습니다. 1/24/200 대상의 p50/p95/응답 크기/오류율과 회원 처음/마지막 페이지를 측정합니다. 429 등 오류가 있으면 수치만 보고 개선으로 평가하지 않습니다. 이 도구는 SQL 실행계획/DB 비용 측정을 대신하지 않습니다.

## 7. 배포 승인

`docs/quality/V17_ACCEPTANCE_KO.md`의 실제 행사 1개 완주와 보안·운영 검토를 수행합니다. 완료되지 않은 항목을 완료로 체크하지 않습니다. 문제 발생 시 v16 코드로 rollback 가능하나 SQL 변경이 없다고 DB 백업을 생략하지 않습니다. 실제 사용자 데이터와 외부 권한은 별도로 관리합니다.
