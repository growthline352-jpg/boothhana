import { Link } from 'react-router'
import './legal.css'

function LegalHeader({ title, summary }: { title: string; summary: string }) {
  return <header className="legal-heading">
    <span className="legal-eyebrow">부스하나 서비스 안내</span>
    <h1>{title}</h1>
    <p>{summary}</p>
    <div className="legal-meta"><span>초안 작성일 2026. 9. 30.</span><span>운영자 검토 전</span></div>
    <div className="legal-draft" role="note"><strong>검토용 초안</strong><p>운영 주체·연락처, 보유기간 및 외부 서비스 계약 내용을 확인해 확정해야 합니다. 이 문서는 최종 법률 검토를 대신하지 않습니다.</p></div>
  </header>
}

export function PrivacyPage() {
  return <div className="content-wrap section-pad legal-page">
    <LegalHeader title="개인정보처리방침" summary="부스하나에서 어떤 정보를 왜 사용하고, 어떻게 관리하는지 안내합니다." />
    <div className="legal-layout">
      <nav className="legal-toc" aria-label="개인정보처리방침 목차">
        <strong>목차</strong>
        <a href="#privacy-purpose">처리 목적과 항목</a><a href="#privacy-public">공개되는 정보</a><a href="#privacy-retention">보유와 파기</a>
        <a href="#privacy-providers">외부 서비스</a><a href="#privacy-cookies">쿠키와 방문 통계</a><a href="#privacy-rights">이용자 권리</a><a href="#privacy-contact">문의</a>
      </nav>
      <article className="legal-content">
        <section id="privacy-purpose"><h2>1. 처리 목적과 항목</h2>
          <p>부스하나는 행사·부스 정보를 찾고 저장하는 서비스입니다. 실제 이용 기능에 따라 다음 정보를 처리합니다. 선택 기능을 사용하지 않으면 해당 정보는 수집하지 않습니다.</p>
          <div className="legal-table-wrap"><table><thead><tr><th scope="col">이용 기능</th><th scope="col">처리하는 정보</th><th scope="col">목적</th></tr></thead><tbody>
            <tr><th scope="row">카카오 로그인</th><td>카카오 사용자 식별값, 닉네임, 로그인 세션 정보</td><td>회원 식별과 계정 유지</td></tr>
            <tr><th scope="row">보관함·방문 기록</th><td>저장한 행사·부스, 메모, 방문 날짜와 선택한 오프라인 자료</td><td>개인 보관함 제공</td></tr>
            <tr><th scope="row">댓글·후기</th><td>닉네임, 작성 내용, 작성 시각</td><td>행사별 의견 공유와 운영 관리</td></tr>
            <tr><th scope="row">문의·신고·인증 신청</th><td>작성한 내용, 대상 정보, 첨부 자료와 처리 내역</td><td>문의 답변, 정보 정정, 주최자·부스 운영자 확인</td></tr>
            <tr><th scope="row">직접 운영 행사 예약</th><td>예약 대상·수량·상태, 수령 확인에 필요한 식별 정보</td><td>예약과 현장 수령 처리</td></tr>
            <tr><th scope="row">서비스 운영</th><td>접속·오류·보안 기록, 세션 및 보안 쿠키</td><td>서비스 안정성과 부정 이용 방지</td></tr>
          </tbody></table></div>
          <p>비회원 임시 보관함과 오프라인 자료는 주로 이용 중인 기기에 저장됩니다. 기기를 공유하거나 브라우저 데이터를 지우면 기록이 노출되거나 사라질 수 있습니다. 비회원 로그인 장애 문의가 활성화된 경우에는 이용자가 작성한 문의 내용과 임의의 조회키가 처리됩니다.</p>
        </section>
        <section id="privacy-public"><h2>2. 공개되는 정보와 제3자 제공</h2>
          <p>행사 댓글에는 작성자의 닉네임과 댓글 내용이 다른 이용자에게 표시됩니다. 주최자·부스 운영자 확인을 받은 경우 확인된 명칭과 범위가 공개될 수 있습니다. 문의·신고 내용, 보관함 메모, 예약 내역은 이 공개 화면에 표시하지 않습니다.</p>
          <p>이용자의 개인정보를 광고 목적으로 판매하지 않습니다. 법령에 근거하거나 이용자의 별도 동의가 필요한 제공은 그 근거와 범위를 확인하여 처리합니다.</p>
        </section>
        <section id="privacy-retention"><h2>3. 보유기간과 파기</h2>
          <p>개별 보관함 항목과 댓글은 이용자가 화면에서 삭제하거나 공개를 중단할 수 있습니다. 댓글 삭제는 즉시 공개를 중단하는 방식이며, 저장 기록의 실제 파기 시점과 백업 보존기간은 운영 정책 확인이 필요합니다. 회원 탈퇴 기능은 아직 제공되지 않아 계정 삭제 요청은 <Link to="/support">고객센터</Link>로 접수합니다.</p>
          <p>계정, 예약, 문의·신고, 인증 자료, 운영 기록의 구체적인 보유기간과 법령상 보존기간은 운영자가 확정하여 이 항목에 기재해야 합니다. 목적이 끝나고 보존 근거가 없어진 정보는 복구할 수 없는 방식으로 삭제하거나 파기합니다.</p>
        </section>
        <section id="privacy-providers"><h2>4. 외부 서비스와 국외 이전 확인 사항</h2>
          <p>서비스 제공에 카카오 로그인, 웹 호스팅(Vercel), 데이터베이스(Supabase), 파일 저장(Google Cloud Storage), 연결·보안 인프라(Cloudflare)를 사용합니다. 선택적 방문 통계에는 Google Analytics를 사용합니다. 각 사업자의 처리 업무, 이전 국가·방법, 보유기간 및 연락처는 실제 계약·운영 설정을 확인하여 최종 방침에 반영해야 합니다.</p>
          <p>부스하나의 카카오 로그인은 카카오에서 제공받은 식별값과 닉네임을 계정에 연결합니다. 공개 행사 링크를 눌러 외부 사이트로 이동한 이후의 정보 처리는 해당 사이트의 방침이 적용됩니다.</p>
        </section>
        <section id="privacy-cookies"><h2>5. 쿠키와 선택적 방문 통계</h2>
          <p>로그인 상태와 요청 보안을 위해 세션·보안 쿠키를 사용합니다. Google Analytics는 별도 허용을 선택한 경우에만 공개 페이지의 방문과 기기·브라우저 정보를 측정합니다. 검색어, 계정 정보, 문의 내용은 방문 통계에 보내지 않도록 구성했습니다.</p>
          <p>화면의 ‘방문 통계 설정’에서 허용을 거절하거나 철회할 수 있습니다. 거절해도 행사 검색과 보관함 등 기본 기능은 계속 이용할 수 있습니다.</p>
        </section>
        <section id="privacy-rights"><h2>6. 이용자의 권리와 안전 조치</h2>
          <p>이용자는 자신의 정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다. 보관함 항목과 본인 댓글은 제공된 화면에서 직접 관리할 수 있으며, 그 밖의 요청은 고객센터로 접수해 본인 확인 후 처리합니다. 법령상 제한이 있으면 이유를 안내합니다.</p>
          <p>서비스는 접근 권한 구분, 인증 및 전송 구간 보호, 비공개 첨부 자료에 대한 접근 제한 등 필요한 안전 조치를 적용합니다. 이용자는 댓글·문의에 다른 사람의 주민등록번호, 비밀번호 또는 결제정보를 적지 않아야 합니다.</p>
        </section>
        <section id="privacy-contact"><h2>7. 개인정보 관련 문의와 변경</h2>
          <p>개인정보 관련 문의와 권리 행사는 <Link to="/support">고객센터</Link>에서 접수합니다. 운영 주체명, 개인정보 보호책임자, 연락 이메일·전화번호는 운영자가 확인 후 이곳에 추가해야 합니다.</p>
          <p>방침의 확정 시행일과 변경 이력은 운영자 검토 후 기재합니다. 중요한 변경이 있으면 서비스에서 알리겠습니다.</p>
        </section>
      </article>
    </div>
  </div>
}

