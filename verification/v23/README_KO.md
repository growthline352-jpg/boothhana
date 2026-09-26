# v23 회귀·시각 점검

신규28개: test_dialogs(7), test_public_usability(14), test_library_download(7). hooks/DOM/API 대역 경계를 테스트 상단에 명시했습니다. test_gate(3)는 검증상태 기록 도구 테스트입니다.

check_native_dialog.py는 실제 HTMLDialogElement로 모달 helper를 실행합니다. check_static_layout.py는 가상 자료의 정적 HTML을 실제 Chromium에서 측정합니다. 이 둘은 서버로 이동하지 않으며 React hydration을 검증하지 않습니다. browser_offline.py는 실제 localhost 독립 리더를 사용하는 이전 시나리오이고, 현재 환경 정책으로 페이지이동이 막혀 NOT_READY입니다.

미리보기 생성·실제 테스트 재실행 절차는 docs/deployment/FULL_V23_KO.md를 확인하세요.
