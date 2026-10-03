import { DiscoveryPage } from '../features/discovery/DiscoveryPage'
import { useLocation } from 'react-router'
import { categories, categoryHref } from '../features/discovery/categories'
import { categorySitesActive, currentSiteCategory } from '../features/discovery/site'
import { PopularEvents } from '../features/discovery/PopularEvents'
/** The public home is the real category feed, never a seeded marketing demo. */
export function HomePage() {
  const location = useLocation()
  if (!categorySitesActive() || currentSiteCategory() || location.search) return <DiscoveryPage />
  return <section className="discovery-container category-portal">
    <h1>어떤 행사를 찾고 계세요?</h1><p>서브컬처, 박람회, 축제, 팝업. 관심 있는 분야의 행사와 참가 부스를 찾아보세요.</p>
    <div className="category-portal-grid">{categories.map(category => <a key={category.key} href={categoryHref(category.key)}>
      <div className={`category-portal-media is-${category.key}`}><img src={category.key === 'popups' ? '/assets/categories/popups.svg' : `/assets/categories/${category.key}-3d.webp`} alt="" loading="lazy" width="640" height="640"/></div>
      <div className="category-portal-content"><h2>부스하나 {category.label}</h2><p>{category.description}</p><span>{category.label} 둘러보기 →</span></div>
    </a>)}</div>
    <PopularEvents/>
  </section>
}
