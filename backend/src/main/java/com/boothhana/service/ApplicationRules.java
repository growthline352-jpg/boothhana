package com.boothhana.service;
public final class ApplicationRules {
 private ApplicationRules(){}
 public static String next(String status,String action,boolean published){
  if(status==null||action==null)throw new IllegalArgumentException("신청 상태를 확인해 주세요.");
  return switch(action){
   case "APPROVE","REJECT"->{if(!published||!"PENDING".equals(status))throw new IllegalArgumentException("공개 중인 행사의 대기 신청만 처리할 수 있습니다.");yield "APPROVE".equals(action)?"APPROVED":"REJECTED";}
   case "RESUBMIT"->{if(!published||!("REJECTED".equals(status)||"WITHDRAWN".equals(status)||"PENDING".equals(status)))throw new IllegalArgumentException("공개 중인 행사의 대기·반려·철회 내역만 다시 등록할 수 있습니다.");yield "APPROVED";}
   case "WITHDRAW"->{if(!"PENDING".equals(status))throw new IllegalArgumentException("대기 중인 신청만 철회할 수 있습니다. 승인된 부스는 고객센터로 문의해 주세요.");yield "WITHDRAWN";}
   default->throw new IllegalArgumentException("지원하지 않는 신청 처리입니다.");
  };
 }
}
