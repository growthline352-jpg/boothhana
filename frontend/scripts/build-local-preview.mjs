import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = { ...process.env, VITE_API_BASE_URL: '' }

for (const [tool, args] of [
  ['typescript/bin/tsc', ['-b']],
  ['vite/bin/vite.js', ['build']],
]) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules', tool), ...args], {
    cwd: root, env, stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Local preview built with same-origin API requests. Use the read-only preview proxy on port ${process.env.LOCAL_PREVIEW_PORT || 4186}.`)
