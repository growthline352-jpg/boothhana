package com.boothhana.api;
public class HandlerSmoke {
 public static void main(String[] args){
  var ex=new IllegalArgumentException("Authorization: SUPERSECRET, customer phone=010-1234-5678");
  var response=new ApiExceptionHandler().handleUnexpected(ex,name->"/api/admin/events/{id}");
  int checks=0;
  if(response.status!=500)throw new AssertionError();checks++;
  if(!response.value.requestId().matches("[0-9a-f-]{36}"))throw new AssertionError();checks++;
  if(!response.headers.get("X-Request-ID").equals(response.value.requestId()))throw new AssertionError();checks++;
  if(response.value.message().contains("SECRET"))throw new AssertionError();checks++;
  String log=org.slf4j.LoggerFactory.last;
  if(log.contains("SECRET")||log.contains("010-1234")||!log.contains(response.value.requestId()))throw new AssertionError();checks++;
  if(!log.contains("IllegalArgumentException"))throw new AssertionError();checks++;
  var legacy=new ApiModels.ErrorView(401,"UNAUTHORIZED","로그인 필요",null);
  if(legacy.requestId()!=null)throw new AssertionError();checks++;
  System.out.println("PASS: "+checks+" actual error-handler conditions, external HTTP/log types are STUBS.");
 }
}
