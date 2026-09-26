package com.boothhana.goods;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** OPT-IN. Creates/drops only a unique temporary schema, in an empty LOCAL goods test DB. */
@EnabledIfEnvironmentVariable(named="BOOTH_GOODS_TEST_URL",matches=".+")
class GoodsRankingPostgresTests {
    Connection db;String schema;
    Instant end=Instant.parse("2026-09-17T03:00:00Z");
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("BOOTH_GOODS_TEST_URL");
        if(!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]{1,5})?/boothhana_goods_test"))
            throw new IllegalArgumentException("Only an empty dedicated LOCAL boothhana_goods_test is allowed");
        db=DriverManager.getConnection(url,System.getenv("BOOTH_GOODS_TEST_USER"),System.getenv("BOOTH_GOODS_TEST_PASSWORD"));
        schema="goods_test_"+UUID.randomUUID().toString().replace("-", "");
        exec("create schema "+schema);exec("set search_path to "+schema);
        // Minimal PostgreSQL relations for exercising the actual production query, not migration/RLS acceptance.
        exec("create table event(id bigint primary key,name text,status text,start_at timestamptz)");
        exec("create table booth(id bigint primary key,name text)");
        exec("create table event_booth(id bigint primary key,event_id bigint,booth_id bigint,status text,is_public boolean)");
        exec("create table product(id bigint primary key,booth_id bigint,name text,image_key text,description text)");
        exec("create table event_product(id bigint primary key,event_booth_id bigint,product_id bigint,price bigint,is_sold_out boolean,stock_mode text,stock_quantity int,is_public boolean)");
        exec("create table pos_sale(id bigint primary key,event_booth_id bigint,status text,sale_no text,sold_at timestamptz)");
        exec("create table pos_sale_item(id bigserial primary key,pos_sale_id bigint,event_product_id bigint,quantity int)");
        exec("create table goods_showcase(product_id bigint primary key,category text,enabled boolean,revision bigint)");
        exec("insert into event values(1,'행사','PUBLISHED','2026-10-01');insert into booth values(1,'부스');insert into event_booth values(1,1,1,'APPROVED',true)");
        for(int i=1;i<=3;i++)exec("insert into product values("+i+",1,'상품"+i+"',null,'');insert into event_product values("+i+",1,"+i+","+(i*1000)+",false,'FINITE',5,true);insert into goods_showcase values("+i+",'SUBCULTURE',true,1)");
    }
    void exec(String sql) throws SQLException {try(Statement s=db.createStatement()){s.execute(sql);}}
    void sale(int id,int ep,int qty,String status,String no,Instant time) throws SQLException {
        try(var p=db.prepareStatement("insert into pos_sale values(?,1,?,?,?)")){p.setInt(1,id);p.setString(2,status);p.setString(3,no);p.setTimestamp(4,Timestamp.from(time));p.executeUpdate();}
        exec("insert into pos_sale_item(pos_sale_id,event_product_id,quantity) values("+id+","+ep+","+qty+")");
    }
    List<Long> ids() throws SQLException {
        try(var q=db.prepareStatement(GoodsRankingQuery.PUBLIC_SQL)) {
            q.setTimestamp(1,Timestamp.from(GoodsRankingQuery.start(end)));q.setTimestamp(2,Timestamp.from(end));q.setString(3,"SUBCULTURE");
            try(var rs=q.executeQuery()){List<Long> result=new ArrayList<>();while(rs.next())result.add(rs.getLong("product_id"));return result;}
        }
    }
    @Test void sortsQuantityNotRevenueAndExcludesCanceledOldFutureMock() throws Exception {
        sale(1,1,5,"SOLD","POS-1",end.minusSeconds(3600));sale(2,2,2,"SOLD","POS-2",end.minusSeconds(3600));
        sale(3,3,999,"CANCELED","POS-3",end.minusSeconds(3600));sale(4,3,999,"SOLD","MOCK-1",end.minusSeconds(3600));
        sale(5,3,999,"SOLD","POS-5",GoodsRankingQuery.start(end).minusSeconds(1));sale(6,3,999,"SOLD","POS-6",end);
        assertThat(ids()).containsExactly(1L,2L);
    }
    @Test void withdrawalAndZeroUnitsNeverFallBackToGuessedRank() throws Exception {
        assertThat(ids()).isEmpty();sale(1,1,3,"SOLD","POS-1",end.minusSeconds(1));assertThat(ids()).containsExactly(1L);
        exec("update goods_showcase set enabled=false where product_id=1");assertThat(ids()).isEmpty();
        exec("update goods_showcase set enabled=true;update event_booth set is_public=false");assertThat(ids()).isEmpty();
    }
    @Test void groupsSameBaseProductAcrossEventListingsWithStableTies() throws Exception {
        exec("insert into event_product values(11,1,1,1000,false,'FINITE',5,true)");
        sale(1,1,2,"SOLD","POS-1",end.minusSeconds(1));sale(2,11,2,"SOLD","POS-2",end.minusSeconds(1));sale(3,2,4,"SOLD","POS-3",end.minusSeconds(1));
        assertThat(ids()).containsExactly(1L,2L);
    }
    @AfterEach void cleanup() throws Exception {if(db!=null){try{if(schema!=null){exec("set search_path to public");exec("drop schema if exists "+schema+" cascade");}}finally{db.close();}}}
}
