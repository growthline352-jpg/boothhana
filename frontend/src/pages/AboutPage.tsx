import { Link } from 'react-router'
import { categories, categoryHref } from '../features/discovery/categories'
import './about.css'

const roadmap = [
  { number: '01', title: '흩어진 정보를, 연결된 지식으로.', description: '행사 공지, 포스터, 부스 소개와 판매 안내를 AI로 구조화하고 서로 연결할 계획입니다. 출처와 변경 이력을 함께 확인할 수 있는 정보 기반을 지향합니다.' },
  { number: '02', title: '검색을 넘어, 나에게 맞는 하루로.', description: '관심 작품과 브랜드, 일정과 지역을 바탕으로 행사를 추천하고 방문 계획을 돕는 AI 어시스턴트를 구상하고 있습니다. 추천의 이유와 근거를 함께 제시하는 것이 목표입니다.' },
  { number: '03', title: '한 번의 방문을, 다음 만남으로.', description: '관심 행사와 부스의 변화 알림, 창작자와 운영자의 정보 관리, 외부 AI 서비스와의 연계를 단계적으로 검토합니다. 발견에서 방문, 재발견까지 이어지는 경험을 만들고자 합니다.' },
]

export function AboutPage() {
  return <article className="about-page">
    <section className="about-hero about-wrap" aria-labelledby="about-title">
      <p className="about-eyebrow">ABOUT BOOTHANA <span>부스하나 회사소개</span></p>
      <h1 id="about-title">모든 취향이<br />현실에서 <em>만나는 곳.</em></h1>
      <div className="about-hero-bottom">
        <p>좋아하는 것을 발견하는 순간부터, 직접 만나러 가는 순간까지.<br className="about-desktop-break" /> 부스하나는 사람과 행사, 창작자와 브랜드를 연결하는<br className="about-desktop-break" /> 오프라인 경험 플랫폼을 만들어갑니다.</p>
        <a className="about-text-link" href="#vision">우리의 비전 <span aria-hidden="true">↓</span></a>
      </div>
      <div className="about-connections" aria-label="취향에서 발견, 방문, 다음 만남으로 이어지는 경험">
        <span>나의 취향</span><span aria-hidden="true">↗</span><span>새로운 발견</span><span aria-hidden="true">↗</span><span>실제 방문</span><span aria-hidden="true">↗</span><span>다음 만남</span>
      </div>
    </section>

    <section className="about-vision" id="vision" aria-labelledby="vision-title">
      <div className="about-wrap about-split">
        <div><p className="about-eyebrow">OUR VISION</p><h2 id="vision-title">좋아하는 것을 찾는 일이<br />좋아하는 세상을<br /><span>넓히는 일이 되도록.</span></h2></div>
        <div className="about-prose">
          <p>가보고 싶은 행사의 일정은 한 곳에, 참가 부스는 다른 곳에, 판매 안내는 또 다른 게시물에 있습니다. 새로운 경험을 만나는 일은 여전히 여러 페이지를 오가며 정보를 모으는 데서 시작됩니다.</p>
          <p>부스하나는 이 간격을 줄이고자 합니다. 행사 하나를 찾는 데서 끝나지 않고, 그 안의 부스와 상품을 발견하고 나만의 방문을 준비할 수 있도록 정보를 연결합니다.</p>
          <p className="about-statement">우리의 장기적인 목표는 오프라인 경험의 탐색 기반이 되는 것입니다. 사람에게는 취향에 맞는 다음 목적지를, 창작자와 브랜드에는 자신을 기다리는 사람과 만날 기회를 열고자 합니다.</p>
        </div>
      </div>
    </section>

    <section className="about-wrap about-section" aria-labelledby="today-title">
      <div className="about-section-heading"><div><p className="about-eyebrow">WHERE WE START</p><h2 id="today-title">작은 발견부터,<br />실제 경험으로.</h2></div><p>서울·경기의 행사 탐색에서 시작합니다.<br />부스하나에서 지금 만나볼 수 있는 경험입니다.</p></div>
      <div className="about-services">
        <div><span className="about-index">01 / DISCOVER</span><h3>취향에 맞는 행사 발견</h3><p>서브컬처부터 박람회와 축제까지. 일정과 장소, 관심 분야를 살펴보고 가보고 싶은 행사를 찾습니다.</p></div>
        <div><span className="about-index">02 / EXPLORE</span><h3>행사 안의 부스와 상품 탐색</h3><p>공개된 참가 부스와 판매 안내를 함께 살펴봅니다. 행사 이름 너머에 있는 창작자와 브랜드를 발견합니다.</p></div>
        <div><span className="about-index">03 / SAVE</span><h3>다음 방문을 위한 보관함</h3><p>관심 있는 정보를 저장하고 다시 찾아봅니다. 흩어진 관심사를 모아 나만의 방문을 준비합니다.</p></div>
      </div>
      <nav className="about-category-links" aria-label="부스하나 서비스 둘러보기">{categories.map(category => <Link key={category.key} to={categoryHref(category.key)}>{category.label} 둘러보기 <span aria-hidden="true">↗</span></Link>)}</nav>
    </section>

    <section className="about-future" aria-labelledby="future-title"><div className="about-wrap about-section">
      <div className="about-section-heading"><div><p className="about-eyebrow">WHAT COMES NEXT <span className="about-plan-label">향후 개발 방향</span></p><h2 id="future-title">정보를 연결하는 AI.<br />경험을 넓히는 기술.</h2></div><p>더 많이 보여주는 것을 넘어,<br />각자에게 의미 있는 발견을 돕고자 합니다.</p></div>
      <div className="about-roadmap">{roadmap.map(item => <div className="about-roadmap-row" key={item.number}><span className="about-index">{item.number}</span><h3>{item.title}</h3><p>{item.description}</p></div>)}</div>
      <p className="about-plan-note">위 AI 기능은 향후 개발 구상이며 현재 제공되는 기능이 아닙니다. 정보의 정확성, 이용자 경험과 운영 가능성을 검증하며 구체화할 예정입니다.</p>
    </div></section>

    <section className="about-wrap about-section about-company" aria-labelledby="company-title">
      <div><p className="about-eyebrow">THE COMPANY BEHIND BOOTHANA</p><h2 id="company-title">연결의 가능성을 만드는<br />그로스라인.</h2><p>그로스라인은 부스하나를 개발·운영합니다.<br />소프트웨어로 정보의 간격을 줄이고,<br />더 많은 발견이 실제 만남으로 이어지도록 일합니다.</p></div>
      <dl className="about-facts"><div><dt>운영사</dt><dd>그로스라인 <span>Growthline</span></dd></div><div><dt>서비스</dt><dd>부스하나 <span>Boothana</span></dd></div><div><dt>대표</dt><dd>유창혜</dd></div><div><dt>사업 시작</dt><dd>2026년 5월</dd></div><div><dt>소재지</dt><dd>대한민국 서울</dd></div><div><dt>사업 분야</dt><dd>소프트웨어 개발 · 온라인 플랫폼</dd></div></dl>
    </section>

    <section className="about-contact" aria-labelledby="contact-title"><div className="about-wrap"><p className="about-eyebrow">LET’S BUILD THE NEXT CONNECTION</p><h2 id="contact-title">다음 만남의 가능성을<br />함께 넓혀가요.</h2><p>행사 정보 연계, 서비스 협업, 사업 제안을 기다립니다.</p><a href="mailto:contact@boothana.kr">contact@boothana.kr <span aria-hidden="true">↗</span></a><span className="about-contact-note">부스하나 · 그로스라인</span></div></section>
    <section className="about-wrap about-section about-network" id="growthline-services" aria-labelledby="network-title">
      <div className="about-section-heading"><div><p className="about-eyebrow">MORE FROM GROWTHLINE</p><h2 id="network-title">발견을 돕고, 이야기를 알리고.<br />비즈니스의 다음 성장을 만듭니다.</h2></div></div>
      <p className="about-network-intro">부스하나가 취향에 맞는 경험의 발견을 돕는다면, 모종애드는 브랜드의 이야기를 콘텐츠로 전합니다. 그로스라인은 사람들이 발견하고 행동하는 과정과, 기업이 고객을 만나고 운영하는 과정을 기술로 연결하고자 합니다.</p>
      <div className="about-network-grid">
        <div className="about-network-item">
          <p className="about-eyebrow">MOJONG AD <span>AI 마케팅 콘텐츠</span></p>
          <h3>모종애드</h3><p className="about-network-lead">브랜드 안의 이야기를,<br />꾸준히 이어지는 콘텐츠로.</p>
          <p>가게의 메뉴, 제품의 특징, 고객이 자주 묻는 질문에서 콘텐츠의 주제를 찾습니다. 주제와 구성안을 선택하면 AI가 이미지·영상·블로그 콘텐츠 제작을 돕는 통합 마케팅 솔루션입니다.</p>
          <p>주제 제안과 제작에서 게시·분석으로 이어지는 흐름을 지향하며, 작은 브랜드도 자신의 이야기를 꾸준히 전할 수 있도록 돕습니다.</p>
          <a className="about-text-link" href="https://app.danbammsg.co.kr/home" target="_blank" rel="noopener noreferrer">모종애드 둘러보기 <span aria-hidden="true">↗</span><span className="about-sr-only"> (새 창)</span></a>
        </div>
        <div className="about-network-item">
          <p className="about-eyebrow">GROWTHLINE <span>기업 홈페이지</span></p>
          <h3>그로스라인</h3><p className="about-network-lead">사업의 흐름을 이해하고,<br />성장에 필요한 시스템을 만듭니다.</p>
          <p>고객 유입부터 문의와 전환, 일상의 운영까지. 사업이 멈추는 구간을 살펴보고 웹서비스와 자동화, 데이터 기반의 개선으로 연결합니다.</p>
          <p>그로스라인 홈페이지에서 서비스 분야와 프로젝트, 사업을 바라보는 관점을 확인하고, 새로운 서비스 구축이나 기존 사업의 운영 개선을 상담할 수 있습니다.</p>
          <a className="about-text-link" href="https://www.danbammsg.co.kr/" target="_blank" rel="noopener noreferrer">그로스라인 홈페이지 <span aria-hidden="true">↗</span><span className="about-sr-only"> (새 창)</span></a>
        </div>
      </div>
    </section>
  </article>
}
