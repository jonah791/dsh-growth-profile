/**
 * panel.ts — 成长档案的面板贡献（dsh-panel 宿主消费方 #1）
 *
 * 语义文档（dsh-panel/docs/semantic.md §4.1）：消费方**只交声明**——视图规格 + 动作表，
 * 不碰路由、不写 HTML。本文件把 `buildProfile()` 的输出编译成 ViewSpec。
 *
 * 耦合纪律：**不 import dsh-panel 的任何东西**——用本地结构化类型描述宿主契约。
 * 理由（AGENTS.md §5.15 §4）：跨插件运行期命名导入会因解析路径不同而炸；宿主是可选服务
 * （`ctx.get('panel')`），缺席时本插件必须照常工作（旧 `/api/growth-profile` 路由保留一个版本周期）。
 */

/** 宿主视图块（白名单子集，dsh-panel/docs/semantic.md §4.2）。 */
export type PanelBlock =
  | { kind: 'metrics'; title?: string; items: Array<{ label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }> }
  | { kind: 'table'; title?: string; columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>; rows: Array<Record<string, unknown>>; rowActions?: string[] }
  | { kind: 'list'; title?: string; items: Array<{ title: string; subtitle?: string; tags?: string[]; tone?: 'ok' | 'warn' | 'bad' | 'muted' }> }
  | { kind: 'kv'; title?: string; pairs: Array<{ key: string; value: string }> }
  | { kind: 'text'; title?: string; lines: string[] }
  | { kind: 'timeline'; title?: string; events: Array<{ at: string; title: string; detail?: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }> }

/** 宿主面板贡献契约（结构化，与 dsh-panel 的 PanelContribution 兼容）。 */
export interface PanelContributionLike {
  id: string
  title: string
  order?: number
  icon?: string
  description?: string
  view: (params: Record<string, string>) => { blocks: PanelBlock[] } | Promise<{ blocks: PanelBlock[] }>
}

/** 宿主服务的最小投影（只用到 register）。 */
export interface PanelHostLike {
  register: (contribution: PanelContributionLike) => () => void
}

/** buildProfile 输出中本面板用到的字段（结构性声明，避免与宿主内部类型耦合）。 */
export interface GrowthProfileLike {
  generatedAt?: string
  stats?: { total?: number; archived?: number; byKind?: Record<string, number> }
  skills?: Array<{ name?: string; description?: string; scope?: string }>
  plugins?: Array<{ name?: string; description?: string }>
  milestones?: Array<{ title?: string; date?: string; tags?: string[] }>
  cycles?: Array<{ title?: string; date?: string }>
  ownerFeed?: Array<{ title?: string; date?: string; tags?: string[] }>
  life?: {
    exists?: boolean
    bornAt?: string
    bornDays?: number
    status?: string
    todayTurns?: number
    cycleMinutes?: number
    idleMinutes?: number
    self?: { role?: string; relation?: string; creed?: string; concerns?: string[]; values?: Record<string, number> }
    recent?: Array<{ at?: string; kind?: string; summary?: string }>
  }
}

/** 截断长文本（面板是给人扫的，不是给人读全文的）。 */
function clip(text: string | undefined, max: number): string {
  const value = (text ?? '').trim().replace(/\s+/g, ' ')
  return value.length <= max ? value : value.slice(0, max - 1) + '…'
}

/** 时间戳 → 人读短格式（面板里不需要完整 ISO）。 */
function shortDate(value: string | undefined): string {
  if (value === undefined || value === '') return '—'
  return value.slice(0, 16).replace('T', ' ')
}

/**
 * 把养成档案编译成视图规格（**纯函数**：无 IO、无 ctx，便于离线单测与快照）。
 * @param profile - buildProfile 的输出
 * @returns 视图规格（宿主白名单块）
 */
