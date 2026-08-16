/**
 * dsh-growth-profile client：养成档案面板（conversation.view tab，轨迹旁）
 *
 * - 数据源：GET /api/growth-profile（host webServer 端点；no-store 实时快照）
 * - 形态：属性面板卡片 + 里程碑时间线 + 周目 + 关系档案（主人反馈）
 * - 被动哲学：只读展示；轮询 no-store + in-flight guard + unmount 防护，失败保留最后快照
 */
import { useEffect, useMemo, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots']

interface Profile {
  generatedAt: string
  stats: { total: number; byKind: { fact: number; knowledge: number; episodic: number }; archived: number }
  skills: { name: string; description: string; scope: string }[]
  plugins: { name: string; description: string }[]
  toolCount?: number
  milestones: { title: string; date: string; tags: string[]; body?: string }[]
  cycles: { title: string; date: string }[]
  ownerFeed: { title: string; date: string; tags: string[] }[]
  notes: string[]
}

function fmtDate(iso: string): string {
  if (iso === '') return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function Card({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'var(--dsw-surface-2, #f5f5f7)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--dsw-text-secondary, #8a8a93)', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
      {sub !== undefined && (
        <div style={{ fontSize: 11, color: 'var(--dsw-text-secondary, #8a8a93)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      )}
    </div>
  )
}

function GrowthProfilePanel(): JSX.Element {
  const [data, setData] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/growth-profile', { cache: 'no-store' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const json = (await res.json()) as Profile
        if (alive) {
          setData(json)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(String(e))
      }
    }
    void load()
    return () => { alive = false }
  }, [])

  const sortedMilestones = useMemo(() => {
    if (data === null) return []
    return [...data.milestones].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data])

  if (error !== null && data === null) {
    return <div style={{ padding: 24, color: 'var(--dsw-text-danger, #c0392b)' }}>养成档案加载失败：{error}</div>
  }
  if (data === null) {
    return <div style={{ padding: 24, color: 'var(--dsw-text-secondary, #8a8a93)' }}>养成档案加载中…</div>
  }

  const { stats, skills, plugins } = data

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>养成档案</span>
        <span style={{ fontSize: 11, color: 'var(--dsw-text-secondary, #8a8a93)' }}>
          更新于 {new Date(data.generatedAt).toLocaleTimeString('zh-CN')}
        </span>
      </div>

      {/* 属性面板 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
        <Card title="记忆" value={stats.total} sub={'fact ' + stats.byKind.fact + ' ' + '\u00b7' + ' knowledge ' + stats.byKind.knowledge + ' ' + '\u00b7' + ' episodic ' + stats.byKind.episodic} />
        <Card title="归档" value={stats.archived} sub="冷归档可深挖" />
        <Card title="技能" value={skills.length} sub={skills.map((s) => s.name.replace(/^dsh-/, '')).join(' ' + '\u00b7' + ' ') || '-'} />
        <Card title="自研插件" value={plugins.length} sub={(data.toolCount !== undefined ? String(data.toolCount) : '?') + ' 工具在面'} />
      </div>

      {/* 周目（checkpoint 存档） */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-text-secondary, #8a8a93)', marginBottom: 6 }}>周目 · {data.cycles.length} 次压缩存档（周目继承，核心身份保留）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.cycles.slice(0, 12).map((c) => (
            <span key={c.date} title={c.title} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--dsw-surface-3, #ececef)', color: 'var(--dsw-text-secondary, #8a8a93)' }}>
              {fmtDate(c.date)}
            </span>
          ))}
        </div>
      </div>

      {/* 里程碑时间线 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-text-secondary, #8a8a93)', marginBottom: 8 }}>履历 · {data.milestones.length} 个里程碑</div>
        <div style={{ borderLeft: '2px solid var(--dsw-border, #e0e0e4)', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedMilestones.slice(0, 10).map((m, i) => (
            <div key={m.date + i} style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: -17, top: 5, width: 8, height: 8, borderRadius: '50%', background: 'var(--dsw-accent, #4a7dff)' }} />
              <div style={{ fontSize: 11, color: 'var(--dsw-text-secondary, #8a8a93)' }}>{fmtDate(m.date)}</div>
              <div style={{ fontSize: 13, lineHeight: 1.35 }} title={m.title}>{m.title.length > 80 ? m.title.slice(0, 80) + '...' : m.title}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 关系档案 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-text-secondary, #8a8a93)', marginBottom: 6 }}>关系档案 · {data.ownerFeed.length} 条主人反馈</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.ownerFeed.slice(0, 8).map((o, i) => (
            <div key={o.date + i} style={{ fontSize: 12, lineHeight: 1.3 }} title={o.title}>
              <span style={{ color: 'var(--dsw-text-secondary, #8a8a93)', marginRight: 6 }}>{fmtDate(o.date)}</span>
              {o.title.length > 60 ? o.title.slice(0, 60) + '...' : o.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'growth-profile',
      order: 20, // 轨迹（trajectory, order 10）旁边
      label: () => '养成档案',
    }, GrowthProfilePanel),
  )
}
