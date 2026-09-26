do $$
declare
  v_owner_id bigint;
  v_live_event_id bigint;
  v_upcoming_event_id bigint;
  v_ended_event_id bigint;
  v_delete_event_id bigint;
  v_booth_id bigint;
  v_delete_booth_id bigint;
  v_live_event_booth_id bigint;
  v_upcoming_event_booth_id bigint;
  v_ended_event_booth_id bigint;
  v_keyring_product_id bigint;
  v_sticker_product_id bigint;
  v_pouch_product_id bigint;
  v_delete_product_id bigint;
  v_keyring_event_product_id bigint;
  v_sticker_event_product_id bigint;
  v_pouch_event_product_id bigint;
  v_delete_event_product_id bigint;
  v_reservation_id bigint;
  v_pos_id bigint;
begin
  if exists (select 1 from event where name = '[MOCK] 부스하나 페어 2026') then
    raise notice 'BoothHana mock data already exists.';
    return;
  end if;

  select id into v_owner_id
  from app_user
  order by created_at desc, id desc
  limit 1;

  if v_owner_id is null then
    raise exception '카카오 로그인 후 mock seed를 실행해 주세요.';
  end if;

  insert into event (name, start_at, end_at, venue, description, reservation_start_at, reservation_end_at, status)
  values ('[MOCK] 부스하나 페어 2026', now() - interval '1 day', now() + interval '2 days', '코엑스 C홀', '팬 예약과 크리에이터 운영 화면을 확인하는 개발용 공개 행사입니다.', now() - interval '7 days', now() + interval '1 day', 'PUBLISHED')
  returning id into v_live_event_id;

  insert into event (name, start_at, end_at, venue, description, reservation_start_at, reservation_end_at, status)
  values ('[MOCK] 가을 굿즈 마켓', now() + interval '14 days', now() + interval '15 days', 'DDP 아트홀', '참가 신청 대기 상태를 확인하는 개발용 행사입니다.', now() + interval '7 days', now() + interval '13 days', 'PUBLISHED')
  returning id into v_upcoming_event_id;

  insert into event (name, start_at, end_at, venue, description, status)
  values ('[MOCK] 지난 캐릭터 마켓', now() - interval '20 days', now() - interval '18 days', '세텍 2홀', '종료 행사 읽기 전용 화면을 확인하는 개발용 행사입니다.', 'ENDED')
  returning id into v_ended_event_id;

  insert into event (name, start_at, end_at, venue, description, status)
  values ('[MOCK] 삭제 테스트 행사', now() + interval '30 days', now() + interval '31 days', '테스트홀', '연결 데이터가 없어 관리자 화면에서 수정·삭제할 수 있습니다.', 'DRAFT')
  returning id into v_delete_event_id;

  insert into booth (owner_user_id, name, description, sns_url)
  values (v_owner_id, '[MOCK] 달빛상점', '토끼와 달을 주제로 한 키링, 스티커, 패브릭 굿즈 부스입니다.', 'https://example.com/moonlight')
  returning id into v_booth_id;

  insert into booth (owner_user_id, name, description)
  values (v_owner_id, '[MOCK] 삭제 테스트 부스', '행사와 연결되지 않아 크리에이터 화면에서 수정·삭제할 수 있습니다.')
  returning id into v_delete_booth_id;

  insert into event_booth (event_id, booth_id, booth_number, intro, status, is_public)
  values (v_live_event_id, v_booth_id, 'A-17', '신작 문래빗 굿즈와 현장 한정 스티커를 준비했습니다.', 'APPROVED', true)
  returning id into v_live_event_booth_id;

  insert into event_booth (event_id, booth_id, intro, status, is_public)
  values (v_upcoming_event_id, v_booth_id, '가을 신작 굿즈 참가 신청입니다.', 'PENDING', false)
  returning id into v_upcoming_event_booth_id;

  insert into event_booth (event_id, booth_id, booth_number, intro, status, is_public)
  values (v_ended_event_id, v_booth_id, 'B-04', '종료된 행사의 공개 기록입니다.', 'APPROVED', true)
  returning id into v_ended_event_booth_id;

  insert into product (booth_id, name, description)
  values (v_booth_id, '[MOCK] 문래빗 아크릴 키링', '양면 인쇄 아크릴 키링입니다.')
  returning id into v_keyring_product_id;

  insert into product (booth_id, name, description)
  values (v_booth_id, '[MOCK] 픽셀캣 스티커 팩', '다섯 장으로 구성된 무광 스티커 팩입니다.')
  returning id into v_sticker_product_id;

  insert into product (booth_id, name, description)
  values (v_booth_id, '[MOCK] 써머캣 패브릭 파우치', '재고와 별도로 판매자가 품절 처리한 상품입니다.')
  returning id into v_pouch_product_id;

  insert into product (booth_id, name, description)
  values (v_booth_id, '[MOCK] 삭제 테스트 메모지', '예약·판매 연결이 없어 상품 관리 화면에서 삭제할 수 있습니다.')
  returning id into v_delete_product_id;

  insert into event_product (event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)
  values (v_live_event_booth_id, v_keyring_product_id, 12000, 'FINITE', 20, false, true, true)
  returning id into v_keyring_event_product_id;

  insert into event_product (event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)
  values (v_live_event_booth_id, v_sticker_product_id, 9000, 'INFINITE', null, false, true, true)
  returning id into v_sticker_event_product_id;

  insert into event_product (event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)
  values (v_live_event_booth_id, v_pouch_product_id, 15000, 'FINITE', 8, true, true, false)
  returning id into v_pouch_event_product_id;

  insert into event_product (event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)
  values (v_live_event_booth_id, v_delete_product_id, 3000, 'FINITE', 10, false, false, false)
  returning id into v_delete_event_product_id;

  insert into event_product (event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)
  values (v_ended_event_booth_id, v_keyring_product_id, 11000, 'FINITE', 0, true, true, false);

  insert into booth_notice (event_booth_id, title, body, is_pinned, created_at)
  values
    (v_live_event_booth_id, '[MOCK] 현장 수령 안내', '예약번호를 준비해 A-17 부스로 방문해 주세요.', true, now() - interval '2 hours'),
    (v_live_event_booth_id, '[MOCK] 품절 상품 안내', '패브릭 파우치는 준비 수량 소진으로 판매를 마감했습니다.', false, now() - interval '1 hour');

  insert into reservation (reservation_no, user_id, event_booth_id, status, qr_token, created_at)
  values ('MOCK-RSV-RESERVED', v_owner_id, v_live_event_booth_id, 'RESERVED', 'MOCK-RSV-RESERVED', now() - interval '3 hours')
  returning id into v_reservation_id;
  insert into reservation_item (reservation_id, event_product_id, quantity, unit_price)
  values (v_reservation_id, v_keyring_event_product_id, 2, 12000);

  insert into reservation (reservation_no, user_id, event_booth_id, status, qr_token, created_at, picked_up_at)
  values ('MOCK-RSV-PICKED', v_owner_id, v_live_event_booth_id, 'PICKED_UP', 'MOCK-RSV-PICKED', now() - interval '1 day', now() - interval '20 hours')
  returning id into v_reservation_id;
  insert into reservation_item (reservation_id, event_product_id, quantity, unit_price)
  values (v_reservation_id, v_sticker_event_product_id, 1, 9000);

  insert into reservation (reservation_no, user_id, event_booth_id, status, qr_token, created_at, canceled_at)
  values ('MOCK-RSV-CANCELED', v_owner_id, v_live_event_booth_id, 'CANCELED', 'MOCK-RSV-CANCELED', now() - interval '2 days', now() - interval '47 hours')
  returning id into v_reservation_id;
  insert into reservation_item (reservation_id, event_product_id, quantity, unit_price)
  values (v_reservation_id, v_keyring_event_product_id, 1, 12000);

  insert into pos_sale (sale_no, event_booth_id, payment_method, status, sold_at)
  values ('MOCK-POS-SOLD', v_live_event_booth_id, 'CASH', 'SOLD', now() - interval '90 minutes')
  returning id into v_pos_id;
  insert into pos_sale_item (pos_sale_id, event_product_id, quantity, unit_price)
  values (v_pos_id, v_keyring_event_product_id, 2, 12000);

  insert into pos_sale (sale_no, event_booth_id, payment_method, status, sold_at)
  values ('MOCK-POS-CANCELED', v_live_event_booth_id, 'TRANSFER', 'CANCELED', now() - interval '1 hour')
  returning id into v_pos_id;
  insert into pos_sale_item (pos_sale_id, event_product_id, quantity, unit_price)
  values (v_pos_id, v_keyring_event_product_id, 1, 12000);

  raise notice 'BoothHana mock data created for app_user id %.', v_owner_id;
end $$;
