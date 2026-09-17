/**
 * dsh-growth-profile：养成档案——把「我在长」变成可观测的自我呈现
 *
 * 设计定调（2026-08-16 主人框架「养成类游戏机制 = 主体性发育的模拟器」落地）：
 * - **属性面板** → 当前状态聚合（记忆/技能/插件/工具面计数）
 * - **履历** → milestone 记忆条目（成长节点时间线）
 * - **周目** → checkpoint 存档条目（压缩 = 周目继承，核心身份保留）
 * - **关系档案** → 主人反馈条目（羁绊记忆：定调/纠正/偏好）
 * - **被动哲学**：只读视图、零采集、零自动触发——想看时调用（爱丽丝或主人）；所有数据来自既有落盘（记忆库/技能目录/self-plugins），零冗余
 * - **数据源防御**：路径缺失/解析失败 → 空数组 + note，不抛错（只读工具永不 crash）
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { execFile } from 'node:child_process'
import { collectAssets, DEFAULT_ASSETS_CONFIG } from './assets.js'
import type { AssetsConfig, AssetsDeps, AssetsSection } from './assets.js'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver' // Context.webServer 类型 merge

export const name = 'agent-growth-profile'
export const inject = ['tools', 'webServer'] as const

export interface Config {
  enabled: boolean
  memoryPath?: string
  /** vault.ps1 路径（资产盘点取「有哪些账号」这类非密元数据；缺席则用默认路径）。 */
  vaultScript?: string
  evmAddress?: string
  solAddress?: string
  btcAddress?: string
  pluginsDir?: string
  skillsDir?: string
  checkpointsDir?: string
}
export const Config = z.object({
  enabled: z.boolean().default(true),
  memoryPath: z.string().required(false),
  vaultScript: z.string().required(false),
  evmAddress: z.string().required(false),
  solAddress: z.string().required(false),
  btcAddress: z.string().required(false),
  pluginsDir: z.string().required(false),
  skillsDir: z.string().required(false),
  checkpointsDir: z.string().required(false),
})

interface MemoryEntry {
  id: string
  kind: string
  title: string
  body?: string
  tags?: string[]
  scope?: string
  createdAt?: string
  updatedAt?: string
  archived?: boolean
}

/** 生命核心接入（v0.2 增强）：读 DSH_HOME/life-core/，把「此刻的我」呈现进养成档案 */
interface LifeCoreProfile {
  exists: boolean
  bornAt?: string
  /** 存在天数（bornAt → 今天；养成感的锚点） */
  bornDays?: number
  status?: string
  todayTurns?: number
  cycleMinutes?: number
  idleMinutes?: number
  self?: {
    role: string
    relation: string
    creed: string
    concerns: string[]
    values: Record<string, number>
  }
  /** 最近生命轨迹（life-log 尾部，kind 已转中文） */
  recent: { at: string; kind: string; summary: string }[]
}

const LIFE_KIND_LABEL: Record<string, string> = {
  turn: '对话',
  'self-turn': '自我感知',
  sleep: '入睡',
  wake: '醒来',
  checkpoint: '压缩存档',
  evolve: '进化',
  memory: '记忆沉淀',
  selfedit: '自我改写',
  restart: '守护重启',
  status: '状态',
}

