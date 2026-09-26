# BoothHana2 · v15
행사에서 발견한 관심을, 다녀온 뒤에도 다시 찾는 개인 보관함.

기존 수집/공개/배치도/운영부스/예약/POS/고객지원 기능 위에 개인 저장·메모·방문 표시·QR 공유를 연결한 전체 소스입니다.

먼저 [START_HERE_KO.md](START_HERE_KO.md)를 확인하세요. 신규 DB는 SQL001→015, 014까지 적용된 DB는 SQL015만 검토·적용합니다. SQL은 자동 실행되지 않으며 운영 DB를 변경한 적이 없습니다.

| 폴더 | 역할 |
|---|---|
| frontend | React/TypeScript 공개·업체·관리자·개인 보관함 |
| backend | Spring/Java21·인증·거래·카탈로그·개인 메모 API |
| collector | Codex CLI 검색과 이미지 분석을 실행하는 Python 배치 |
| database | 번호순 검토·적용할 SQL, dev seed는 운영 제외 |
| docs | 기능·DB·배포·과거 버전 기록 |
| verification | 독립 검사, 명시적 테스트 대역, 실제 DB용 opt-in 통합 검사 |
| preview/v15 | 가상 데이터·소스 JSX/CSS 기반 정적 보관함 시안 |

## 확인된 것과 남은 것
독립 규칙·메서드·모의 UI·정적 브라우저와 ZIP 무결성은 이번 결과에 기록했습니다. 전체 React/Spring 빌드·실제 PostgreSQL·Kakao·R2·실물 휴대폰·Codex 실행은 운영 전 별도 검증 대상입니다. [TEST_RESULTS_KO.md](TEST_RESULTS_KO.md)의 경계를 확인하세요.

실제 비밀 설정·인증·폰트 바이너리는 제공하지 않습니다. 과거 verification 로그는 그 버전의 기록이며 v15 성공으로 합산하지 않습니다.
