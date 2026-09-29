# 분야별 사이트 분리

## 주소와 페이지

| 역할 | 주소 |
| --- | --- |
| 분야 선택·공통 서비스 | https://boothana.kr/ |
| 서브컬처 전용 홈 | https://subculture.boothana.kr/ |
| 박람회 전용 홈 | https://expo.boothana.kr/ |
| 축제 전용 홈 | https://festival.boothana.kr/ |

하나의 Vercel 프로젝트에서 Host 허용목록으로 구분한다. 별도 DB나 API 복제는 필요 없다.
분야별 홈은 해당 category API만 조회하고 고유 H1·제목·설명·WebSite 구조화 데이터를 출력한다.
행사와 부스 상세는 공개 데이터의 subcategory를 기준으로 해당 분야 도메인에 속한다.
다른 도메인이나 기존 URL로 들어오면 방문일·배치도·검색 조건을 유지한 308 이동을 제공한다.
알 수 없는 행사나 비공개/없는 부스는 이동하지 않고 기존 404/503 처리를 유지한다.

각 도메인의 /robots.txt는 자기 /sitemap.xml을 안내하며 분야 사이트맵은 해당 분야 행사만 포함한다.
검색·필터 결과는 noindex이며 분야 홈을 canonical로 지정한다. 행사 및 부스 상세에는 독립 canonical을 유지한다.
공통 예약 행사는 중복 공개를 피하려고 boothana.kr/events로 모은다.

## 현재 상태 및 안전한 운영 적용 순서

이 문서 작성 시 **로컬 구현 단계**다. DNS, Vercel 도메인, CORS, 운영 배포, Search Console 등록은 아직 미완료다.
Ubuntu 이관 및 Brand Pilot 설정과 무관하며 해당 서비스는 변경하지 않는다.

로컬 검증: 프런트 48개 테스트, SEO/HTTP/사이트맵 17개 테스트 통과. `build:hosting` 통과.
기존 번들 크기 경고는 남아 있으며 실제 세 호스트의 브라우저 로그인 검증은 DNS 연결 뒤 수행한다.

1. Vercel growth-16a6/boothhana에 세 도메인을 Production으로 등록한다.
2. Vercel이 제시하는 정확한 CNAME 값을 Cloudflare의 subculture / expo / festival에 DNS only로 설정한다. 도메인 등록기관은 가비아지만 DNS 관리는 Cloudflare로 이전했다.
3. Ubuntu의 BoothHana 전용 API의 ALLOWED_ORIGINS에 기존 값과 함께 세 HTTPS origin을 추가한다. 와일드카드 허용 금지. Brand Pilot의 프록시·컨테이너는 변경하지 않는다.
4. PUBLIC_SITE_URL 및 VITE_PUBLIC_SITE_URL은 https://boothana.kr로 맞춘다.
5. 초기 코드 배포는 CATEGORY_SITES_ENABLED=false / VITE_CATEGORY_SITES_ENABLED=false로 진행한다.
   알려진 서브도메인은 이 상태에서도 독립 사이트로 동작하지만 기존 사이트의 이동은 시작하지 않는다.
6. 세 도메인의 DNS/TLS, 분야별 실제 행사 목록, 행사/부스 상세, 로그인/보관함/신고 API, robots와 sitemap을 검증한다.
7. CATEGORY_SITES_ENABLED=true 및 VITE_CATEGORY_SITES_ENABLED=true를 함께 설정해 다시 배포한다.
   이때 메인 도메인이 분야 선택 홈으로 변경되고 기존 분류·상세 주소의 이동이 시작된다.
8. Search Console에서 boothana.kr 도메인 속성을 DNS TXT로 인증하거나 각 서브도메인 URL 접두어 속성을 등록한다.
   세 분야의 sitemap.xml을 각각 제출하고 홈 및 대표 행사 URL 검사 후 색인을 요청한다.

등록·도메인 설정을 마치기 전에 전환 플래그를 켜지 않는다. 요청 Host나 X-Forwarded-Host를 임의 canonical/API 주소로 신뢰하지 않는다.
프런트와 서버 플래그는 반드시 일치해야 한다. 문제가 있으면 두 플래그를 false로 되돌리고 재배포해 기존 주소 이동을 중단한다.

## 계정·브라우저 저장소

계정과 서버 보관함은 같은 API/DB를 사용한다. Kakao 콜백 API 주소는 이 변경만으로 바꿀 필요가 없다.
로그인 완료 후 FRONTEND_URL인 메인 도메인으로 돌아온다. 서브도메인 API 요청은 credentialed CORS 검증이 필요하다.
브라우저의 오프라인 저장·로컬 임시 데이터는 origin 단위이므로 도메인 간 자동 이동되지 않는다.
기존 오프라인 자료는 기존 도메인에 유지되며 새 분야 도메인에서는 다시 저장해야 한다.
색인과 순위는 검색엔진 판단이므로 도메인 분리가 노출이나 순위 상승을 보장하지는 않는다.
