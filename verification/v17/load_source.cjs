const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('../v4/load_ts.cjs')(), root = path.resolve(__dirname, '../..'), cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative.endsWith('.ts') ? relative : relative + '.ts')
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
    name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), name))) : require(name), module, module.exports)
  return module.exports
}
module.exports = { load }
