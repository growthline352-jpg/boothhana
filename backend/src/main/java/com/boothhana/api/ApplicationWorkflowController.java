package com.boothhana.api;
import com.boothhana.api.ApiModels.*;
import com.boothhana.service.ApplicationWorkflowService;
import com.boothhana.security.CurrentUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
public class ApplicationWorkflowController {
 private final ApplicationWorkflowService service;private final CurrentUser current;
 public ApplicationWorkflowController(ApplicationWorkflowService service,CurrentUser current){this.service=service;this.current=current;}
 @PostMapping("/api/creator/applications") public ApplicationView apply(Authentication a,@RequestBody ApplicationInput i){return service.apply(current.require(a),i);}
 @GetMapping("/api/creator/applications") public List<ApplicationView> mine(Authentication a){return service.mine(current.require(a));}
 @GetMapping("/api/creator/applications/{id}/history") public List<Map<String,Object>> ownHistory(Authentication a,@PathVariable long id){return service.history(current.require(a),id,false);}
 @GetMapping("/api/admin/applications/{id}/history") public List<Map<String,Object>> history(Authentication a,@PathVariable long id){return service.history(current.require(a),id,true);}
 @PostMapping("/api/creator/applications/{id}/resubmit") public ApplicationView resubmit(Authentication a,@PathVariable long id,@RequestBody ApplicationDecision i){return service.change(current.require(a),id,i,"RESUBMIT",false);}
 @PostMapping("/api/creator/applications/{id}/withdraw") public ApplicationView withdraw(Authentication a,@PathVariable long id,@RequestBody ApplicationDecision i){return service.change(current.require(a),id,i,"WITHDRAW",false);}
 @PostMapping("/api/admin/applications/{id}/approve") public ApplicationView approve(Authentication a,@PathVariable long id,@RequestBody ApplicationDecision i){return service.change(current.require(a),id,i,"APPROVE",true);}
 @PostMapping("/api/admin/applications/{id}/reject") public ApplicationView reject(Authentication a,@PathVariable long id,@RequestBody ApplicationDecision i){return service.change(current.require(a),id,i,"REJECT",true);}
}