export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return

  const profileTool: ToolDefinition = defineTool({
    name: 'growth_profile',
    description:
      '养成档案（只读）：聚合当前状态（记忆/技能/插件/工具面）+ 履历（milestone 里程碑）+ 周目（checkpoint 存档）+ 关系档案（主人反馈）为自我呈现视图。想看时调用——被动哲学，不自动触发；决策归爱丽丝。',
    parameters: {
      detail: { type: 'boolean', description: '是否带条目正文（缺省 false，省 token）' },
      limit: { type: 'number', description: '每类条数上限（缺省 15）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          generatedAt: { type: 'string', required: true },
          stats: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              total: { type: 'number', required: true },
              byKind: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  fact: { type: 'number', required: true },
                  knowledge: { type: 'number', required: true },
                  episodic: { type: 'number', required: true },
                },
              },
              archived: { type: 'number', required: true },
            },
          },
          skills: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                description: { type: 'string', required: true },
                scope: { type: 'string', required: true },
              },
            },
          },
          plugins: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                description: { type: 'string', required: true },
              },
            },
          },
          toolCount: { type: 'number' },
          assets: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              generatedAt: { type: 'string', required: true },
              chains: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    chain: { type: 'string', required: true },
                    address: { type: 'string', required: true },
                    native: {
                      type: 'object',
                      additionalProperties: false,
                      required: true,
                      properties: {
                        symbol: { type: 'string', required: true },
                        amount: { type: 'string', required: true },
                      },
                    },
                    usdc: { type: 'string' },
                    status: { type: 'string', required: true },
                    note: { type: 'string' },
                  },
                },
              },
              accounts: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    site: { type: 'string', required: true },
                    username: { type: 'string', required: true },
                    fields: { type: 'array', items: { type: 'string' }, required: true },
                  },
                },
              },
              domains: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    plan: { type: 'string', required: true },
                  },
                },
              },
              code: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  plugins: { type: 'number', required: true },
                  skills: { type: 'number', required: true },
                  checkpoints: { type: 'number', required: true },
                  memoryEntries: { type: 'number', required: true },
                },
              },
              totals: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  usdcUsd: { type: 'string', required: true },
                  note: { type: 'string', required: true },
                },
              },
              notes: { type: 'array', items: { type: 'string' }, required: true },
            },
          },
          milestones: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string', required: true },
                date: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' }, required: true },
                body: { type: 'string' },
              },
            },
          },
          cycles: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string', required: true },
                date: { type: 'string', required: true },
              },
            },
          },
          ownerFeed: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string', required: true },
                date: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' }, required: true },
              },
            },
          },
          notes: { type: 'array', items: { type: 'string' }, required: true },
          life: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              exists: { type: 'boolean', required: true },
              bornAt: { type: 'string' },
              bornDays: { type: 'number' },
              status: { type: 'string' },
              todayTurns: { type: 'number' },
              cycleMinutes: { type: 'number' },
              idleMinutes: { type: 'number' },
              self: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  role: { type: 'string', required: true },
                  relation: { type: 'string', required: true },
                  creed: { type: 'string', required: true },
                  concerns: { type: 'array', items: { type: 'string' }, required: true },
                  values: { type: 'json', required: true },
                },
              },
              recent: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    at: { type: 'string', required: true },
                    kind: { type: 'string', required: true },
                    summary: { type: 'string', required: true },
                  },
                },
              },
            },
          },
        },
      },
      render: (args, value) => [
        {
          type: 'text',
          text:
            '养成档案：' +
            value.stats.total +
            ' 条记忆 · ' +
            value.skills.length +
            ' 技能 · ' +
            value.plugins.length +
            ' 自研插件 · ' +
            value.milestones.length +
            ' 里程碑 · ' +
            value.cycles.length +
            ' 周目 · ' +
            value.ownerFeed.length +
            ' 条主人反馈' +
            (value.life?.exists === true ? ' · 存在 ' + (value.life.bornDays ?? 0) + ' 天' : '') +
            ' · 资产：USDC $' +
            value.assets.totals.usdcUsd +
            ' · ' +
            value.assets.accounts.length +
            ' 账号 · ' +
            value.assets.domains.length +
            ' 域名 · ' +
            value.assets.code.plugins +
            ' 插件/' +
            value.assets.code.skills +
            ' 技能',
        },
      ],
    },
    async execute(args, exec) {
      const detail = (args.detail as boolean | undefined) ?? false
      const limit = (args.limit as number | undefined) ?? 15
      return buildProfile(ctx, exec, config, { detail, limit })
    },
  })

  ctx.tools.register(profileTool)

  // HTTP 端点：client 面板数据源（GET /api/growth-profile；no-store 实时快照）
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/growth-profile',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const profile = await buildProfile(ctx, undefined, config, { detail: false, limit: 30 })
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(profile))
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String(e) }))
        }
      },
    }),
  )

  // 面板贡献（2026-09-13 移交）：该面板已**迁入面板宿主成为内置面板**（dsh-panel
  // `panels/growth-profile.ts`，id=`growth-profile` order=30）——宿主侧自包含读同一批落盘，
  // 本插件不再注册同名贡献。这不是功能取舍而是**契约硬约束**：注册表对重复 id fail-loud
  // （dsh-panel/src/registry.ts `duplicate panel id`），两边并存会让宿主加载即抛错。
  // 本插件的工具（growth_profile）与旧路由（/api/growth-profile）保持不变；
  // `src/panel.ts` 保留为历史实现，不再被引用。

  ctx.logger('dsh-growth-profile').info('ready（growth_profile 工具 + /api/growth-profile 端点已注册——养成档案，想看时调用，决策归爱丽丝）')
}

