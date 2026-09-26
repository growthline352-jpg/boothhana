# 현재 통합본: v9 사용자 과업 UX 보완 (2026-09-17)

전체 소스이며 패치를 다시 적용하지 않습니다. [시작 안내](START_HERE_KO.md), [UX 변경](docs/ux/USER_FLOW_V9_KO.md), [배포 안내](docs/deployment/FULL_V9_KO.md), [실행/미실행 검증](TEST_RESULTS_KO.md)을 먼저 확인하세요. **SQL009까지 적용된 환경의 추가 SQL은 없습니다.** 이전 문서·검증 로그는 해당 버전의 과거 기록입니다. 전체 React/Spring 통합 빌드는 이 환경에서 완료하지 못했습니다.

---

# 부스하나 전체 소스 v8 · 배치도 자동화

v7 전체본에 **배치도 재탐색 → Codex CLI 이미지 분석 → 좌표·참가 부스 매핑 → HTML/SVG 배치도 → 검토·버전 공개**를 추가했습니다. 패치가 아닌 전체 소스입니다. 예전 업데이트 스크립트를 추가 적용하지 않습니다.

**SQL 009가 새로 필요합니다.** [시작 안내](START_HERE_KO.md), [배포·예약 실행](docs/deployment/FULL_V8_KO.md), [상세 동작·제한](docs/floorplans/AUTOMATION_V8_KO.md), [실제 검증 결과](TEST_RESULTS_KO.md)를 확인하세요.

## 유지되는 기능

- 서브컬처·박람회·축제 공개 헤더. 현재 수집 분야는 서울 서브컬처이며 다른 두 분야는 준비 화면입니다.
- 행사·참가 부스·판매정보 3단계 CLI 조사, 수동 검토와 공개 스냅샷, 이미지 사용 승인, 주간 이어 수집 및 미발견 대상 순환.
- 기존 크리에이터/운영 행사/예약/재고/POS, 카카오 로그인, R2 이미지 업로드. POS 취소 재고의 수동 조정 정책은 그대로입니다.

## 배치도

- 일요일03시KST 전체 배치 후 배치도 작업. 월~토04시KST에는 14일 이내 행사만 보완 탐색(제공 스케줄 설치 필요).
- 원본 URL이 같아도 SHA-256이 달라지면 새 버전. 원본·분석·매핑은 한 버전으로 묶습니다.
- 큰 이미지의 구역별 CLI 이미지 입력. 고정 템플릿에서만 SVG 도형을 렌더하고 AI가 생성한 HTML/JS를 실행하지 않습니다.
- 날짜·홀·구역·번호가 맞는 참가자 자동 연결. 반부스 접미사·중복 번호·미확인 위치를 추측하지 않습니다.
- 관리자 클릭형 배치도 탭에서 사용 승인·영역 수정·직접 연결·부분 결과 공개 검토. 공개 화면에서 부스 클릭→판매정보 드로어.
- 참가 명단/원본/공개 스냅샷 불일치 시 기존 도형을 숨깁니다. 자동 공개·정밀 실측·길찾기 기능은 아닙니다.

## 실행 구조

`collector/run_scheduled.py` → 기존 `weekly.py` + 새 `floorplans.py` → Codex `exec` → 검증 → Spring 내부 API → Supabase PostgreSQL/R2.

수집 PC에는 Python3.11+, Java 백엔드는21+, 프런트는 원본 package.json의 의존성을 사용합니다. 실제 계정/토큰/DB 설정은 저장소에 포함하지 않습니다.

```powershell
cd collector
.\.venv\Scripts\python.exe floorplans.py --dry-run --fixtures examples/floorplan-v8
```

가상 fixture만 사용하는 검증이며 실제 행사·도면 인식 결과가 아닙니다. [배치도 정적 데모](preview/floorplan-v8.html)도 가상 데이터이고 실제 React 앱/DB 실행이 아닙니다.

독립 테스트는 `python verification/run_checks.py`, 선택 브라우저 검사는 `python verification/v8/browser_preview.py`입니다. 전체 React/Spring 빌드와 실제 CLI·DB·R2 연동은 스테이징 수락 기준을 확인해야 합니다. 과거 검증 보고서는 docs/history와 verification의 이전 버전 폴더에 보존했습니다.
