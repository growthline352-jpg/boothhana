const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')

test('production API inventory excludes frontend test fixtures', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'frontend_contracts.cjs'), root], {
    encoding: 'utf8',
  })
  const inventory = JSON.parse(output)
  const entries = [...inventory.calls, ...inventory.interfaces, ...inventory.forwarders]
  assert.equal(entries.some(entry => /\.(?:test|spec)\.tsx?$/.test(entry.file)), false)
  assert.equal(inventory.calls.some(call => call.paths.includes('/api/test')), false)
})
