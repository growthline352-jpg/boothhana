package com.boothhana.support;
import com.boothhana.security.CurrentUser;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CollectionModels.PageData;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

@RestController
public class SupportController {
 private SupportOperations operations;
 @org.springframework.beans.factory.annotation.Autowired public void configureOperations(SupportOperations operations){this.operations=java.util.Objects.requireNonNull(operations);}

 private final SupportService service;private final SupportTargets targets;private final SupportAttachments attachments;
 private final SupportResolutionService corrections;private final ExhibitorClaimsService claims;private final CurrentUser current;
 public SupportController(SupportService service,SupportTargets targets,SupportAttachments attachments,SupportResolutionService corrections,ExhibitorClaimsService claims,CurrentUser current){this.service=service;this.targets=targets;this.attachments=attachments;this.corrections=corrections;this.claims=claims;this.current=current;}
 private Principal user(Authentication auth){return new Principal(current.require(auth).id,false,false);}
 private Principal admin(Authentication auth){long id=current.require(auth).id;if(auth.getAuthorities().stream().noneMatch(a->"ROLE_ADMIN".equals(a.getAuthority())))throw ApiException.forbidden("관리자 권한이 필요합니다.");return new Principal(id,true,false);}
 @GetMapping("/api/public/support/options") public Map<String,Object> options(){var m=new LinkedHashMap<>(service.capabilities());m.put("attachmentsEnabled",attachments.available());m.put("maxAttachmentBytes",5242880);m.put("maxAttachments",5);return m;}
 @PostMapping("/api/public/support/target") public Resolved target(@RequestBody Target t,Authentication auth){Long owner=auth==null||auth instanceof AnonymousAuthenticationToken?null:current.require(auth).id;return targets.resolve(t,owner);}
 @GetMapping("/api/public/support/claimables") public List<Map<String,Object>> claimables(@RequestParam long eventId,@RequestParam long participantId){return targets.claimables(eventId,participantId);}
 @GetMapping("/api/me/support/tickets") public PageData<Map<String,Object>> mine(Authentication a,@RequestParam String kind,@RequestParam(defaultValue="")String status,@RequestParam(defaultValue="0")int page){return service.list(user(a),kind,status,page);}
 @GetMapping("/api/me/support/requests/{id}") public Map<String,Object> receipt(Authentication a,@PathVariable UUID id){return service.receipt(id,user(a));}
 @PostMapping("/api/me/support/tickets") @ResponseStatus(HttpStatus.CREATED) public Map<String,Object> create(Authentication a,@RequestBody Create c){return operations.create(c,user(a));}
 @GetMapping("/api/me/support/tickets/{id}") public Map<String,Object> detail(Authentication a,@PathVariable UUID id){return service.detail(id,user(a));}
 @PostMapping("/api/me/support/tickets/{id}/messages") public Map<String,Object> message(Authentication a,@PathVariable UUID id,@RequestBody Message m){return operations.message(id,m,user(a));}
 @GetMapping("/api/admin/support/tickets") public PageData<Map<String,Object>> queue(Authentication a,@RequestParam String kind,@RequestParam(defaultValue="")String status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="")String category){return service.list(admin(a),kind,status,page,category);}
 @GetMapping("/api/admin/support/tickets/{id}") public Map<String,Object> adminDetail(Authentication a,@PathVariable UUID id){return service.detail(id,admin(a));}
 @PostMapping("/api/admin/support/tickets/{id}/messages") public Map<String,Object> reply(Authentication a,@PathVariable UUID id,@RequestBody Message m){return operations.message(id,m,admin(a));}
 @PostMapping("/api/admin/support/tickets/{id}/actions") public Map<String,Object> action(Authentication a,@PathVariable UUID id,@RequestBody Action i){return operations.action(id,i,admin(a));}
 @PostMapping("/api/admin/support/tickets/{id}/publish-reviewed") public Map<String,Object> correct(Authentication a,@PathVariable UUID id,@RequestBody Correction i){return operations.publishReviewed(id,i,admin(a));}
 @PostMapping("/api/admin/support/tickets/{id}/hide") public Map<String,Object> hide(Authentication a,@PathVariable UUID id,@RequestBody Action i){return operations.hide(id,i,admin(a));}
 @PostMapping("/api/admin/support/tickets/{id}/claim-decision") public Map<String,Object> claimDecision(Authentication a,@PathVariable UUID id,@RequestBody ClaimDecision i){return operations.decide(id,i,admin(a));}
 @GetMapping("/api/me/support/managed-exhibitors") public List<Map<String,Object>> managed(Authentication a){return claims.mine(user(a).userId());}
 @PostMapping("/api/admin/support/managers/{exhibitor}/{user}/revoke") @ResponseStatus(HttpStatus.NO_CONTENT) public void revoke(Authentication a,@PathVariable long exhibitor,@PathVariable long user,@RequestBody Revoke i){operations.revoke(exhibitor,user,i,admin(a));}
 @PostMapping("/api/public/support/guest/tickets") @ResponseStatus(HttpStatus.CREATED) public ResponseEntity<Map<String,Object>> guestCreate(@RequestBody GuestCreate c,HttpServletRequest r){return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(operations.guestCreate(c,r.getRemoteAddr()));}
 @PostMapping("/api/public/support/guest/read") public ResponseEntity<Map<String,Object>> guestRead(@RequestBody GuestAccess a,HttpServletRequest r){return privateResponse(operations.guestRead(a,r.getRemoteAddr()));}
 @PostMapping("/api/public/support/guest/messages") public ResponseEntity<Map<String,Object>> guestMessage(@RequestBody GuestMessage a,HttpServletRequest r){return privateResponse(operations.guestReply(a,r.getRemoteAddr()));}
 private ResponseEntity<Map<String,Object>> privateResponse(Map<String,Object> x){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").body(x);}
 @PostMapping("/api/me/support/tickets/{id}/attachments/{upload}") public Map<String,Object> upload(Authentication a,@PathVariable UUID id,@PathVariable UUID upload,@RequestParam String sha256,@RequestParam long size,HttpServletRequest r)throws IOException{
  return attachments.upload(id,new AttachmentInput(upload,r.getContentType(),size,sha256),user(a),r.getInputStream());
 }
 @GetMapping({"/api/me/support/tickets/{id}/attachments/{attachment}","/api/admin/support/tickets/{id}/attachments/{attachment}"})
 public ResponseEntity<byte[]> download(Authentication a,@PathVariable UUID id,@PathVariable UUID attachment,HttpServletRequest r){
  var file=attachments.download(id,attachment,r.getRequestURI().startsWith("/api/admin/")?admin(a):user(a));
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Content-Disposition","attachment; filename=\"support-"+attachment+("image/png".equals(file.type())?".png":"image/webp".equals(file.type())?".webp":".jpg")+"\"")
   .header("X-Content-Type-Options","nosniff").header("Referrer-Policy","no-referrer").contentType(MediaType.parseMediaType(file.type())).body(file.bytes());
 }
}