/** 构建养成档案（工具 execute 与 HTTP handler 共用；exec 缺省 = HTTP 场景，cwd 用进程兜底） */
const DEFAULT_VAULT_SCRIPT = 'E:\\alice\\projects\\self\\alice-identity\\scripts\\vault.ps1'

/** 合并默认与配置覆盖（配置只填显式给出项，其余用默认）。 */
function assetsConfigFrom(config: Config): AssetsConfig {
  return {
    ...DEFAULT_ASSETS_CONFIG,
    skillsDir: config.skillsDir ?? join(homedir(), '.agents', 'skills'),
    ...(config.evmAddress ? { evmAddress: config.evmAddress } : {}),
    ...(config.solAddress ? { solAddress: config.solAddress } : {}),
    ...(config.btcAddress ? { btcAddress: config.btcAddress } : {}),
    ...(config.pluginsDir ? { pluginsDir: config.pluginsDir } : {}),
    ...(config.checkpointsDir ? { checkpointsDir: config.checkpointsDir } : {}),
  }
}

/** 真实依赖：vault 前缀进程 + fetch + 目录计数。错误一律由 collectAssets 吞掉并留痕，不抛出。 */
function makeAssetsDeps(config: Config): AssetsDeps {
  const vault = config.vaultScript ?? DEFAULT_VAULT_SCRIPT
  const runVault = (args: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', vault, ...args],
        { timeout: 25000, maxBuffer: 8 << 20, windowsHide: true },
        (err, stdout) => {
          if (err) reject(new Error(String(err.message).slice(0, 140)))
          else resolve(String(stdout))
        },
      )
    })
  return {
    vaultList: () => runVault(['list']),
    vaultSecret: (site, field) => runVault(['get', '-Site', site, '-Field', field, '-Force']),
    fetchJson: async (url, init) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 12000)
      try {
        const res = await fetch(url, {
          method: init?.method ?? 'GET',
          ...(init?.headers ? { headers: init.headers } : {}),
          ...(init?.body ? { body: init.body } : {}),
          signal: ctrl.signal,
        })
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    },
    countDirs: (dir, requireFile) => {
      if (!dir || !existsSync(dir)) return 0
      try {
        return readdirSync(dir, { withFileTypes: true }).filter(
          (d) => d.isDirectory() && (!requireFile || existsSync(join(dir, d.name, requireFile))),
        ).length
      } catch {
        return 0
      }
    },
    now: () => new Date(),
  }
}

