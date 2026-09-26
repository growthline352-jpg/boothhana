# 수집 누적·재개 계약 v5

## 1. 검토와 수정

`EditInput`은 기존 revision/reviewState/note/overrides에 `clearOverrides: string[]`를 추가합니다. 생략하면 빈 배열입니다.
검토만 저장하면 overrides={}입니다. 실제 수정한 필드만 보내며 기존 수동값은 유지됩니다. clearOverrides는 필드 자체를 제거해 최신 누적 수집값을 따르게 합니다. 같은 필드를 변경과 제거에 동시에 넣을 수 없습니다. id/출처 등 허용되지 않은 필드는 제거할 수 없습니다. 서버는 revision 검사와 원문/검토 이력을 유지합니다.
`SalesView.collectedData`는 최신 시도에서 받은 원문(null일 수 있음), `data`는 누적 상품+유효 수정값입니다. 상품 override를 해제하면 최신 한 번의 부분 목록이 아닌 **누적 상품 목록**을 사용합니다.

## 2. 안정적 식별

참가·상품의 `identity`는 null 또는 `{sourceSystem,entryId,detailUrl}`입니다. sourceSystem은 확인한 출처 origin(예: `https://example.com`), entryId는 해당 출처 내 실제 등록 ID, detailUrl은 해당 항목 상세 URL입니다. sourceEntryId와 entryId를 함께 보내면 같아야 합니다. 출처 근거가 없거나 origin이 다르면 거절합니다. 게시글 ID를 상품 ID로 만들어 넣으면 안 됩니다.
기본 우선순위는 출처 시스템+외부 ID → 항목별 상세 URL → 제한적인 기존 규격 식별입니다. 상품은 확인된 productUrl도 별칭으로 사용합니다. 부모 event/participant FK가 별도로 격리합니다.
출처 배열은 순서와 별개로 별칭 목록으로 남습니다. 기존 identity_key와 가능한 v4 별칭을 조회 시 비교하고, 저장 후 정규 별칭을 누적합니다. 이름·부스번호로 무조건 합치지 않습니다. 서로 다른 명시 ID는 같은 URL을 쓰더라도 다른 등록으로 취급합니다. 복수 기존 행과 일치하면 자동 병합하지 않으며 거절/검토 사유를 기록합니다.
명확한 외부 ID와 항목 URL이 없는 입력에는 여전히 보수적 매칭만 가능합니다. 다른 사이트의 같은 업체를 자동으로 완벽하게 통합한다고 보장하지 않습니다.

## 3. 명단 커서

`POST /api/internal/subculture/v4/pipelines/{id}/events/{eventId}/cursors`는 명단 링크(kind=PARTICIPANTS)별 sourceKey/rootUrl/requestedUrl/passNo/pageIndex/revision/state를 반환합니다. 링크가 없으면 AUTO 조사 커서를 사용합니다.
PARTICIPANTS schemaVersion=5 요청에 `cursor:{sourceKey,passNo,pageIndex,requestedUrl,revision}`를 첨부합니다. 서버가 이벤트 범위·revision·현재 커서를 검사하고 데이터 저장·커서 이동·receipt 기록을 같은 트랜잭션에서 처리합니다. 응답이 유실되면 같은 runId/body로 재전송합니다. Python은 미수신 outbox를 먼저 비우고 새 커서를 읽습니다.
미완료 커서는 다음 주에도 유지됩니다. 완료 커서는 다른 배치 ID에서만 새 갱신 회차로 시작합니다. 반복 nextPage/접근 실패/불명확 완료는 BLOCKED로 동일 페이지를 보존합니다. v5끼리 `--resume`하면 invocation마다 새 처리 예산 안에서 진행합니다. 오래된 부모 revision이나 409를 임의 덮어쓰지 않습니다.
페이지 한도는 한 번의 실행에서 행사당 처리하는 페이지 수이지 행사 전체의 영구 상한이 아닙니다. 긴 목록을 다 확인하기 전에는 앞 페이지 재확인이 지연될 수 있습니다. 수집이 가능하다는 보장이나 전수확인 보장은 아니며 출처 접근 제한은 계속 표시됩니다.

## 4. 판매정보 시도 순환

`POST /pipelines/{id}/participants/{participantId}/attempt`의 STARTED는 실제 조사 직전에 기록합니다. CLI 예산이 없어 시작하지 못한 작업에는 기록하지 않습니다. 완료된 같은 pipeline의 판매 receipt는 재개 시 다시 시작하지 않습니다.
성공/부분/무결과도 lastAttemptAt을 남기고 lastSuccessAt은 실제 판매정보 확보 때만 바뀝니다. 미시도 먼저 → lastAttemptAt 오래된 순입니다. 성공/무결과 이후 기본 1일, 실패는 1·2·4·7일 상한의 재시도 간격입니다. 실행 중 장애로 남은 RUNNING은 2시간 뒤 다시 대상이 됩니다. 이는 일요일 실행을 바꾸는 예약이 아니라 대상 선정 자격 기준입니다.
DB에 전달할 수조차 없는 전면 장애는 시도 기록도 로컬에만 남을 수 있습니다. 스케줄러와 로컬 로그 확인은 계속 필요합니다.

## 5. 부분 결과와 공개

이번 시도의 개별 상품만 upsert하고 미등장 상품은 삭제하지 않습니다. 최신 판매 관찰은 latest_payload_json, 누적 목록은 payload_json, 개별 데이터는 subculture_catalog_product에 둡니다.
상품 DB ID별 확인 상태는 CONFIRMED_CURRENT / NOT_RECONFIRMED / LEGACY / UNKNOWN입니다. 확인일은 수집 프로그램이 확인한 시각이지 현장 재고 보장이 아닙니다. null 결과면 이전 목록은 보존하고 최신 관찰은 null입니다. 명시적 CANCELED/SOLD_OUT은 데이터와 카드에 유지합니다.
공개용 reviewed_product_checks_json은 판매정보 검토 완료 시 함께 저장하며 이후 재수집이 공개본을 자동 수정하지 않습니다. 실제 삭제·판매중단 근거 없는 누락은 그대로 보존하는 보수적 정책입니다. 상품 자동 삭제 기능은 없습니다.

## 6. 실행 결과와 이미지

배치 counts는 receipt의 inserted+changed+unchanged 합계입니다. **작업별 수신 건수**이며 행사 전체 유일 참가 수가 아닙니다. 같은 항목을 여러 페이지에서 재확인하면 각 단계의 unchanged에 포함될 수 있습니다. 신규/변경/동일/제외와 서버 상태를 함께 봅니다. cliCalls는 실제 실행 시도 수(실패 포함)입니다.
명단의 페이지별 PARTIAL은 뒤 페이지가 존재함을 뜻할 수 있습니다. 마지막 커서가 완료된 경우 전체 배치는 정상으로 끝나면서 단계 집계에는 PARTIAL이 남을 수 있습니다. 거절/실패/원문 경고는 반드시 issues에 남깁니다.
CLI 호출 한도만 소진하면 남은 시간 동안 승인 이미지를 별도 처리합니다. 전체 시간 예산이 소진되면 다음 실행으로 보류합니다. 외부 HTTP 1회/재시도 자체에는 별도 제한시간이 있어 종료시간은 작업 경계에서 판단합니다. 이미지 권리 승인과 다운로드 호스트 허용은 기존 v4 정책을 그대로 사용합니다.
