package com.boothhana.service;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;

/** Same DataSource/JpaTransactionManager as PlatformService. Lock, stock, result and receipt
 * commit together. Never expire receipts while retries or their transaction records exist. */
@Service
public class TradeRequestService {
    private final JdbcTemplate db;
    public TradeRequestService(JdbcTemplate db) { this.db=db; }
    private void validate(Long user,String kind,UUID id) {
        if(user==null || user<1 || id==null || !Set.of("RESERVATION","POS").contains(kind))
            throw ApiException.badRequest("요청 ID와 로그인 정보를 확인해 주세요. 화면을 최신 버전으로 갱신해 주세요.");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public Optional<Long> begin(Long user,String kind,UUID id,String hash) {
        validate(user,kind,id);
        db.execute("set local lock_timeout='5s'");
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","trade-v1:"+user+":"+kind+":"+id);
        var rows=db.queryForList("select request_hash,coalesce(reservation_id,pos_sale_id) result_id from trade_request where user_id=? and operation=? and request_id=?",user,kind,id);
        if(rows.isEmpty()) return Optional.empty();
        var row=rows.getFirst();
        if(!hash.equals(row.get("request_hash"))) throw ApiException.conflict("같은 요청 ID에 다른 상품·수량을 사용할 수 없습니다. 기존 접수 결과부터 확인해 주세요.");
        return Optional.of(((Number)row.get("result_id")).longValue());
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void complete(Long user,String kind,UUID id,String hash,long resultId) {
        validate(user,kind,id);
        db.update("insert into trade_request(user_id,operation,request_id,request_hash,reservation_id,pos_sale_id) values(?,?,?,?,?,?)",
            user,kind,id,hash,"RESERVATION".equals(kind)?resultId:null,"POS".equals(kind)?resultId:null);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> receipt(Long user,String kind,UUID id) {
        validate(user,kind,id);
        var rows=db.queryForList("select coalesce(reservation_id,pos_sale_id) result_id from trade_request where user_id=? and operation=? and request_id=?",user,kind,id);
        // Missing and another user's ID are indistinguishable.
        return rows.isEmpty()?Map.of("found",false):Map.of("found",true,"resultId",rows.getFirst().get("result_id"));
    }
}
