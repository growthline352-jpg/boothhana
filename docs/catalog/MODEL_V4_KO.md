> v4의 과거 문서입니다. 현재 배포는 docs/deployment/FULL_V5_KO.md, 변경 계약은 docs/catalog/REVIEW_FIXES_V5_KO.md를 따르세요.

# 외부 서브컬처 catalogue 데이터 계약

## 저장 원칙

외부 정보는 별도 `subculture_*` 테이블에 저장합니다. `app_user`/`booth`/`event_booth`/`event_product`와 연결하여 소유권을 만들어내지 않습니다. 배치에는 기존 서버가 발급한 행사·참가 ID와 해당 revision을 전달하고 결과가 다른 부모에 저장되지 않도록 확인합니다.

- 행사: 기존 `subculture_event_candidate`에 `eventFormat`, `discoveryLinks`, `STATIONERY_GOODS`, 보정 JSON 추가.
- 업체: `subculture_exhibitor`. 회원이 아닌 외부 프로필. 이름만 같은 업체는 무조건 합치지 않음.
- 참가 부스: `subculture_participant`, 구성원은 `subculture_participant_member`. 등록명 원문과 확인된 활동명 보존. 명칭의 `+`, `/`, `&`, `(주)`를 소유/법인 판단에 사용하지 않음.
- 판매정보: `subculture_sales`; 상품 항목은 `subculture_catalog_product`. 상품은 참가 컨텍스트에 귀속된 외부 관찰 항목으로, 운영 상품 마스터가 아님. 같은 상시 상품이 다른 행사에서 나타나도 그 행사의 판매 여부는 각각 검증.
- 이미지: `subculture_catalog_asset`. type, 원본URL, 게시URL, 보고된 조건, 관리자 승인/메모, 공개 출처 문구, 자체 저장 키/해시/실패 사유.
- 배치: `subculture_pipeline_run`, `subculture_stage_run`; 기존 발견 단계는 `subculture_collection_run`/observation.
- 검토: raw payload, 관리자 override, 이전 reviewed snapshot, review_history를 분리.
- 공개: `subculture_catalog_publication`의 승인된 시점 스냅샷. 검토 상태와 공개 상태는 독립.

## 필드별 상태

부스 위치: ASSIGNED(번호 필수), UNASSIGNED(공식 미배정), UNKNOWN(확인 못함), NOT_APPLICABLE(번호 체계 없음). 복수 위치와 실제 참가일·홀을 저장합니다. 번호는 identity가 아니므로 위치 변경이 새 참가를 뜻하지 않습니다. 연속되지 않는 운영일 사이의 휴무일을 포함하는 부스 날짜는 검증에서 거절합니다.

판매 확인 범위: EVENT_LISTED, EVENT_SALE_CONFIRMED, PROFILE, GENERAL_CATALOG, PAST_REFERENCE, UNKNOWN. 참가자 소개·상시 쇼핑몰을 이번 행사 판매 확정으로 승격하지 않습니다. 개별 상품을 모르면 요약/취급 분야만 저장하고 빈 상품 목록을 허용합니다. 가격 null은 무료가 아니며, 표시 기본가격·통화·확인일·추가금 주의사항을 남깁니다.

coverage: COMPLETE/PARTIAL/UNPUBLISHED/NOT_APPLICABLE/UNKNOWN, 출처가 말한 총수와 단위(등록부스/부스컷/상품/미확인), 읽은페이지/다음페이지/문제. COMPLETE는 수집기의 보고이며 전수 독립 검증을 뜻하지 않습니다. 여러 페이지별 stage 기록과 누적 확보 수를 함께 확인하세요.

수집 성공과 전체 명단 확보는 별개입니다. 다음 페이지/작업 한도에 걸리면 PARTIAL. 기존 참가자가 다음 배치에서 안 보였다는 이유만으로 자동 삭제하지 않습니다.

## 개인정보·권리·출처

공개된 행사명·등록명·작가 활동명·판매 공지에 필요한 내용만 수집하도록 프롬프트를 제한합니다. 비공개 카페/온리전 장소나 연락처를 추정하지 않습니다. 원문 접근 불가를 임의 우회하지 않습니다. `blockedSourceHosts`에 지정한 호스트는 자료·상품·이미지 링크 근거로 사용하지 않도록 검사하며 기본 제한 목록은 배포 담당자가 검토해야 합니다.

AI가 보고한 이미지 조건은 승인으로 처리하지 않습니다. 저장/공개 사용 승인은 사람이 실제 조건을 확인해야 합니다. 공개 attribution과 비공개 permission memo를 분리합니다.

## 알려진 한계

- 동일 참가가 서로 다른 대표 출처 URL로 나타나면 중복 발생 가능. 이름/기간만으로 자동 병합하지 않습니다. 중복 건은 검토 시 제외할 수 있으며 복잡한 이력 병합 도구는 없습니다.
- 행사별 읽기 전용 공개본은 최대 3,000 참가 부스 및 8MiB JSON 제한. 관리자 목록은 pagination, 공개 상세 부스 필터는 클라이언트 내 동작입니다.
- 이미지 출처가 바뀌면 새 후보. 기존 R2 객체를 자동 삭제하지 않음. 승인 철회 시 서비스 노출은 멈추지만 이미 공유된 공개 R2 URL까지 폐기하지 않습니다. 별도 CDN/버킷 정책이 필요합니다.
- 옵션별 재고·배송비·최종 결제금액은 수집하지 않습니다. 행사 취소/판매 취소는 출처 근거와 관리자 판단 필요.
