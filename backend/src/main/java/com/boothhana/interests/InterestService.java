package com.boothhana.interests;

import com.boothhana.api.ApiException;
import com.boothhana.domain.UserAccount;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.interests.InterestTaxonomy.*;

@Service
public class InterestService {
    public record View(long userId,long revision,String onboardingStatus,Map<String,Selection> fields) {}
    public record Input(long expectedUserId,long revision,String onboardingStatus,Map<String,Selection> fields) {}
    private final JdbcTemplate db;private final JsonMapper json;
    public InterestService(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
    @Transactional(readOnly=true) public View get(UserAccount user){
        var rows=db.queryForList("select revision,fields_json from member_interest_preferences where user_id=?",user.id);
        if(rows.isEmpty())return new View(user.id,0,user.onboardingStatus,Map.of());
        var row=rows.getFirst();var type=json.getTypeFactory().constructMapType(LinkedHashMap.class,String.class,Selection.class);
        return new View(user.id,((Number)row.get("revision")).longValue(),user.onboardingStatus,json.readValue(row.get("fields_json").toString(),type));
    }
    @Transactional public View save(UserAccount user,Input input){
        if(input==null||input.expectedUserId()!=user.id||input.revision()<0)throw ApiException.conflict("로그인 계정과 수정 상태를 다시 확인해 주세요.");
        if(!Set.of("DONE","SKIPPED").contains(Objects.toString(input.onboardingStatus(),"")))throw ApiException.badRequest("설정 완료 상태를 확인해 주세요.");
        var fields=validate(input.fields());
        if(input.onboardingStatus().equals("SKIPPED")&&!fields.isEmpty())throw ApiException.badRequest("건너뛰기 상태를 확인해 주세요.");
        db.queryForObject("select id from app_user where id=? for update",Long.class,user.id);
        View before=get(user);if(before.revision()!=input.revision())throw ApiException.conflict("다른 화면에서 설정이 바뀌었어요. 다시 불러온 뒤 수정해 주세요.");
        db.update("insert into member_interest_preferences(user_id,fields_json,revision) values(?,cast(? as jsonb),1) on conflict(user_id) do update set fields_json=excluded.fields_json,revision=member_interest_preferences.revision+1,updated_at=now()",user.id,json.writeValueAsString(fields));
        db.update("update app_user set onboarding_status=? where id=?",input.onboardingStatus(),user.id);user.onboardingStatus=input.onboardingStatus();
        return get(user);
    }
}
