/* Resolve the checkout's actual TypeScript first, then an explicitly supplied/global installation. */
const path = require('node:path'), cp = require('node:child_process')
module.exports = function loadTypeScript() {
  for (const candidate of [process.env.TYPESCRIPT_MODULE,path.resolve(__dirname,'../../frontend/node_modules/typescript'),process.env.BOOTHHANA_SOURCE && path.resolve(process.env.BOOTHHANA_SOURCE,'frontend/node_modules/typescript')].filter(Boolean)) {
    try { return require(candidate) } catch {}
  }
  try { return require('typescript') } catch {}
  try { return require(path.join(cp.execFileSync(process.platform==='win32'?'npm.cmd':'npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript')) }
  catch { throw Error('Install frontend dependencies, or set TYPESCRIPT_MODULE to a TypeScript installation.') }
}
