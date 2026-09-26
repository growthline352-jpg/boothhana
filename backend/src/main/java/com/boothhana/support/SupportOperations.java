package com.boothhana.support;

import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** HTTP write facade. NEVER permits an outer transaction: rate admission commits before
 * support rows/locks are acquired, including invalid attempts. Trusted internal transitions
 * use the transactional services directly; they do not allocate a second pooled connection. */
@Service
@Transactional(propagation=Propagation.NEVER)
public class SupportOperations {
    private final SupportService service; private final SupportRateLimiter rates;
    private final SupportResolutionService corrections; private final ExhibitorClaimsService claims;
    private final String secret;
    public SupportOperations(SupportService service,SupportRateLimiter rates,SupportResolutionService corrections,
            ExhibitorClaimsService claims,@Value("${app.support.rate-secret:}") String secret) {
        this.service=service;this.rates=rates;this.corrections=corrections;this.claims=claims;this.secret=secret;
    }
    private void limit(String key,int max) {
        if(rates.hit(key)>max) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    }
    private void member(Principal p) { if(p==null||p.userId()==null||p.guest())throw ApiException.forbidden("로그인이 필요합니다."); }
    private void admin(Principal p) { member(p);if(!p.admin())throw ApiException.forbidden("관리자만 처리할 수 있습니다."); limit("support-action:"+p.userId(),60); }
    public Map<String,Object> create(Create c,Principal p) { member(p);limit("support-create:u:"+p.userId(),10);return service.create(c,p); }
    public Map<String,Object> message(UUID id,Message m,Principal p) {member(p);limit("support-message:"+id+":"+p.actorKind()+":"+p.userId(),30);return service.message(id,m,p);}
    public Map<String,Object> action(UUID id,Action a,Principal p) {admin(p);return service.action(id,a,p);}
    public Map<String,Object> publishReviewed(UUID id,Correction c,Principal p) {admin(p);return corrections.publishReviewed(id,c,p);}
    public Map<String,Object> hide(UUID id,Action a,Principal p) {admin(p);return corrections.hide(id,a,p);}
    public Map<String,Object> decide(UUID id,ClaimDecision c,Principal p) {admin(p);return claims.decide(id,c,p);}
    public void revoke(long exhibitor,long user,Revoke r,Principal p) {admin(p);claims.revoke(exhibitor,user,r,p);}
    public Map<String,Object> guestCreate(GuestCreate c,String remote) {limit("guest-create:"+secret+":"+remote,5);return service.guestCreate(c,remote);}
    public Map<String,Object> guestRead(GuestAccess c,String remote) {limit("guest-read:"+secret+":"+remote,60);return service.guestRead(c,remote);}
    public Map<String,Object> guestReply(GuestMessage c,String remote) {limit("guest-read:"+secret+":"+remote,60);limit("guest-message:"+secret+":"+remote,30);return service.guestReply(c,remote);}
}