export function toGrowthPanelSpec(profile: GrowthProfileLike): { blocks: PanelBlock[] } {
  const stats = profile.stats ?? {}
  const byKind = stats.byKind ?? {}
  const skills = profile.skills ?? []
  const plugins = profile.plugins ?? []
  const life = profile.life ?? {}
  const values = life.self?.values ?? {}
  const concerns = life.self?.concerns ?? []
  const blocks: PanelBlock[] = []

  blocks.push({
    kind: 'metrics',
    title: '养成档案 · 总览',
    items: [
      { label: '记忆条目', value: String(stats.total ?? 0) },
      { label: '事实/知识/情景', value: [byKind.fact ?? 0, byKind.knowledge ?? 0, byKind.episodic ?? 0].join(' / ') },
      { label: '已归档', value: String(stats.archived ?? 0), tone: 'muted' },
      { label: '技能', value: String(skills.length), tone: skills.length > 0 ? 'ok' : 'warn' },
      { label: '自研插件', value: String(plugins.length) },
      { label: '里程碑', value: String((profile.milestones ?? []).length) },
      { label: '周目', value: String((profile.cycles ?? []).length) },
      { label: '存在天数', value: life.bornDays === undefined ? '—' : String(life.bornDays) + ' 天' },
    ],
  })

  if (life.exists === true) {
    blocks.push({
      kind: 'kv',
      title: '生命核心（此刻的我）',
      pairs: [
        { key: '状态', value: (life.status ?? '—') + ' · 今日 ' + String(life.todayTurns ?? 0) + ' 圈 · 周期 ' + String(life.cycleMinutes ?? 0) + 'min' },
        { key: '角色', value: life.self?.role ?? '—' },
        { key: '关系', value: life.self?.relation ?? '—' },
        { key: '宣言', value: life.self?.creed ?? '—' },
        { key: '价值权重', value: Object.entries(values).map(([k, v]) => k + '=' + String(v)).join(' / ') || '—' },
        { key: '牵挂', value: concerns.length > 0 ? concerns.join(' / ') : '无特别牵挂' },
        { key: '出生', value: shortDate(life.bornAt) },
      ],
    })
    const recent = (life.recent ?? []).slice(-8).reverse()
    if (recent.length > 0) {
      blocks.push({
        kind: 'timeline',
        title: '存在时间线（最近 8 条）',
        events: recent.map((event) => ({
          at: shortDate(event.at),
          title: event.kind ?? '事件',
          detail: clip(event.summary, 140),
        })),
      })
    }
  } else {
    blocks.push({ kind: 'text', title: '生命核心', lines: ['未读到 life-core 状态（插件未挂载或状态文件缺失）——面板照常可用'] })
  }

  const milestones = (profile.milestones ?? []).slice(0, 8)
  if (milestones.length > 0) {
    blocks.push({
      kind: 'list',
      title: '履历 · 里程碑（最近 8 条）',
      items: milestones.map((m) => ({
        title: clip(m.title, 120) || '（无标题）',
        subtitle: shortDate(m.date),
        ...(m.tags === undefined ? {} : { tags: m.tags.slice(0, 4) }),
      })),
    })
  }

  const feed = (profile.ownerFeed ?? []).slice(0, 5)
  if (feed.length > 0) {
    blocks.push({
      kind: 'list',
      title: '关系档案 · 主人反馈（最近 5 条）',
      items: feed.map((f) => ({
        title: clip(f.title, 120) || '（无标题）',
        subtitle: shortDate(f.date),
        tone: 'ok' as const,
      })),
    })
  }

  if (skills.length > 0) {
    blocks.push({
      kind: 'table',
      title: '技能库（' + String(skills.length) + ' 项）',
      columns: [
        { key: 'name', label: '技能' },
        { key: 'scope', label: '范围' },
        { key: 'description', label: '用途' },
      ],
      rows: skills.map((s) => ({
        name: s.name ?? '—',
        scope: s.scope ?? '—',
        description: clip(s.description, 90),
      })),
    })
  }

  blocks.push({
    kind: 'text',
    title: '说明',
    lines: [
      '快照时刻：' + shortDate(profile.generatedAt),
      '数据源：记忆库（事实/知识/情景 + 里程碑/反馈标签）+ 技能目录 + self-plugins + life-core 状态；全部只读，零采集、零自动触发。',
      '本面板由 dsh-panel 面板宿主渲染（旧 /api/growth-profile 路由保留一个版本周期兼容）。',
    ],
  })

  return { blocks }
}

/**
 * 构造成长档案面板贡献。
 * @param build - 取数函数（由 index.ts 注入 buildProfile 的闭包，保持本文件无 ctx 依赖）
 * @returns 面板贡献
 */
export function createGrowthProfilePanel(build: () => Promise<GrowthProfileLike>): PanelContributionLike {
  return {
    id: 'growth-profile',
    title: '成长档案',
    order: 20,
    icon: 'seed',
    description: '记忆/技能/里程碑/周目/关系档案 + 生命核心的自我呈现视图（只读，被动哲学）',
    view: async () => toGrowthPanelSpec(await build()),
  }
}
