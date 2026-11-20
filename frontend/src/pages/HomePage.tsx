import { SubcultureHome } from '../features/subculture/SubculturePages'
import { DiscoveryPage } from '../features/discovery/DiscoveryPage'
import { useLocation } from 'react-router'
import { categories, categoryHref } from '../features/discovery/categories'
import { categorySitesActive, currentSiteCategory } from '../features/discovery/site'
import { PopularEvents } from '../features/discovery/PopularEvents'

const categoryImages = {
  subculture: '/assets/categories/subculture.jpg',
  exhibitions: '/assets/categories/exhibitions.jpg',
  festivals: '/assets/categories/festivals.jpg',
} as const

/** The public home is the real category feed, never a seeded marketing demo. */
export function HomePage() {
  const location = useLocation()
  const params=new URLSearchParams(location.search)
  const category=currentSiteCategory()||params.get('category')||(!categorySitesActive()?'subculture':null)
  if(category==='subculture'&&![...params.keys()].some(key=>['q','subcategory','from','to','region','sort'].includes(key)))return <SubcultureHome/>
  if (!categorySitesActive() || currentSiteCategory() || location.search) return <DiscoveryPage />
  return <section className="discovery-container category-portal">
    <h1>어떤 행사를 찾고 계세요?</h1><p>서브컬처, 박람회, 축제. 관심 있는 분야의 행사와 참가 부스를 찾아보세요.</p>
    <div className="category-portal-grid">{categories.map(category => <a key={category.key} href={categoryHref(category.key)}>
      <div className="category-portal-media"><img src={categoryImages[category.key]} alt="" width="1536" height="1024" loading={category.key === 'subculture' ? 'eager' : 'lazy'} decoding="async" /></div>
      <div className="category-portal-content"><h2>부스하나 {category.label}</h2><p>{category.description}</p><span>{category.label} 둘러보기 →</span></div>
    </a>)}</div>
    <PopularEvents />
  </section>
}
