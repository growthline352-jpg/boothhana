export const imageStates:Record<string,string>={
 READY:'대표 이미지 저장됨',MISSING:'대표 이미지 없음',WAITING_REVIEW:'사용 검토 대기',WAITING_STORAGE:'승인됨 · 저장 대기',
 STORAGE_FAILED:'저장 실패',SELECTION_BLOCKED:'대표 이미지 선택 확인',VERIFIED:'공개 확인 완료',PUBLICATION_FAILED:'공개 표시 실패',
 SOURCE_BLOCKED:'원문 수집 제한',NO_SOURCE:'공식 출처 필요',NO_IMAGE_FOUND:'추가 원문 조사 필요',WAITING_HOST:'저장 도메인 확인',
 FETCH_FAILED:'원문 조회 실패',REPAIR_FAILED:'보완 작업 실패',STORAGE_DISABLED:'저장 설정 확인',APPROVED_WAIT_STORAGE:'저장 대기',
 NOT_ATTEMPTED:'확인 차례 대기',NEEDS_RECHECK:'변경 후 재확인 대기',VERIFICATION_DUE:'공개 재확인 대기',ASSET_STATE_CHANGED:'최신 상태 재확인',
}
