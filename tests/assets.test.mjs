import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVaultList, parseZones, extractToken, formatUnits, usdFromChains, collectAssets, DEFAULT_ASSETS_CONFIG } from '../lib/assets.js'

const CFG = { ...DEFAULT_ASSETS_CONFIG, skillsDir: 'E:\\x\\skills' }

test('parseVaultList 解析定宽表并跳过表头/分隔线', () => {
  const out = [
    '',
    'site                  username                    fields                  updatedAt',
    '----                  --------                    ------                  ---------',
    'wallet-evm            0xA96b64ac53196021f4a9      password                2026-09-15T23:29:31',
    'x.com                 aliceyachiyo                password,notes          2026-09-16T14:13:21',
    '',
  ].join('\n')
  const rows = parseVaultList(out)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { site: 'wallet-evm', username: '0xA96b64ac53196021f4a9', fields: ['password'] })
  assert.deepEqual(rows[1].fields, ['password', 'notes'])
})

test('parseZones 只留非敏感字段且丢弃无名条目', () => {
  const rows = parseZones({ result: [{ name: 'validator-community.com', status: 'active', plan: { name: 'Free Website' } }, { status: 'active' }], errors: [] })
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { name: 'validator-community.com', status: 'active', plan: 'Free Website' })
  assert.deepEqual(parseZones({ result: 'nope' }), [])
})

test('formatUnits 精确（不经浮点）', () => {
  assert.equal(formatUnits('1000000000000000000', 18), '1')
  assert.equal(formatUnits('2000', 6), '0.002')
  assert.equal(formatUnits('123456789', 6), '123.456789')
  assert.equal(formatUnits('0', 18), '0')
  assert.equal(formatUnits('junk', 6), '0')
})

test('extractToken 取 api-token= 真值、垃圾输入返回 null', () => {
  assert.equal(extractToken('api-token=abcDEF123_-'), 'abcDEF123_-')
  assert.equal(extractToken('备注：没有 token'), null)
})

test('usdFromChains 只累计 ok 且带 usdc 的项', () => {
  assert.equal(usdFromChains([
    { chain: 'Base', address: 'a', native: { symbol: 'ETH', amount: '0' }, usdc: '0.002', status: 'ok' },
    { chain: 'Solana', address: 'b', native: { symbol: 'SOL', amount: '0' }, status: 'error', note: 'rpc down' },
  ]), '0.00')
  assert.equal(usdFromChains([
    { chain: 'Base', address: 'a', native: { symbol: 'ETH', amount: '0' }, usdc: '12.5', status: 'ok' },
  ]), '12.50')
})

test('collectAssets 降级要留痕：链上失败进 notes、不伪装成 0', async () => {
  const deps = {
    vaultList: async () => 'site  username  fields  updatedAt\n----  ----  ----  ----\nfoo   bar   password  2026-01-01\n',
    vaultSecret: async () => { throw new Error('vault locked') },
    fetchJson: async (url) => {
      if (url.includes('base.org')) throw new Error('rpc down')
      if (url.includes('mempool')) return { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } }
      return { result: { value: 0 } }
    },
    countDirs: () => 3,
    now: () => new Date('2026-09-17T00:00:00Z'),
  }
  const out = await collectAssets(deps, CFG, 831)
  assert.equal(out.code.memoryEntries, 831)
  assert.equal(out.code.plugins, 3)
  assert.equal(out.accounts.length, 1)
  assert.equal(out.domains.length, 0)
  const base = out.chains.find((c) => c.chain === 'Base')
  assert.equal(base?.status, 'error')
  assert.ok(out.notes.some((n) => n.includes('Base')), '链上失败必须在 notes 里留痕')
  assert.ok(out.notes.some((n) => n.includes('域名')), '域名取数失败必须在 notes 里留痕')
  // 2026-09-17：vault 走表格降级解析同样必须可见（旧脚本无 list-json ⇒ 存在错位风险）
  assert.ok(out.notes.some((n) => n.includes('表格降级')), 'vault 表格解析必须在 notes 里留痕')
  assert.equal(out.totals.usdcUsd, '0.00')
})

test('collectAssets 全通路径：三链 ok + 域名 + 账号', async () => {
  const deps = {
    // 2026-09-17：主路径改为结构化输出（`list-json`）——线上现在走这条
    vaultList: async () => JSON.stringify([{ site: 'x.com', username: 'alice', fields: 'password,notes', updatedAt: '2026-01-01' }]),
    vaultSecret: async () => 'api-token=TOKENVALUE',
    fetchJson: async (url) => {
      if (url.includes('base.org')) return { result: '0x0' }
      if (url.includes('mempool')) return { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } }
      if (url.includes('cloudflare')) return { result: [{ name: 'validator-community.com', status: 'active', plan: { name: 'Free Website' } }] }
      return { result: { value: 0 } }
    },
    countDirs: (dir, req) => (dir.includes('skills') ? 67 : dir.includes('plugins') ? 57 : 10),
    now: () => new Date('2026-09-17T00:00:00Z'),
  }
  const out = await collectAssets(deps, CFG, 831)
  assert.equal(out.chains.length, 3)
  assert.ok(out.chains.every((c) => c.status === 'ok'))
  assert.equal(out.domains.length, 1)
  assert.equal(out.code.skills, 67)
  assert.equal(out.code.checkpoints, 10)
  assert.deepEqual(out.notes, [])
})
