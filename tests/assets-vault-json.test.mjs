/**
 * vault 清单解析的单测（2026-09-17 · 「数字资产」准确性缺口修复）。
 *
 * 事故：线上侧车快照 `growth-profile-assets.json` 里出现错位——
 *   · `wallet-sol` 的 username 收进了「… password」、fields 变成 updatedAt 的时间串；
 *   · `cloudflare-api` 的 username 变成「notes」；
 *   · `crypton.sh-unverified…` 的 username 变成「password,notes」。
 * 根因：`vault.ps1 list` 走 `Format-Table -AutoSize`（列宽自适配、超宽**截断**），
 * 而解析按 `\s{2,}` 切列 ⇒ 值含空格 / 列被截断时必然错位。
 * 修法：`vault.ps1 list-json`（结构化）+ `parseVaultListAuto` 按内容选路，降级留痕。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVaultList, parseVaultListJson, parseVaultListAuto } from '../lib/assets.js'

/** 事故形状样本（取自线上快照里曾错位的那几条，字段归属按 vault 真值） */
const JSON_ROWS = JSON.stringify([
  { site: 'wallet-sol', username: '28jKpQK8oyZBxmP4AeAQPjU9LMMPh16Nv7DgF2f6Ka63', fields: 'password', updatedAt: '2026-09-16T12:48:50' },
  { site: 'cloudflare-api', username: 'aliceyachiyo@qrypty.com', fields: 'notes', updatedAt: '2026-09-16T21:53:21' },
  { site: 'nearai-market-webhook alice-deterministic-tools', username: 'alice-deterministic-tools', fields: 'password,notes', updatedAt: '2026-09-16T23:06:19' },
])

test('parseVaultListJson：字段归属不依赖列宽（三条事故条目逐条对齐）', () => {
  const rows = parseVaultListJson(JSON_ROWS)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], {
    site: 'wallet-sol',
    username: '28jKpQK8oyZBxmP4AeAQPjU9LMMPh16Nv7DgF2f6Ka63',
    fields: ['password'],
  })
  assert.deepEqual(rows[1], { site: 'cloudflare-api', username: 'aliceyachiyo@qrypty.com', fields: ['notes'] })
  // site 本身含空格也必须完整保留
  assert.equal(rows[2].site, 'nearai-market-webhook alice-deterministic-tools')
  assert.deepEqual(rows[2].fields, ['password', 'notes'])
})

test('parseVaultListJson：坏输入一律返回空数组（不抛、不猜）', () => {
  assert.deepEqual(parseVaultListJson(''), [])
  assert.deepEqual(parseVaultListJson('   '), [])
  assert.deepEqual(parseVaultListJson('not json'), [])
  assert.deepEqual(parseVaultListJson('{"site":"x"}'), [], '非数组 ⇒ 空')
  assert.deepEqual(parseVaultListJson('[{"username":"no-site"}]'), [], '缺 site ⇒ 丢弃')
  assert.deepEqual(parseVaultListJson('[]'), [])
  assert.deepEqual(parseVaultListJson('[null, 42, "x"]'), [])
})

test('parseVaultListAuto：按内容选路并回报格式（降级可见）', () => {
  const viaJson = parseVaultListAuto(JSON_ROWS)
  assert.equal(viaJson.format, 'json')
  assert.equal(viaJson.accounts.length, 3)
  assert.equal(parseVaultListAuto('[]').format, 'json')

  const table = [
    '',
    'site   username   fields     updatedAt',
    '----   --------   ------     ---------',
    'x.com  bob        password   2026-09-16T14:13:21',
    '',
  ].join('\n')
  const auto = parseVaultListAuto(table)
  assert.equal(auto.format, 'table')
  assert.equal(auto.accounts.length, 1)
  assert.equal(auto.accounts[0].site, 'x.com')
  // 旧脚本的空库提示也走表格路径（不误判成 JSON）
  assert.equal(parseVaultListAuto('（vault 内暂无条目）').format, 'table')
})

test('回归对照：定宽表格路径在「值含空格」时确实失真，JSON 路径无此问题', () => {
  // 复刻事故形态：username 值里带空格 ⇒ 按 \s{2,} 切列后被截成两段
  const table = [
    '',
    'site          username                    fields     updatedAt',
    '----          --------                    ------     ---------',
    'wallet-sol    28jKpQK8  password          password   2026-09-16T12:48:50',
    '',
  ].join('\n')
  const viaTable = parseVaultList(table)
  assert.equal(viaTable[0].username, '28jKpQK8', '表格路径只能拿到第一段（信息被切断）')
  const viaJson = parseVaultListJson(JSON.stringify([{ site: 'wallet-sol', username: '28jKpQK8  password', fields: 'password' }]))
  assert.equal(viaJson[0].username, '28jKpQK8  password', 'JSON 路径原样保留')
})
