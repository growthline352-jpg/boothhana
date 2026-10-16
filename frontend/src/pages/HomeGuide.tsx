import { homeGuide as guide } from '../../seo/home-guide.mjs'
import './home-guide.css'

export function HomeGuide() {
  return <details className="home-guide">
    <summary>{guide.summary}</summary>
    <div className="home-guide-content">
      <h2>{guide.title}</h2>
      <p>{guide.intro}</p>
      <h3>{guide.usageTitle}</h3>
      <p>{guide.usage}</p>
      <h3>{guide.categoriesTitle}</h3>
      <ul className="home-guide-categories">{guide.categories.map(category => <li key={category.key}>
        <a href={category.href}>{category.label} 행사 찾기</a>
        <p>{category.description}</p>
        <a href={category.directoryHref}>{category.label} 전체 행사 목록</a>
      </li>)}</ul>
      <p>{guide.notice}</p>
      <p><a href={guide.aboutHref}>{guide.aboutLabel}</a></p>
    </div>
  </details>
}