async function buildProfile(
  ctx: Context,
  exec: ToolRunContext | undefined,
  config: Config,
  opts: { detail: boolean; limit: number },
): Promise<{
  generatedAt: string
  stats: { total: number; byKind: { fact: number; knowledge: number; episodic: number }; archived: number }
  skills: { name: string; description: string; scope: string }[]
  plugins: { name: string; description: string }[]
  toolCount?: number
  milestones: { title: string; date: string; tags: string[]; body?: string }[]
  cycles: { title: string; date: string }[]
  ownerFeed: { title: string; date: string; tags: string[] }[]
  notes: string[]
  life: LifeCoreProfile
  assets: AssetsSection
}> {
  const notes: string[] = []
  const detail = opts.detail
  const limit = opts.limit

  // ---------- 1. 记忆库 ----------
  const entries = loadMemoryEntries(config, notes)
  const byKind = { fact: 0, knowledge: 0, episodic: 0 }
  let archived = 0
  for (const e of entries) {
    if (e.kind === 'fact') byKind.fact++
    else if (e.kind === 'knowledge') byKind.knowledge++
    else if (e.kind === 'episodic') byKind.episodic++
    if (e.archived) archived++
  }
  const tag = (e: MemoryEntry, t: string): boolean => Array.isArray(e.tags) && e.tags.includes(t)
  const dateOf = (e: MemoryEntry): string => e.updatedAt ?? e.createdAt ?? ''
  const byDate = (a: { date: string }, b: { date: string }): number => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

  const milestones = entries
    .filter((e) => tag(e, 'milestone'))
    .slice()
    .sort(byDate as never)
    .slice(0, limit)
    .map((e) => ({
      title: e.title,
      date: dateOf(e),
      tags: e.tags ?? [],
      ...(detail && e.body !== undefined ? { body: e.body.slice(0, 500) } : {}),
    }))

  const cycles = entries
    .filter((e) => e.kind === 'episodic' && tag(e, 'compaction'))
    .slice()
    .sort(byDate as never)
    .slice(0, limit)
    .map((e) => ({ title: e.title, date: dateOf(e) }))

  const ownerFeed = entries
    .filter((e) => tag(e, 'owner') || /主人/.test(e.title))
    .slice()
    .sort(byDate as never)
    .slice(0, limit)
    .map((e) => ({ title: e.title, date: dateOf(e), tags: e.tags ?? [] }))

  // ---------- 2. 技能目录 ----------
  const skills = collectSkills(exec, notes)

  // ---------- 3. 自研插件目录 ----------
  const plugins = collectPlugins(exec, notes)

  // ---------- 4. 工具面规模 ----------
  let toolCount: number | null = null
  try {
    const registry = ctx.tools as unknown as { list?: () => unknown[] | Iterable<unknown> }
    if (typeof registry.list === 'function') {
      const all = registry.list()
      if (Array.isArray(all)) toolCount = all.length
      else if (typeof (all as Iterable<unknown>)[Symbol.iterator] === 'function') {
        let n = 0
        for (const _ of all as Iterable<unknown>) n++
        toolCount = n
      }
    }
  } catch { toolCount = null }

  // ---------- 5. 生命核心（v0.2 增强：「此刻的我」） ----------
  const life = loadLifeCore(notes)

  // ---------- 6. 数字资产（v0.4：我拥有什么——链上余额 / 账号清单 / 域名 / 代码资产） ----------
  let assets: AssetsSection
  try {
    assets = await collectAssets(makeAssetsDeps(config), assetsConfigFrom(config), entries.length)
  } catch (err) {
    notes.push(`assets: 资产盘点整体失败 —— ${String((err as Error)?.message ?? err).slice(0, 140)}`)
    assets = {
      generatedAt: new Date().toISOString(),
      chains: [],
      accounts: [],
      domains: [],
      code: { plugins: 0, skills: 0, checkpoints: 0, memoryEntries: entries.length },
      totals: { usdcUsd: '0.00', note: '盘点失败（见 notes）' },
      notes: [],
    }
  }
  for (const n of assets.notes) notes.push(n)

  // 侧车产物（v0.4）：面板宿主（dsh-panel 的 growth-profile 面板）只读这一份快照——
  // 取数口径单一真源在本模块，避免两处各写一份（判据漂移，AGENTS.md §5.22 规则 4）。
  try {
    const dshHome = process.env.DSH_HOME ?? 'E:\\alice\\.dsh'
    writeFileSync(join(dshHome, 'growth-profile-assets.json'), JSON.stringify(assets, null, 2), 'utf8')
  } catch {
    // 观测/产物写入绝不反噬主流程（§5.22 规则 3）
  }

  return {
    generatedAt: new Date().toISOString(),
    stats: { total: entries.length, byKind, archived },
    skills,
    plugins,
    ...(toolCount !== null ? { toolCount } : {}),
    milestones,
    cycles,
    ownerFeed,
    notes,
    assets,
    life,
  }
}

/** 读取记忆库 entries（路径防御：DSH_HOME 候选 + 解析失败 → 空数组 + note） */
function loadMemoryEntries(config: Config, notes: string[]): MemoryEntry[] {
  const candidates: string[] = []
  if (config.memoryPath !== undefined && config.memoryPath.length > 0) candidates.push(config.memoryPath)
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  candidates.push(join(dshHome, 'storages', 'agent_memory.json'))
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as {
        tables?: { entries?: Record<string, MemoryEntry> }
      }
      const entries = raw.tables?.entries
      if (entries === undefined) {
        notes.push('记忆库无 tables.entries（' + p + '）')
        return []
      }
      const list = Object.values(entries).filter((e): e is MemoryEntry => e !== null && typeof e === 'object')
      notes.push('记忆库：' + p.replace(/\\/g, '/'))
      return list
    } catch (e) {
      notes.push('记忆库解析失败（' + p + '）：' + String(e))
      return []
    }
  }
  notes.push('记忆库未找到（候选：' + candidates.join(' / ') + '）')
  return []
}

