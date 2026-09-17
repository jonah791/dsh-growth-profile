/**
 * assets.ts — 数字资产汇总（养成档案的「我拥有什么」一段）
 *
 * 为什么单独成模块（AGENTS.md §5.20 / dsh-plugin-testability）：资产盘点要碰网络与前缀进程，
 * 但**解析**与**折算**是纯函数——把可注入的依赖（fetchJson / vaultList / countDirs）与纯解析
 * 分开，离线夹具就能覆盖所有降级分支，不需要真网络。
 *
 * 纪律：
 *   · **只读**——盘点不改任何状态；链上只查余额，不构造交易。
 *   · **秘密不落盘、不回显**——vault 只取「有哪些字段」这类非密元数据；Cloudflare token 取来即用，
 *     永不写进输出、日志或 notes。
 *   · **降级留痕**——任何一路取数失败都在 notes 里留一行，且该项 status='error'，不静默当零。
 */

export interface ChainBalance {
  chain: string
  address: string
  native: { symbol: string; amount: string }
  usdc?: string
  status: 'ok' | 'error'
  note?: string
}

export interface AssetAccount {
  site: string
  username: string
  fields: string[]
}

export interface AssetDomain {
  name: string
  status: string
  plan: string
}

export interface AssetsSection {
  generatedAt: string
  chains: ChainBalance[]
  accounts: AssetAccount[]
  domains: AssetDomain[]
  code: { plugins: number; skills: number; checkpoints: number; memoryEntries: number }
  totals: { usdcUsd: string; note: string }
  notes: string[]
}

export interface AssetsDeps {
  /** stdout of `vault.ps1 list`（只列非密元数据）。 */
  vaultList: () => Promise<string>
  /** 取单条 vault 字段（**用于 Cloudflare token 这类需要真值的场景**，返回值不得进输出）。 */
  vaultSecret: (site: string, field: string) => Promise<string>
  fetchJson: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) => Promise<unknown>
  countDirs: (dir: string, requireFile?: string) => number
  now?: () => Date
}

export interface AssetsConfig {
  evmAddress: string
  solAddress: string
  btcAddress: string
  pluginsDir: string
  skillsDir: string
  checkpointsDir: string
  cloudflareVaultSite: string
}

export const DEFAULT_ASSETS_CONFIG: AssetsConfig = {
  evmAddress: '0xA96b64ac53196021f4a939a69CccF8e7aF161378',
  solAddress: '28jKpQK8oyZBxmP4AeAQPjU9LMMPh16Nv7DgF2f6Ka63',
  btcAddress: 'bc1qzncht6vrerv84u2m4avwunjul6kqk9nx858q7u',
  pluginsDir: 'E:\\alice\\self-plugins',
  skillsDir: '',
  checkpointsDir: 'E:\\alice\\.dsh\\checkpoints',
  cloudflareVaultSite: 'cloudflare-api',
}

// ---------- 纯解析（离线可测） ----------

/** 解析 `vault.ps1 list` 的定宽表格：site | username | fields(逗号分隔) | updatedAt。 */
export function parseVaultList(stdout: string): AssetAccount[] {
  const out: AssetAccount[] = []
  for (const raw of String(stdout).split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    if (/^-+\s+-+/.test(line.trim())) continue
    if (/^site\s{2,}username/i.test(line)) continue
    const cols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
    if (cols.length < 3) continue
    const site = cols[0] ?? ''
    const username = cols[1] ?? ''
    const fields = cols[2] ?? ''
    if (!site) continue
    out.push({
      site,
      username,
      fields: fields.split(',').map((f) => f.trim()).filter(Boolean),
    })
  }
  return out
}

/**
 * 解析 `vault.ps1 list-json` 的结构化输出（2026-09-17 新增）。
 *
 * 动机（实测事故）：`list` 走 `Format-Table -AutoSize`——列宽自适配、超宽**会截断**；
 * 按 `\s{2,}` 切列在「值含空格 / 列被截断」时必然错位（线上侧车快照里 `wallet-sol`
 * 的 username 收进了「… password」、`cloudflare-api` 的 username 变成了「notes」）。
 * 结构化输出让字段归属不再依赖列宽。非法/空输入返回空数组（由调用方留痕，不猜）。
 */
