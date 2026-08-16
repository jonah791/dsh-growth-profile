// dsh-growth-profile client bundle 包装：tsdown CJS 产物 → window.__ModuleLoader__.load 格式
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cjs = readFileSync(join(root, 'lib', 'client.cjs'), 'utf8')
const wrapper =
  'window.__ModuleLoader__.load({\n' +
  '\tid: \'dsh-growth-profile\',\n' +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  cjs +
  '\n' +
  '\t\treturn module.exports;\n' +
  '\t}\n' +
  '});\n'
writeFileSync(join(root, 'lib', 'client.js'), wrapper, 'utf8')
console.log('client.js wrapped:', wrapper.length, 'chars')
