package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.LineInput;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

public final class TradeRequestRules {
    private TradeRequestRules() {}
    public static String fingerprint(Long boothId, String payment, List<LineInput> items) {
        if(boothId==null || boothId<1 || items==null || items.isEmpty() || items.size()>100)
            throw ApiException.badRequest("부스와 상품을 확인해 주세요.");
        Set<Long> ids=new HashSet<>();
        for(LineInput line:items) if(line==null || line.eventProductId()==null || line.eventProductId()<1
                || line.quantity()<1 || line.quantity()>1_000_000 || !ids.add(line.eventProductId()))
            throw ApiException.badRequest("상품·수량 또는 중복 상품을 확인해 주세요.");
        StringBuilder canonical=new StringBuilder("TRADE_V1|").append(boothId).append('|').append(payment==null?"":payment);
        items.stream().sorted(Comparator.comparing(LineInput::eventProductId))
            .forEach(line->canonical.append('|').append(line.eventProductId()).append(':').append(line.quantity()));
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
