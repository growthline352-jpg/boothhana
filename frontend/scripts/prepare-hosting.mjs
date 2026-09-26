import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Keep the template OUTSIDE public dist so filesystem precedence cannot bypass the renderer. */
export async function prepareHosting(base = process.cwd()) {
  const built = join(base, 'dist', 'index.html')
  const html = await readFile(built, 'utf8')
  if (!html.includes('<!-- BOOTH_META_START -->') || !html.includes('<!-- BOOTH_META_END -->')) throw new Error('Built metadata markers missing')
  if (!/<script[^>]+src="\/assets\//.test(html)) throw new Error('Run a real production build first')
  await mkdir(join(base, 'seo-template'), { recursive: true })
  await writeFile(join(base, 'seo-template', 'index.html'), html)
  await unlink(built)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareHosting()
  console.log('Hosting prepared: private template bundled with API; public assets retained.')
}