export function TermsPage() {
  return <div className="content-wrap section-pad legal-page">
    <LegalHeader title="이용약관" summary="행사 정보 탐색과 계정 기능을 이용할 때의 기본 조건을 안내합니다." />
    <div className="legal-layout">
      <nav className="legal-toc" aria-label="이용약관 목차">
        <strong>목차</strong>
        <a href="#terms-service">서비스 범위</a><a href="#terms-account">계정과 이용</a><a href="#terms-content">게시물과 정보</a>
        <a href="#terms-reservation">예약과 외부 거래</a><a href="#terms-change">변경과 중단</a><a href="#terms-dispute">문의와 분쟁</a>
      </nav>
      <article className="legal-content">
        <section id="terms-service"><h2>1. 서비스의 범위</h2>
          <p>부스하나는 서울·경기 등의 행사, 참가 부스, 공개 상품과 배치도 정보를 찾고 저장할 수 있는 서비스를 제공합니다. 수집한 외부 행사 정보는 해당 주최 측의 공식 발표와 다를 수 있으므로 방문·구매 전 최신 공지를 확인해 주세요.</p>
          <p>‘주최자 확인’과 ‘운영자 확인’ 표시는 표시된 행사 회차 또는 업체 범위의 관리 관계를 확인했다는 뜻입니다. 행사 내용 전체나 상품 품질을 보증하는 표시는 아닙니다.</p>
        </section>
        <section id="terms-account"><h2>2. 계정과 이용자의 책임</h2>
          <p>일부 기능은 카카오 로그인이 필요합니다. 이용자는 본인의 계정을 안전하게 관리하고, 허위 신분으로 인증을 신청하거나 타인의 계정·권리를 침해해서는 안 됩니다. 비회원 기기 저장 자료는 해당 브라우저에서만 관리될 수 있습니다.</p>
          <p>서비스를 악용한 자동 요청, 타인의 개인정보 게시, 권리 침해, 허위 신고, 행사·부스 관계의 사칭은 허용되지 않습니다. 위반이 확인되면 필요한 범위에서 게시물의 노출을 제한하거나 이용을 제한할 수 있으며, 가능한 경우 사유와 이의 제기 방법을 안내합니다.</p>
        </section>
        <section id="terms-content"><h2>3. 행사 정보와 이용자 게시물</h2>
          <p>행사 일정·입장 조건·배치도·판매 정보는 변경될 수 있습니다. 부스하나는 출처를 확인하고 잘못된 정보 신고를 접수하지만, 외부 주최자의 운영 또는 현장 거래를 대신하지 않습니다. 서비스의 고의 또는 과실에 따른 법적 책임을 이 약관으로 배제하지 않습니다.</p>
          <p>이용자가 작성한 댓글·후기·문의의 권리는 원칙적으로 작성자에게 있습니다. 이용자는 서비스 화면에 게시·보관·전달하는 데 필요한 범위에서 그 내용을 이용하도록 허용합니다. 공개 댓글에는 개인 연락처나 민감한 정보를 적지 말아 주세요. 권리 침해나 잘못된 정보는 <Link to="/support">고객센터</Link>에 신고할 수 있습니다.</p>
        </section>
        <section id="terms-reservation"><h2>4. 예약과 외부 거래</h2>
          <p>‘예약 가능한 행사’의 부스 예약·현장 수령 기능은 부스하나에 직접 등록된 행사에서만 제공됩니다. 예약 가능 수량, 운영시간 및 취소 조건은 해당 예약 화면과 운영 안내를 확인해 주세요. 외부 수집 행사·상품의 소개는 부스하나에서 결제·구매가 성립했다는 뜻이 아닙니다.</p>
          <p>외부 예매처·판매처로 이동하여 이루어지는 구매, 결제, 환불은 해당 사업자의 조건이 적용됩니다. 부스하나 화면에서 직접 결제 기능을 제공하는 경우에는 결제·환불 조건을 별도로 명확히 안내해야 합니다.</p>
        </section>
        <section id="terms-change"><h2>5. 서비스와 약관의 변경</h2>
          <p>정보의 정확성·보안·안정성을 위해 기능이나 노출 정보를 변경할 수 있습니다. 중요한 서비스 중단이나 이용 조건 변경이 예상되면 가능한 방법으로 미리 알리며, 긴급한 보안·장애 대응은 사후에 안내할 수 있습니다. 이용자에게 불리한 약관 변경은 관련 법령에 따른 고지·동의 절차를 따릅니다.</p>
        </section>
        <section id="terms-dispute"><h2>6. 문의와 분쟁</h2>
          <p>서비스 이용 관련 문의는 <Link to="/support">고객센터</Link>에서 접수합니다. 분쟁에는 대한민국 법령을 적용하며, 관할과 소비자의 권리는 관련 법령에 따릅니다. 운영 주체명, 공식 연락처 및 확정 시행일은 운영자가 검토 후 추가합니다.</p>
          <p>개인정보 처리에 관한 내용은 <Link to="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.</p>
        </section>
      </article>
    </div>
  </div>
}
