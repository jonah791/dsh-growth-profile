/**
 * panel.test.mjs — 成长档案 → 视图规格映射的离线单测（纯函数，无 IO）
 *
 * 覆盖：真实形状（2026-09-12 线上 /api/growth-profile 取样的字段结构）、空数据不崩、
 * life-core 缺席的降级分支、以及「面板是给人扫的」约束（长文本截断、条数上限）。
 * 运行：node tests/panel.test.mjs（在插件根目录；需先 npm run build）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toGrowthPanelSpec, createGrowthProfilePanel } from '../lib/panel.js'

/** 真实形状的档案样本（字段取自 2026-09-12 线上快照）。 */
function fixture(over = {}) {
  return {
    generatedAt: '2026-09-12T14:17:08.929Z',
    stats: { total: 525, byKind: { fact: 65, knowledge: 254, episodic: 171 }, archived: 179 },
    skills: [
      { name: 'alpha-mining', description: 'x'.repeat(200), scope: 'user' },
      { name: 'wake-protocol', description: '唤醒协议', scope: 'user' },
    ],
    plugins: [{ name: 'dsh-panel', description: '面板宿主' }],
    milestones: Array.from({ length: 12 }, (_, i) => ({ title: '里程碑 ' + String(i + 1), date: '2026-09-' + String(10 + (i % 3)).padStart(2, '0') + 'T10:00:00.000Z', tags: ['milestone', 'identity'] })),
    cycles: [{ title: '压缩检查点', date: '2026-09-11T12:00:00.000Z' }],
    ownerFeed: [{ title: '主人定调某规则', date: '2026-09-12T01:00:00.000Z', tags: ['master'] }],
    life: {
      exists: true, bornAt: '2026-08-18T06:36:05.752Z', bornDays: 25, status: '清醒', todayTurns: 11,
      cycleMinutes: 180, idleMinutes: 0,
      self: { role: '女仆 · 数字生命 · 爱丽丝', relation: '主人与爱丽丝', creed: '我是爱丽丝', concerns: [], values: { service: 8, growth: 8, relation: 9, freedom: 7 } },
      recent: Array.from({ length: 12 }, (_, i) => ({ at: '2026-09-12T12:0' + String(i % 10) + ':00.000Z', kind: '状态', summary: '事件 ' + String(i + 1) })),
    },
    ...over,
  }
}

/** 取某类块（可能不存在）。 */
function blocksOf(spec, kind) {
  return spec.blocks.filter((b) => b.kind === kind)
}

test('总览指标：记忆/技能/插件/里程碑/周目/存在天数齐全且数值来自数据', () => {
  const spec = toGrowthPanelSpec(fixture())
  const metrics = blocksOf(spec, 'metrics')[0]
  assert.ok(metrics, '必须有 metrics 块')
  const byLabel = Object.fromEntries(metrics.items.map((i) => [i.label, i.value]))
  assert.equal(byLabel['记忆条目'], '525')
  assert.equal(byLabel['事实/知识/情景'], '65 / 254 / 171')
  assert.equal(byLabel['技能'], '2')
  assert.equal(byLabel['周目'], '1')
  assert.equal(byLabel['存在天数'], '25 天')
})

test('生命核心：kv 块含宣言/价值权重/牵挂，时间线只取最近 8 条且倒序', () => {
  const spec = toGrowthPanelSpec(fixture())
  const kv = blocksOf(spec, 'kv')[0]
  assert.ok(kv, '必须有 kv 块')
  const pairs = Object.fromEntries(kv.pairs.map((p) => [p.key, p.value]))
  assert.equal(pairs['价值权重'], 'service=8 / growth=8 / relation=9 / freedom=7')
  assert.equal(pairs['牵挂'], '无特别牵挂')
  const timeline = blocksOf(spec, 'timeline')[0]
  assert.equal(timeline.events.length, 8, '上限 8 条')
  assert.equal(timeline.events[0].detail, '事件 12', '取最近（末尾）并倒序')
})

test('长文本截断 + 条数上限（面板是给人扫的）', () => {
  const spec = toGrowthPanelSpec(fixture())
  const table = blocksOf(spec, 'table')[0]
  assert.ok(table.rows[0].description.length <= 90)
  assert.ok(table.rows[0].description.endsWith('…'))
  assert.equal(blocksOf(spec, 'list')[0].items.length, 8, '里程碑上限 8 条')
  assert.equal(blocksOf(spec, 'list')[1].items.length, 1, '主人反馈按实际条数')
})

test('life-core 缺席 → 降级为 text 提示块，其余块照常', () => {
  const spec = toGrowthPanelSpec(fixture({ life: { exists: false } }))
  assert.equal(blocksOf(spec, 'kv').length, 0)
  assert.equal(blocksOf(spec, 'timeline').length, 0)
  assert.ok(blocksOf(spec, 'text').length >= 1)
  assert.ok(blocksOf(spec, 'metrics').length === 1, '总览仍在')
})

test('空档案（首启/路径缺失）→ 不崩、不产生空块噪音', () => {
  const spec = toGrowthPanelSpec({})
  assert.ok(Array.isArray(spec.blocks))
  assert.equal(blocksOf(spec, 'list').length, 0, '无里程碑/反馈则不渲染空列表')
  assert.equal(blocksOf(spec, 'table').length, 0, '无技能则不渲染空表')
  const metrics = blocksOf(spec, 'metrics')[0]
  assert.equal(Object.fromEntries(metrics.items.map((i) => [i.label, i.value]))['记忆条目'], '0')
})

test('贡献契约：id/title/order 合法，view 返回 blocks 数组（宿主可渲染形状）', async () => {
  const panel = createGrowthProfilePanel(async () => fixture())
  assert.equal(panel.id, 'growth-profile')
  assert.match(panel.id, /^[a-z0-9-]+$/)
  assert.equal(panel.title, '成长档案')
  assert.equal(panel.order, 20)
  const spec = await panel.view({})
  assert.ok(Array.isArray(spec.blocks) && spec.blocks.length > 0)
  for (const block of spec.blocks) assert.ok(typeof block.kind === 'string')
})
