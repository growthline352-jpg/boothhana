package com.boothhana.interests;
import com.boothhana.security.CurrentUser;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.boothhana.interests.InterestModels.*;
@RestController
public class SubcultureInterestController {
 private final SubcultureInterestService interests;private final InterestFeed feed;private final CurrentUser current;
 public SubcultureInterestController(SubcultureInterestService interests,InterestFeed feed,CurrentUser current){this.interests=interests;this.feed=feed;this.current=current;}
 private <T> ResponseEntity<T> response(T data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary","Cookie").body(data);}
 @GetMapping("/api/public/subculture/subjects") public Object subjects(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String kind,@RequestParam(defaultValue="0") int page){return response(interests.subjects(q,kind,page));}
 @GetMapping("/api/public/subculture/subjects/{id}") public Object subject(@PathVariable UUID id){return response(interests.subject(id));}
 @GetMapping("/api/public/subculture/creators") public Object creators(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page){return response(interests.creators(q,page));}
 @GetMapping("/api/public/subculture/creators/{id}") public Object creator(@PathVariable long id){return response(interests.creator(id));}
 @GetMapping("/api/public/subculture/home") public Object home(@RequestParam(required=false) UUID subjectId,@RequestParam(required=false) Long creatorId,@RequestParam(defaultValue="0") int page){return response(feed.home(null,null,subjectId,creatorId,page));}
 @GetMapping("/api/me/subculture/home") public Object mine(Authentication auth,@RequestParam(required=false) UUID interestId,@RequestParam(defaultValue="0") int page){return response(feed.home(current.require(auth).id,interestId,null,null,page));}
 @GetMapping("/api/me/subculture/interests") public Object settings(Authentication auth){return response(interests.view(current.require(auth).id));}
 @PutMapping("/api/me/subculture/interests") public Object save(Authentication auth,@RequestBody Settings input){long owner=current.require(auth).id;interests.save(owner,input);return response(interests.view(owner));}
 @GetMapping("/api/admin/subculture/subjects") public Object adminSubjects(){return response(interests.adminSubjects());}
 @GetMapping("/api/admin/subculture/subjects/{id}/links") public Object adminLinks(@PathVariable UUID id){return response(interests.adminLinks(id));}
 @PutMapping("/api/admin/subculture/subjects/{id}") public Object reviewSubject(Authentication auth,@PathVariable UUID id,@RequestBody SubjectInput input){return response(interests.reviewSubject(current.require(auth).id,id,input));}
 @PutMapping("/api/admin/subculture/subject-links/{id}") public Object reviewLink(Authentication auth,@PathVariable UUID id,@RequestBody LinkInput input){return response(interests.reviewLink(current.require(auth).id,id,input));}
}
