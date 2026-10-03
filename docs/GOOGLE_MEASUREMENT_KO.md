# Google 검색·방문 통계

## Search Console
- 소유 계정: growthline352@gmail.com
- DNS 인증 속성: `sc-domain:boothana.kr` (메인과 하위 도메인 포함)
- Cloudflare 루트 TXT의 `google-site-verification` 레코드를 유지한다.
- 제출 대상: 메인, subculture, expo, festival의 `/sitemap.xml` 4개.
- 제출 성공은 색인이나 검색 순위를 보장하지 않는다. Search Console에서 처리 결과를 확인한다.

## GA4
- Growthline 계정에 기존 Growth와 별개로 `부스하나 (BoothHana)` 속성 생성.
- 웹 스트림: `부스하나 웹 - 전체 분야`, URL `https://boothana.kr`, 스트림 ID `15867005243`.
- 공개 측정 ID: `G-NBLNPS9QHV` (`measurement.ts`). 인증 비밀이 아니며 서버 환경변수 불필요.
- 시간대 대한민국, 통화 KRW. 향상된 측정은 비활성화하여 자동 페이지·검색·폼 수집과 수동 페이지뷰 중복을 방지한다.
- production 4개 호스트의 공개 홈·검색·행사·부스 페이지만 추적한다. Vercel 미리보기, 관리자, 보관함, 예약, 고객센터 등은 제외한다.
- 분석 허용 전에는 Google 스크립트를 로드하지 않는다. 선택은 `boothana.kr`의 Secure·SameSite=Lax 쿠키에 1년간 저장하여 메인·서브컬처·박람회·축제에서 공유한다. 기존 origin별 localStorage 선택은 공유 선택이 없는 경우에만 이전하고, 이후 공유 선택을 우선한다. 쿠키 저장이 막히면 기존 localStorage와 현재 탭 메모리를 사용한다.
- 안내는 선택값이 없는 공개 페이지에서 표시하며 선택 후에는 자동으로 열지 않는다. 푸터 메뉴의 방문 통계 설정에서 다시 열어 철회·변경할 수 있다. 다른 탭에서 바꾼 선택은 탭으로 돌아오거나 경로가 바뀔 때 동기화한다. 브라우저가 저장 데이터를 삭제하거나 저장 자체를 차단하면 재방문 시 안내가 다시 표시될 수 있다.
- 광고 저장·개인화·Google Signals는 사용하지 않는다. 계정 ID, 검색어, 문의, URL 쿼리·해시를 보내지 않는다. 페이지 제목도 정해진 일반 명칭만 전송한다.
- 리퍼러는 이 탭에서 직전에 측정한 공개 URL만 사용한다. 외부 유입 원문/UTM은 수집하지 않으므로 상세 캠페인 분석은 제한된다.
- 페이지뷰는 SPA 경로 변경 시 수동 전송한다. 같은 경로의 필터 변경/StrictMode 재실행은 중복 집계하지 않는다.
- 실시간 보고서로 수신을 확인한다. 광고 차단, 동의 거부, 네트워크 오류 사용자는 집계되지 않는다.

검증: `cd frontend && pnpm test && pnpm run build:hosting`.
이번 변경은 프런트만 배포하며 Ubuntu API·DB·Brand Pilot은 변경하지 않는다.
