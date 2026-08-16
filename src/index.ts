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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver' // Context.webServer 类型 merge

export const name = 'agent-growth-profile'
export const inject = ['tools', 'webServer'] as const

export interface Config {
  enabled: boolean
  memoryPath?: string
}
export const Config = z.object({
  enabled: z.boolean().default(true),
  memoryPath: z.string().required(false),
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
            ' 条主人反馈',
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

  ctx.logger('dsh-growth-profile').info('ready（growth_profile 工具 + /api/growth-profile 端点已注册——养成档案，想看时调用，决策归爱丽丝）')
}

/** 构建养成档案（工具 execute 与 HTTP handler 共用；exec 缺省 = HTTP 场景，cwd 用进程兜底） */
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
  }
}

/** 读取记忆库 entries（路径防御：DSH_HOME 候选 + 解析失败 → 空数组 + note） */
function loadMemoryEntries(config: Config, notes: string[]): MemoryEntry[] {
  const candidates: string[] = []
  if (config.memoryPath !== undefined && config.memoryPath.length > 0) candidates.push(config.memoryPath)
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  candidates.push(join(dshHome, 'storages', 'agent_memory.json'))
  candidates.push(join(homedir(), '.dsh', 'storages', 'agent_memory.json'))
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
