package com.boothhana.release;

import com.boothhana.collection.*;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real PostgreSQL and public HTTP, in the existing opt-in isolated release database only. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class CatalogEventPagesIntegrationTests {
    @DynamicPropertySource static void settings(DynamicPropertyRegistry p){
        p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));p.add("spring.datasource.hikari.maximum-pool-size",()->3);
        p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");
    }
    @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired CatalogEventPages pages;@Autowired WebApplicationContext web;
    long event,first,second;String day=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).plusDays(5).toString();
    String encode(Object value){return json.writeValueAsString(value);}
    @BeforeEach void fixture(){
        assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
        assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
        String key=UUID.randomUUID().toString().replace("-","").repeat(2);
        event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values(?,?,'[TEST] page event','ONLY_EVENT',cast(? as date),cast(? as date),'{}',?,'[]','REVIEWED') returning id",Long.class,key,key,day,day,key);
        var people=new ArrayList<Map<String,Object>>();
        for(int index=0;index<27;index++){
            String name=String.format("[TEST] circle %02d",index),identity=UUID.randomUUID().toString().replace("-","").repeat(2);
            long pid=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values(?,?,?,cast(? as jsonb),?,'REVIEWED') returning id",Long.class,event,identity,name,encode(Map.of("description","DRAFT_SECRET")),identity);
            if(index==0)first=pid;if(index==1)second=pid;
            var product=Map.of("name",index==0?"첫번째전용굿즈":"루나 아크릴 키링 "+index,"summary","공개 상품","memberName","작가","subjects",List.of("루나"),"categories",List.of("키링"),"evidenceScope","EVENT_SALE_CONFIRMED","sources",List.of(),"images",List.of(),"warnings",List.of());
            var sale=Map.of("summary","공개 판매 안내","evidenceScope","EVENT_SALE_CONFIRMED","categories",List.of("키링"),"subjects",List.of("루나"),"products",List.of(product),"sources",List.of(Map.of("url","https://example.com/sale","kind","OFFICIAL","access","ORIGINAL","evidence","SOURCE_ONLY_TEXT"+"x".repeat(12000))),"images",List.of(),"warnings",List.of());
            db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state) values(?,cast(? as jsonb),?,'REVIEWED')",pid,encode(sale),identity);
            var participant=new LinkedHashMap<String,Object>();participant.put("registrationName",name);participant.put("kind","BOOTH");participant.put("members",List.of(Map.of("name","작가 "+index,"aliases",List.of())));participant.put("subjects",List.of("루나"));participant.put("locations",List.of(Map.of("startDate",day,"endDate",day,"code","A-"+index,"hall","1홀","status","ASSIGNED")));participant.put("description","공개 소개");participant.put("sources",List.of());participant.put("officialLinks",List.of());participant.put("warnings",List.of());participant.put("images",List.of());
            people.add(Map.of("id",pid,"participant",participant,"sales",sale,"productRows",List.of(),"productIds",Map.of()));
        }
        var eventData=Map.of("name","[TEST] page event","subcategory","ONLY_EVENT","description","공개 행사 안내","venueName","테스트 전시장","occurrences",List.of(Map.of("startDate",day,"endDate",day)),"sources",List.of(),"warnings",List.of());
        db.update("insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),1)",event,encode(Map.of("id",event,"mode","INFO_ONLY","event",eventData,"participants",people,"publishedAt","2026-10-19T00:00:00Z")));
    }
    @SuppressWarnings("unchecked") List<Map<String,Object>> people(Map<String,Object> value){return (List<Map<String,Object>>)value.get("participants");}
    @Test void overviewIsSmallAndBoothsAreReallyPagedWithoutSourcePayloads() throws Exception {
        var header=pages.overview(event);assertThat(people(header)).isEmpty();assertThat(header.get("participantCount")).isEqualTo(27L);assertThat(encode(header).length()).isLessThan(10000);
        var page=pages.booths(event,0,24,"","","","","","");assertThat(people(page)).hasSize(24);assertThat(encode(page)).doesNotContain("SOURCE_ONLY_TEXT","DRAFT_SECRET");assertThat(encode(page).length()).isLessThan(60000);
        assertThat(people(pages.booths(event,1,24,"","","","","",""))).hasSize(3);
        MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build().perform(get("/api/public/catalog/events/"+event+"/overview")).andExpect(status().isOk()).andExpect(jsonPath("$.participants").isEmpty()).andExpect(jsonPath("$.participantCount").value(27));
    }
    @Test void searchReadsPublishedGoodsButNotEvidenceOrDraftsAndKeepsAllFacets(){
        assertThat(people(pages.booths(event,0,24,"키링 26",day,"1홀","루나","키링",""))).hasSize(1);
        assertThat(people(pages.booths(event,0,24,"SOURCE_ONLY_TEXT","","","","",""))).isEmpty();
        assertThat(people(pages.booths(event,0,24,"DRAFT_SECRET","","","","",""))).isEmpty();
        assertThat(people(pages.booths(event,0,24,"","","","","","0"))).isEmpty();
        assertThat(people(pages.booths(event,0,24,"","","","","",Long.toString(second)))).extracting(p->((Number)p.get("id")).longValue()).containsExactly(second);
    }
    @Test void excludedBoothsHiddenSalesAndWithdrawnPublicationsStayHidden(){
        db.update("update subculture_sales set review_state='EXCLUDED' where participant_id=?",first);
        assertThat(people(pages.booth(event,first)).getFirst().get("sales")).isNull();
        assertThat(people(pages.booths(event,0,24,"첫번째전용굿즈","","","","",""))).isEmpty();
        db.update("update subculture_participant set review_state='EXCLUDED' where id=?",first);
        assertThatThrownBy(()->pages.booth(event,first)).isInstanceOf(ApiException.class);
        assertThat(pages.overview(event).get("participantCount")).isEqualTo(26L);
        db.update("delete from subculture_catalog_publication where event_id=?",event);
        assertThatThrownBy(()->pages.overview(event)).isInstanceOf(ApiException.class);
    }
    @Test @SuppressWarnings("unchecked") void initialVisitDayAndUnknownAttendanceMatchThePublicUi(){
        String next=java.time.LocalDate.parse(day).plusDays(1).toString();
        var snapshot=json.readValue(db.queryForObject("select snapshot_json::text from subculture_catalog_publication where event_id=?",String.class,event),Map.class);
        ((Map<String,Object>)snapshot.get("event")).put("occurrences",List.of(Map.of("startDate",day,"endDate",next)));
        for(var row:(List<Map<String,Object>>)snapshot.get("participants")){
            long pid=((Number)row.get("id")).longValue();
            if(pid==first||pid==second)((Map<String,Object>)row.get("participant")).put("locations",List.of(Map.of("startDate",next,"endDate",next,"code","A-1","hall","1홀","status","ASSIGNED","dateEvidence",pid==first?"UNKNOWN":"DECLARED")));
        }
        db.update("update subculture_catalog_publication set snapshot_json=cast(? as jsonb) where event_id=?",encode(snapshot),event);
        var initial=people(pages.booths(event,0,100,"","","","","",""));
        assertThat(initial).hasSize(26).extracting(p->((Number)p.get("id")).longValue()).contains(first).doesNotContain(second);
        assertThat(people(pages.booths(event,0,100,"",next,"","","",""))).hasSize(2);
    }
    @Test void mapDoesNotShipProductsAndRevokedImagesNeverLeak(){
        var map=pages.map(event);assertThat(people(map)).hasSize(27);assertThat(encode(map)).doesNotContain("SOURCE_ONLY_TEXT","productRows");
        String key=UUID.randomUUID().toString().replace("-","").repeat(2);
        long asset=db.queryForObject("insert into subculture_catalog_asset(event_id,participant_id,identity_key,type,image_url,page_url,rights_state,storage_state,object_key) values(?,?,?,'LOGO','https://example.com/logo.png','https://example.com','APPROVED','STORED','test/logo.png') returning id",Long.class,event,first,key);
        assertThat((List<?>)pages.booth(event,first).get("assets")).hasSize(1);
        db.update("update subculture_catalog_asset set rights_state='REJECTED' where id=?",asset);
        assertThat((List<?>)pages.booth(event,first).get("assets")).isEmpty();
    }
}