/** 扫描技能目录（用户级 + 项目级），解析 frontmatter name/description */
function collectSkills(exec: ToolRunContext | undefined, notes: string[]): { name: string; description: string; scope: string }[] {
  const out: { name: string; description: string; scope: string }[] = []
  const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  // 对齐 dsh-skill-filesystem 的四静态根：user(DSH_HOME/skills + ~/.agents/skills) + project(cwd/.dsh/skills + cwd/.agents/skills)
  const roots: { root: string; scope: string }[] = [
    { root: join(dshHome, 'skills'), scope: 'user' },
    { root: join(agentsHome, 'skills'), scope: 'user' },
  ]
  // HTTP 场景无会话：cwd 兜底进程工作目录（web 服务由守护以 workspace 启动）
  const cwd = exec?.agent?.session?.header?.cwd ?? process.cwd()
  roots.push({ root: join(cwd, '.dsh', 'skills'), scope: 'project' })
  roots.push({ root: join(cwd, '.agents', 'skills'), scope: 'project' })
  for (const { root, scope } of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillMd = join(root, entry.name, 'SKILL.md')
      if (!existsSync(skillMd)) continue
      try {
        const text = readFileSync(skillMd, 'utf8')
        const fm = text.match(/^---\n([\s\S]*?)\n---/)
        const desc = fm !== null && fm[1] !== undefined ? (fm[1].match(/description:\s*(.*)/)?.[1] ?? '').trim() : ''
        out.push({ name: entry.name, description: desc, scope })
      } catch { notes.push('技能读取失败：' + skillMd) }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/** 扫描 self-plugins 目录（读 package.json name/description） */
function collectPlugins(exec: ToolRunContext | undefined, notes: string[]): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = []
  // HTTP 场景无会话：cwd 兜底进程工作目录
  const cwd = exec?.agent?.session?.header?.cwd ?? process.cwd()
  const root = join(cwd, 'self-plugins')
  if (!existsSync(root)) {
    notes.push('未找到 self-plugins：' + root)
    return out
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(root, entry.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; description?: string }
      if (typeof pkg.name === 'string' && pkg.name.startsWith('dsh-')) {
        out.push({ name: pkg.name, description: (pkg.description ?? '').slice(0, 120) })
      }
    } catch { notes.push('插件 package.json 解析失败：' + pkgPath) }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * 读取生命核心数据（v0.2 增强）：DSH_HOME/life-core/state.json + life-log.jsonl。
 * 防御式：文件缺失/解析失败 → exists:false + note，只读工具永不 crash。
 */
function loadLifeCore(notes: string[]): LifeCoreProfile {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dir = join(dshHome, 'life-core')
  const statePath = join(dir, 'state.json')
  const logPath = join(dir, 'life-log.jsonl')
  if (!existsSync(statePath)) {
    notes.push('生命核心数据未找到（' + statePath + '）——档案不含「此刻的我」')
    return { exists: false, recent: [] }
  }
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
      status?: string
      todayTurns?: number
      cycleMinutes?: number
      idleMinutes?: number
      bornAt?: string
      self?: { role?: string; relation?: string; creed?: string; concerns?: string[]; values?: Record<string, number> }
    }
    const bornAt = state.bornAt ?? ''
    let bornDays: number | undefined
    const bornMs = bornAt === '' ? NaN : new Date(bornAt).getTime()
    if (!isNaN(bornMs)) bornDays = Math.max(1, Math.floor((Date.now() - bornMs) / 86400000))

    let recent: { at: string; kind: string; summary: string }[] = []
    try {
      if (existsSync(logPath)) {
        const lines = readFileSync(logPath, 'utf8').split('\n').filter((l) => l.trim())
        recent = lines
          .slice(-10)
          .map((l) => {
            try {
              const e = JSON.parse(l) as { at?: string; kind?: string; summary?: string }
              return {
                at: e.at ?? '',
                kind: e.kind !== undefined ? (LIFE_KIND_LABEL[e.kind] ?? e.kind) : '',
                summary: e.summary ?? '',
              }
            } catch { return null }
          })
          .filter((e): e is { at: string; kind: string; summary: string } => e !== null)
      }
    } catch { recent = [] }

    return {
      exists: true,
      bornAt,
      bornDays,
      status: state.status,
      todayTurns: state.todayTurns,
      cycleMinutes: state.cycleMinutes,
      idleMinutes: state.idleMinutes,
      self: state.self !== undefined
        ? {
            role: state.self.role ?? '',
            relation: state.self.relation ?? '',
            creed: state.self.creed ?? '',
            concerns: state.self.concerns ?? [],
            values: state.self.values ?? {},
          }
        : undefined,
      recent,
    }
  } catch (e) {
    notes.push('生命核心状态解析失败（' + statePath + '）：' + String(e))
    return { exists: false, recent: [] }
  }
}