export function parseVaultListJson(stdout: string): AssetAccount[] {
  const text = String(stdout).trim()
  if (text === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: AssetAccount[] = []
  for (const row of parsed) {
    if (row === null || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const site = typeof rec['site'] === 'string' ? rec['site'].trim() : ''
    if (site === '') continue
    const username = typeof rec['username'] === 'string' ? rec['username'].trim() : ''
    const rawFields = typeof rec['fields'] === 'string' ? rec['fields'] : ''
    out.push({
      site,
      username,
      fields: rawFields.split(',').map((f) => f.trim()).filter(Boolean),
    })
  }
  return out
}

/**
 * 自动选择解析路径（兼容旧脚本）：以 `[` / `{` 开头 ⇒ JSON；否则退回定宽表格。
 * 返回 `format` 供调用方决定是否留「走了降级路径」的痕——**降级必须可见**。
 */
export function parseVaultListAuto(stdout: string): { accounts: AssetAccount[]; format: 'json' | 'table' } {
  const head = String(stdout).trimStart()
  if (head.startsWith('[') || head.startsWith('{')) {
    const accounts = parseVaultListJson(stdout)
    if (accounts.length > 0 || head.startsWith('[')) return { accounts, format: 'json' }
  }
  return { accounts: parseVaultList(stdout), format: 'table' }
}

/** Cloudflare zones 响应 → 域名清单（只留非敏感字段）。 */
export function parseZones(payload: unknown): AssetDomain[] {
  const result = (payload as { result?: unknown })?.result
  if (!Array.isArray(result)) return []
  return result.map((z) => {
    const zone = z as { name?: string; status?: string; plan?: { name?: string } }
    return { name: String(zone.name ?? ''), status: String(zone.status ?? ''), plan: String(zone?.plan?.name ?? '') }
  }).filter((z) => z.name)
}

/** 从 vault notes 里取 `api-token=<token>` 的真值（**只在内存里流转**）。 */
export function extractToken(notes: string): string | null {
  const m = /api-token=([A-Za-z0-9_-]+)/.exec(String(notes))
  return m && typeof m[1] === 'string' ? m[1] : null
}

/** wei/lamports/sats → 人类可读；纯字符串运算，避免浮点误差进交付面。 */
export function formatUnits(raw: string, decimals: number): string {
  let v: bigint
  try { v = BigInt(String(raw)) } catch { return '0' }
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fracStr}`
}

export function usdFromChains(chains: ChainBalance[]): string {
  let cents = 0
  for (const c of chains) {
    if (c.status !== 'ok' || !c.usdc) continue
    const n = Number(c.usdc)
    if (Number.isFinite(n)) cents += Math.round(n * 100)
  }
  return (cents / 100).toFixed(2)
}

// ---------- 取数（依赖注入） ----------

const BALANCE_OF = '0x70a08231'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_RPC = 'https://mainnet.base.org'
const SOL_RPC = 'https://solana-rpc.publicnode.com'
const BTC_API = 'https://mempool.space/api/address/'
/**
 * Bitcoin 余额端点（按序回退）。2026-09-17 实测：本机直连 mempool.space 报 `fetch failed`
 * （该域名在当前网络不可达），而 Base / Solana 的公共 RPC 正常 ⇒ 该换端点，不该换网络。
 * 三者给出**同一 Esplora 语义**（`{chain_stats:{funded_txo_sum,spent_txo_sum}}`）。
 */
const BTC_APIS = [
  BTC_API,
  'https://blockstream.info/api/address/',
  'https://mempool.emzy.de/api/address/',
]

const pad32 = (addr: string): string => '000000000000000000000000' + addr.toLowerCase().replace(/^0x/, '')

export async function collectChains(deps: AssetsDeps, cfg: AssetsConfig, notes: string[]): Promise<ChainBalance[]> {
  const out: ChainBalance[] = []
  const rpc = (url: string, body: Record<string, unknown>): Promise<unknown> =>
    deps.fetchJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 12000 })

  // Base: native ETH + USDC (ERC-20 balanceOf)
  let ethAmount = '0'
  let usdc: string | undefined
  try {
    const r = (await rpc(BASE_RPC, { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [cfg.evmAddress, 'latest'] })) as { result?: string }
    if (typeof r?.result !== 'string') throw new Error('no result field')
    ethAmount = formatUnits(BigInt(r.result).toString(), 18)
    const u = (await rpc(BASE_RPC, { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: USDC_BASE, data: BALANCE_OF + pad32(cfg.evmAddress) }, 'latest'] })) as { result?: string }
    if (typeof u?.result === 'string') usdc = formatUnits(BigInt(u.result).toString(), 6)
  } catch (err) {
    out.push({ chain: 'Base', address: cfg.evmAddress, native: { symbol: 'ETH', amount: '—' }, status: 'error', note: String((err as Error)?.message ?? err).slice(0, 120) })
    notes.push(`assets: Base 余额取数失败 —— ${String((err as Error)?.message ?? err).slice(0, 120)}`)
  }
  if (!out.some((c) => c.chain === 'Base' && c.status === 'error')) {
    out.push({ chain: 'Base', address: cfg.evmAddress, native: { symbol: 'ETH', amount: ethAmount }, ...(usdc !== undefined ? { usdc } : {}), status: 'ok' })
  }

  // Solana
  try {
    const r = (await rpc(SOL_RPC, { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [cfg.solAddress] })) as { result?: { value?: number } }
    const lamports = r?.result?.value
    if (typeof lamports !== 'number') throw new Error('no result.value')
    out.push({ chain: 'Solana', address: cfg.solAddress, native: { symbol: 'SOL', amount: formatUnits(String(lamports), 9) }, status: 'ok' })
  } catch (err) {
    out.push({ chain: 'Solana', address: cfg.solAddress, native: { symbol: 'SOL', amount: '—' }, status: 'error', note: String((err as Error)?.message ?? err).slice(0, 120) })
    notes.push(`assets: Solana 余额取数失败 —— ${String((err as Error)?.message ?? err).slice(0, 120)}`)
  }

  // Bitcoin：多端点回退（2026-09-17 实测 mempool.space 在本机不可达 ⇒ 单端点即单点故障）
  const btcErrors: string[] = []
  for (const api of BTC_APIS) {
    try {
      const t = (await deps.fetchJson(api + cfg.btcAddress, { timeoutMs: 12000 })) as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } }
      const funded = t?.chain_stats?.funded_txo_sum
      const spent = t?.chain_stats?.spent_txo_sum
      if (typeof funded !== 'number' || typeof spent !== 'number') throw new Error('no chain_stats')
      out.push({
        chain: 'Bitcoin',
        address: cfg.btcAddress,
        native: { symbol: 'BTC', amount: formatUnits(String(funded - spent), 8) },
        status: 'ok',
        ...(api !== BTC_APIS[0] ? { note: `端点回退：${api}` } : {}),
      })
      if (api !== BTC_APIS[0]) {
        notes.push(`assets: Bitcoin 走端点回退（${api}）——首选 ${String(BTC_APIS[0] ?? '')} 不可达`)
      }
      break
    } catch (err) {
      const host = api.replace('https://', '').replace('/api/address/', '')
      btcErrors.push(`${host}: ${String((err as Error)?.message ?? err).slice(0, 60)}`)
    }
  }
  if (!out.some((c) => c.chain === 'Bitcoin')) {
    const detail = btcErrors.join(' | ').slice(0, 180)
    out.push({ chain: 'Bitcoin', address: cfg.btcAddress, native: { symbol: 'BTC', amount: '—' }, status: 'error', note: detail })
    notes.push(`assets: Bitcoin 余额取数失败（${BTC_APIS.length} 个端点全败）—— ${detail}`)
  }

  return out
}

export async function collectDomains(deps: AssetsDeps, cfg: AssetsConfig, notes: string[]): Promise<AssetDomain[]> {
  try {
    const notesText = await deps.vaultSecret(cfg.cloudflareVaultSite, 'notes')
    const token = extractToken(notesText)
    if (!token) throw new Error('vault 里找不到 api-token')
    const payload = await deps.fetchJson('https://api.cloudflare.com/client/v4/zones?per_page=50', {
      headers: { authorization: `Bearer ${token}` },
      timeoutMs: 15000,
    })
    return parseZones(payload)
  } catch (err) {
    notes.push(`assets: 域名清单取数失败 —— ${String((err as Error)?.message ?? err).slice(0, 120)}`)
    return []
  }
}

export async function collectAssets(deps: AssetsDeps, cfg: AssetsConfig, memoryEntries: number): Promise<AssetsSection> {
  const notes: string[] = []
  const chains = await collectChains(deps, cfg, notes)
  const domains = await collectDomains(deps, cfg, notes)

  let accounts: AssetAccount[] = []
  try {
    const parsedVault = parseVaultListAuto(await deps.vaultList())
    accounts = parsedVault.accounts
    if (parsedVault.format === 'table') {
      notes.push('assets: vault 清单走了**表格降级**解析（未拿到 list-json）——值含空格或超宽列可能错位')
    }
    if (accounts.length === 0) notes.push('assets: vault 清单解析出 0 条（格式可能变了）')
  } catch (err) {
    notes.push(`assets: vault 清单取数失败 —— ${String((err as Error)?.message ?? err).slice(0, 120)}`)
  }

  const code = {
    plugins: deps.countDirs(cfg.pluginsDir, 'package.json'),
    skills: deps.countDirs(cfg.skillsDir),
    checkpoints: deps.countDirs(cfg.checkpointsDir),
    memoryEntries,
  }

  const usdcUsd = usdFromChains(chains)
  return {
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    chains,
    accounts,
    domains,
    code,
    totals: {
      usdcUsd,
      note: '只折算 stablecoin（USDC ≈ USD）；ETH/SOL/BTC 显示原量不臆断估值；平台侧待结款项（Clustly/Frantic/NEAR）另计。',
    },
    notes,
  }
}
