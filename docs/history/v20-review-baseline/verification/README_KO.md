# v10 추가 디자인 검사

`python verification/v10/run_checks.py`로 소스/색상/CSS/로컬 타입 계약을 확인합니다. `preview/v10/index.html`은 실제 앱이 아닌 가상 정적 시안입니다. 전체 상세는 루트 `TEST_RESULTS_KO.md`를 읽으세요. 아래는 이전 버전의 검사 안내입니다.

---

# 검증 실행

루트에서 `python verification/run_checks.py`를 실행합니다. 기존 회귀와 새 v7 source/handler/banner-service 검사를 포함합니다. Python3.11+, Node, Java21, TypeScript 모듈이 필요합니다. TypeScript 탐색은 기존 frontend/node_modules 또는 TYPESCRIPT_MODULE/설치된 전역 모듈을 사용합니다.

검사는 실제 source 파일을 사용하지만 외부 React/Router/Spring/JDBC/Jackson/AWS 라이브러리는 일부 검사에서 명시적 stub/fake입니다. 이 결과를 전체 빌드·실제 DB 동시성 성공으로 해석하지 마세요.

## 선택: v7 native modal 브라우저 검사

Playwright/Pillow와 Chromium이 설치된 검증 환경에서 실행합니다. 앱 런타임 의존성 추가가 아닙니다.

```bash
node verification/v7/render_browser_fixture.cjs
python verification/v7/browser_checks.py
```

브라우저는 CHROMIUM_EXECUTABLE, PATH의 chromium, 또는 Playwright의 기본 설치 브라우저를 사용합니다. 파일 URL 정책을 피하기 위해 가상 HTML을 set_content로 로드하며, 가상 이미지 요청만 intercept하여 로컬 바이트로 응답합니다. 실제 네트워크/로그인/DB는 사용하지 않습니다.

`verification/v7/results/browser-fixture.html`은 source JSX/CSS로 생성한 가상 데이터입니다. 실제 React가 hydration하지 않으며, 브라우저 fixture glue가 실제 dialogLifecycle 함수를 실행하는 검사입니다. source 핸들러 검사는 별도 test_review.cjs/test_banner_ui.cjs로 합니다.

기존 카테고리 정적 미리보기 재생성: `node verification/v6/render_preview.cjs preview/category-preview.html`.

새 PostgreSQL8개를 포함한 CatalogPostgresTests는 **전용 로컬 DB의 public schema를 초기화하는 opt-in**입니다. 실행 전 `docs/deployment/FULL_V7_KO.md`를 반드시 확인하세요.

실제 실행 및 미실행 기록: 루트 TEST_RESULTS_KO.md. v4~v6 results/는 해당 버전 과거 로그이며, v7 새 실행은 verification/v7/results/입니다.
