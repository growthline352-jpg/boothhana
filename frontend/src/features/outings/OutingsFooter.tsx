import { OutingsLogo } from './OutingsLogo'

type FooterView = 'discover' | 'plans' | 'saved'

export function OutingsFooter({ onNavigate }: { onNavigate: (view: FooterView) => void }) {
  return <footer className="o-footer">
    <div className="o-footer-inner">
      <div className="o-footer-top">
        <div className="o-footer-brand">
          <a href="/outings" onClick={event => { event.preventDefault(); onNavigate('discover'); window.scrollTo({ top: 0 }) }} aria-label="부스하나 발견 홈">
            <OutingsLogo/>
          </a>
          <p>취향을 따라, 함께 오프라인으로.</p>
          <span>팝업부터 박람회, 축제까지.<br/>가보고 싶은 곳을 발견하고 하루로 이어보세요.</span>
        </div>
        <nav aria-label="푸터 메뉴" className="o-footer-menus">
          <div><h2>함께 보내는 하루</h2>
            <a href="/outings" onClick={event => { event.preventDefault(); onNavigate('discover'); window.scrollTo({ top: 0 }) }}>행사 발견</a>
            <a href="/outings?view=plans" onClick={event => { event.preventDefault(); onNavigate('plans') }}>내 일정</a>
            <a href="/outings?view=saved" onClick={event => { event.preventDefault(); onNavigate('saved') }}>보관함</a>
          </div>
          <div><h2>다른 부스하나 둘러보기</h2>
            <a href="https://subculture.boothana.kr/">서브컬처 <span aria-hidden="true">↗</span></a>
            <a href="https://expo.boothana.kr/" target="_blank" rel="noreferrer">박람회 <span aria-hidden="true">↗</span><span className="o-sr-only"> (새 창)</span></a>
            <a href="https://festival.boothana.kr/" target="_blank" rel="noreferrer">축제·행사 <span aria-hidden="true">↗</span><span className="o-sr-only"> (새 창)</span></a>
          </div>
          <div><h2>부스하나 안내</h2>
            <a href="/about">회사소개</a>
            <a href="/support">고객센터</a>
            <a href="/library">내 방문·보관함</a><a href="/itinerary?step=0">행사 중심 일정 만들기</a>
          </div>
        </nav>
      </div>
      <div className="o-footer-bottom">
        <small>© {new Date().getFullYear()} BoothHana</small>
        <div><p>로그인하면 일정을 계정에 저장하고 다른 기기에서 이어서 볼 수 있어요. 초안과 장소 보관함은 이 기기에 보관됩니다.</p>
          <p>예시 행사는 체험용입니다. 실제 방문 전 주최 측의 최신 일정과 이용 조건을 확인해 주세요.</p></div>
      </div>
    </div>
  </footer>
}
