package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.upload.ImageUploadRules;
import com.boothhana.upload.VerifiedImageStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.io.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import static com.boothhana.collection.CatalogModels.*;

/** No arbitrary remote URL is fetched by the server. Only reviewed assets accept bounded worker bytes. */
@Service
@Transactional(readOnly=true)
public class CatalogMediaService {
    private final JdbcTemplate db;private final VerifiedImageStorage storage;private final String base;
    public CatalogMediaService(JdbcTemplate db,VerifiedImageStorage storage,@Value("${app.storage.public-url:}") String base) {this.db=db;this.storage=storage;this.base=base.replaceAll("/$","");}
    @Transactional public AssetView register(long event,Long participant,Long product,Image image) {
        CatalogRules.images(List.of(image));
        String identity=CollectionRules.sha(event+":"+participant+":"+product+":"+image.type()+":"+image.imageUrl()+":"+image.pageUrl());
        db.update("""
            insert into subculture_catalog_asset(event_id,participant_id,product_id,identity_key,type,image_url,page_url,caption,reported_rights)
            values(?,?,?,?,?,?,?,?,?) on conflict(identity_key) do nothing
            """,event,participant,product,identity,image.type(),image.imageUrl(),image.pageUrl(),image.caption(),image.rightsEvidence());
        return db.query("select * from subculture_catalog_asset where identity_key=?",this::asset,identity).getFirst();
    }
    /** Register a reviewed association without allowing cross-event participant/product links. */
    @Transactional public AssetView registerValidated(long event,AssetRegistrationInput input) {
        if(input==null||input.image()==null||event<1) throw ApiException.badRequest("이미지 후보 형식을 확인하세요.");
        var events=db.queryForList("select id,review_state from subculture_event_candidate where id=?",event);
        if(events.isEmpty()) throw ApiException.notFound("행사 없음");
        if("EXCLUDED".equals(events.getFirst().get("review_state"))) throw ApiException.conflict("제외한 행사에는 이미지를 등록할 수 없습니다.");
        Long participant=input.participantId(),product=input.productId();
        if(product!=null&&participant==null) throw ApiException.badRequest("상품 이미지는 참가자 연결이 필요합니다.");
        if(participant!=null) {
            var rows=db.queryForList("select id,review_state from subculture_participant where id=? and event_id=?",participant,event);
            if(rows.isEmpty()) throw ApiException.badRequest("이 행사의 참가자가 아닙니다.");
            if("EXCLUDED".equals(rows.getFirst().get("review_state"))) throw ApiException.conflict("제외한 참가자에는 이미지를 등록할 수 없습니다.");
        }
        if(product!=null&&db.queryForObject("select count(*) from subculture_catalog_product where id=? and participant_id=?",Long.class,product,participant)!=1)
            throw ApiException.badRequest("이 참가자의 상품이 아닙니다.");
        return register(event,participant,product,input.image());
    }
    public List<AssetView> assets(long event,Long participant) {
        String q="select * from subculture_catalog_asset where event_id=?"+(participant==null?"":" and participant_id=?")+" order by id";
        return participant==null?db.query(q,this::asset,event):db.query(q,this::asset,event,participant);
    }
    /** One query per result page; never expose external candidates or rights-revoked posters. */
    public Map<Long,AssetView> publicBanners(List<Long> eventIds) {
        if(eventIds.isEmpty()||base.isBlank()) return Map.of();
        if(eventIds.size()>100) throw ApiException.badRequest("배너 조회 한도 오류");
        String placeholders=String.join(",",Collections.nCopies(eventIds.size(),"?"));
        var rows=db.query("select distinct on(a.event_id) a.* from subculture_catalog_asset a " +
            "left join subculture_catalog_presentation p on p.event_id=a.event_id " +
            "where a.event_id in ("+placeholders+") and a.participant_id is null and a.product_id is null " +
            "and a.type='BANNER' and a.rights_state='APPROVED' and a.storage_state='STORED' " +
            "and a.object_key is not null and (p.banner_asset_id is null or p.banner_asset_id=a.id) " +
            "order by a.event_id,a.id",this::asset,eventIds.toArray());
        Map<Long,AssetView> result=new LinkedHashMap<>();
        for(var row:rows) if(row.storedUrl()!=null) result.put(row.eventId(),row);
        return result;
    }
    public BannerSelection bannerSelection(long eventId) {
        var rows=db.query("select banner_asset_id,revision from subculture_catalog_presentation where event_id=?",
            (r,n)->new BannerSelection(r.getObject("banner_asset_id",Long.class),r.getLong("revision")),eventId);
        return rows.isEmpty()?new BannerSelection(null,0):rows.getFirst();
    }
    /** Event lock serializes first selection too; CAS rejects stale admin screens. Never changes use rights. */
    @Transactional public BannerSelection selectBanner(long eventId,BannerInput input) {
        if(input==null||input.revision()<0||input.assetId()!=null&&(input.assetId()<=0||input.assetRevision()==null||input.assetRevision()<0))
            throw ApiException.badRequest("대표 배너 선택값을 확인하세요.");
        db.execute("SET LOCAL lock_timeout='4s'");
        var events=db.queryForList("select id,review_state from subculture_event_candidate where id=? for update",eventId);
        if(events.isEmpty()) throw ApiException.notFound("행사 없음");
        if("EXCLUDED".equals(events.getFirst().get("review_state"))) throw ApiException.conflict("제외한 행사는 대표 배너를 변경할 수 없습니다.");
        var current=bannerSelection(eventId);
        if(current.revision()!=input.revision()) throw ApiException.conflict("대표 배너 선택이 변경되었습니다. 새로고침 후 다시 선택하세요.");
        if(input.assetId()!=null) {
            var rows=db.query("select * from subculture_catalog_asset where id=? for update",this::asset,input.assetId());
            if(rows.isEmpty()) throw ApiException.notFound("이미지 후보 없음");
            AssetView asset=rows.getFirst();
            if(asset.eventId()!=eventId||asset.participantId()!=null||asset.productId()!=null||!"BANNER".equals(asset.type()))
                throw ApiException.badRequest("이 행사의 배너 이미지만 선택할 수 있습니다.");
            if(asset.revision()!=input.assetRevision()) throw ApiException.conflict("이미지 상태가 변경되었습니다. 새로고침 후 다시 선택하세요.");
            if(!"APPROVED".equals(asset.rightsState())||!"STORED".equals(asset.storageState())||asset.storedUrl()==null)
                throw ApiException.conflict("사용 승인과 파일 저장이 완료된 배너만 선택할 수 있습니다.");
        }
        db.update("insert into subculture_catalog_presentation(event_id,banner_asset_id,revision) values(?,?,1) " +
            "on conflict(event_id) do update set banner_asset_id=excluded.banner_asset_id, " +
            "revision=subculture_catalog_presentation.revision+1,updated_at=now()",eventId,input.assetId());
        return bannerSelection(eventId);
    }
    public List<AssetView> pending(int limit) {
        if(limit<1||limit>200) throw ApiException.badRequest("이미지 한도 오류");
        return db.query("""
            select a.* from subculture_catalog_asset a join subculture_event_candidate e on e.id=a.event_id
            left join subculture_participant p on p.id=a.participant_id
            where a.rights_state='APPROVED' and a.storage_state<>'STORED' and e.review_state<>'EXCLUDED'
            and (p.id is null or p.review_state<>'EXCLUDED')
            and not (a.type='FLOOR_PLAN' and exists(select 1 from subculture_floorplan_source f where f.asset_id=a.id and f.can_transform)) order by a.last_attempt_at asc nulls first,a.id limit ?
            """,this::asset,limit);
    }
    public AssetView detail(long id) {var rows=db.query("select * from subculture_catalog_asset where id=?",this::asset,id);if(rows.isEmpty()) throw ApiException.notFound("이미지 후보 없음");return rows.getFirst();}
    @Transactional public AssetView rights(long id,RightsInput input) {
        if(input==null||input.rightsState()==null||!Set.of("PENDING","APPROVED","REJECTED").contains(input.rightsState())||input.note()==null||input.note().length()>2000||("APPROVED".equals(input.rightsState())&&(input.note().isBlank()||input.credit()==null||input.credit().isBlank()))||input.credit()==null||input.credit().length()>1000)
            throw ApiException.badRequest("이미지 사용 승인 근거를 입력하세요.");
        if(db.update("update subculture_catalog_asset set rights_state=?,rights_note=?,credit=?,offline_allowed=?,revision=revision+1 where id=? and revision=?",input.rightsState(),input.note(),input.credit(),"APPROVED".equals(input.rightsState())&&input.offlineAllowed(),id,input.revision())!=1) throw ApiException.conflict("이미지 상태가 변경되었습니다.");
        // Publication rendering filters rights_state at read time, so revocation hides stored images immediately.
        return detail(id);
    }
    @Transactional(timeout=70) public AssetView content(long id,long revision,String type,String digest,long size,InputStream input) throws IOException {
        var rows=db.query("select * from subculture_catalog_asset where id=? for update",this::asset,id);
        if(rows.isEmpty()) throw ApiException.notFound("이미지 후보 없음");AssetView asset=rows.getFirst();
        if(!"APPROVED".equals(asset.rightsState())) throw ApiException.forbidden("관리자가 사용을 승인한 이미지에만 저장할 수 있습니다.");
        byte[] bytes;
        try {bytes=ImageUploadRules.readVerified(input,size,type,digest);} catch(IllegalArgumentException e) {throw ApiException.badRequest("이미지 크기/형식/해시 오류");}
        var existing=db.queryForMap("select sha256,object_key from subculture_catalog_asset where id=?",id);
        if("STORED".equals(asset.storageState()) && digest.equals(existing.get("sha256"))) return asset; // response-loss retry
        if(asset.revision()!=revision) throw ApiException.conflict("승인/이미지 상태가 바뀌었습니다.");
        String key="verified/catalog/"+id+"/"+digest+ImageUploadRules.extension(type);
        storage.put(key,type,bytes,digest);storage.verify(key,type,size,digest);
        db.update("update subculture_catalog_asset set object_key=?,sha256=?,byte_size=?,content_type=?,storage_state='STORED',stored_at=now(),last_attempt_at=now(),error='',revision=revision+1 where id=?",key,digest,size,type,id);
        return detail(id);
    }
    @Transactional public AssetView failed(long id,AssetFailure input) {
        if(input==null||input.reason()==null||input.reason().length()>1000) throw ApiException.badRequest("이미지 오류 형식 확인 필요");
        db.update("update subculture_catalog_asset set storage_state='FAILED',last_attempt_at=now(),error=? where id=? and revision=? and storage_state<>'STORED'",input.reason(),id,input.revision());return detail(id);
    }
    private AssetView asset(ResultSet r,int ignored) throws SQLException {
        String key=r.getString("object_key");String stored=key==null||base.isBlank()?null:base+"/"+key;
        return new AssetView(r.getLong("id"),r.getLong("event_id"),r.getObject("participant_id",Long.class),r.getObject("product_id",Long.class),r.getLong("revision"),r.getString("type"),r.getString("image_url"),r.getString("page_url"),r.getString("caption"),r.getString("reported_rights"),r.getString("rights_state"),r.getString("rights_note"),r.getString("storage_state"),stored,r.getString("error"),r.getString("credit"),r.getBoolean("offline_allowed"));
    }
}
