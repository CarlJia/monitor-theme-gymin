import { useEffect, useState } from "react"

export type Metrics = {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export type Node = {
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  /** ISO 3166-1 alpha-2, or empty when the hub could not locate the address. */
  country: string
  last_seen: number
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  price: number
  currency: string
  billing_cycle: string
  expires_at: string | null
  traffic_limit: number
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_start: string
  day_rx: number
  day_tx: number
  /** Panel only. */
  hostname?: string
  ip?: string
  remark?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 错误正文的展示上限。反代在 5xx 时常常回一整页 HTML，整段塞进界面上没有意义。 */
const ERROR_TEXT_MAX = 200

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  })
  if (!res.ok) throw new ApiError(res.status, (await res.text()).slice(0, ERROR_TEXT_MAX) || res.statusText)
  return res.status === 204 ? (undefined as T) : res.json()
}

/**
 * Fleet throughput, one sample per push. Held beside the stream that feeds it
 * rather than in the tile that draws it: the summary unmounts while a node page is
 * open, so a buffer held there would restart empty on every return. Two minutes at
 * the hub's push interval.
 */
const KEEP = 60
export const speedHistory: { rx: number; tx: number }[] = []

function sample(nodes: Node[]) {
  const live = nodes.filter((n) => n.online && n.metrics)
  speedHistory.push({
    rx: live.reduce((s, n) => s + n.metrics!.net_rx, 0),
    tx: live.reduce((s, n) => s + n.metrics!.net_tx, 0),
  })
  if (speedHistory.length > KEEP) speedHistory.shift()
}

/** alpha-2 的形状。hub 的 `country` 要进 Leaflet 的 tooltip 与国旗路径的构造（lib/flags.ts）。 */
const ALPHA2 = /^[A-Z]{2}$/

/** A malformed report must not remove every other node from the page. */
export function safeNodes(nodes: Node[]): Node[] {
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  const fields = ["uptime", "cpu", "mem_total", "mem_used", "swap_total", "swap_used", "disk_total", "disk_used",
    "net_rx", "net_tx", "total_rx", "total_tx", "month_rx", "month_tx", "tcp", "udp", "procs"] as const
  return nodes.map((node) => {
    const m = node.metrics
    const live = !m || (fields.every((key) => number(m[key])) && Array.isArray(m.load) && m.load.length === 3 && m.load.every(number))
    // alpha-2 以外的 country 一律清空。这个值会喂给 Leaflet 的 tooltip 与国旗
    // 路径的构造（lib/flags.ts），两处都只认这个形状：清成空串后卡片按「未定位」
    // 渲染，比留着一个指向不存在国旗的码强；tooltip 那条路径的内容也因此由这里
    // 保证，而不是靠查表顺带限住。
    const placed = typeof node.country !== "string" || ALPHA2.test(node.country)
    // 没有要改的就原样返回：引用相等是下游每 2 秒一帧的成本前提。
    if (live && placed) return node
    return { ...node, metrics: live ? m : null, country: placed ? node.country : "" }
  })
}

/**
 * One WebSocket frame's node list. The hub pushes `{ nodes: [...] }` every two
 * seconds; a frame that is not that shape returns null instead of throwing.
 *
 * `JSON.parse` inside an `onmessage` handler is the one place a protocol change
 * could take the page down quietly: an exception there does not close the
 * socket, so the connection still looks live, the view stays on its last frame,
 * and the fallback poll -- which is only armed from `onclose` -- never starts.
 */
export function parseNodesFrame(raw: string): Node[] | null {
  try {
    const nodes = (JSON.parse(raw) as { nodes?: unknown } | null)?.nodes
    return Array.isArray(nodes) ? (nodes as Node[]) : null
  } catch {
    return null
  }
}

/**
 * Live node list. Uses the WebSocket the hub pushes every two seconds, falling
 * back to polling if it cannot be established.
 */
export function useNodes() {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when the hub answers 401: the status page has been closed to anonymous
  // callers since this tab loaded. The hub also ends the stream, so this surfaces
  // on the fallback fetch the reconnect starts; a close allows a client to
  // re-query its state but cannot compel it.
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const receive = (list: Node[]) => {
      const safe = safeNodes(list)
      sample(safe)
      setNodes(safe)
      setError(null)
      setClosed(false)
    }

    const fetchOnce = () =>
      api<{ nodes: Node[] }>("/nodes")
        .then((d) => receive(d.nodes))
        .catch((e: Error) => {
          setError(e.message)
          if (e instanceof ApiError && e.status === 401) setClosed(true)
        })

    // 后台标签页的轮询不发请求：hub 侧的历史扫描与 agent 上报争同一条写连接，
    // 一个被忘在后台的标签页不该继续占它。首帧不设这道门——标签页可能在后台
    // 载入，那时反而更需要把数据拿到手。
    const pollOnce = () => {
      if (!document.hidden) fetchOnce()
    }

    fetchOnce()

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`
    // 连续这么多帧解不出来就放弃这条 WebSocket，交给 HTTP 兜底轮询接手。两条路
    // 是各自独立的响应封装，帧那一侧变了（换了信封、改成二进制帧）时 /nodes 往
    // 往还是好的，所以放弃比死守值钱。
    const MAX_BAD_FRAMES = 3
    let badFrames = 0
    let gaveUp = false

    // A hub restart closes every stream. Without reconnecting, a page that
    // outlives a deploy would remain on the fallback poll for the rest of its
    // life, refreshing at a fifth of the live rate with no indication.
    const connect = () => {
      try {
        socket = new WebSocket(url)
      } catch {
        poll ??= setInterval(pollOnce, 5000)
        return
      }
      socket.onmessage = (event) => {
        // 兜底轮询只是替流值守的，流一回来就撤掉。先撤再判后台：漏掉这一步的话，
        // 隐藏状态下 poll 与流会同时往界面里写。
        if (poll) {
          clearInterval(poll)
          poll = null
        }
        // 后台标签页不解析也不渲染：帧每 2 秒一推，回到前台后下一帧自己补上。
        if (document.hidden) return
        const list = parseNodesFrame(event.data)
        if (!list) {
          // 这里原先直接 `JSON.parse(...).nodes`，一个不认识的帧就在 onmessage 里
          // 抛异常——而 onmessage 抛异常不会关闭 socket，于是连接看着是活的、界面
          // 停在最后一帧、兜底轮询（只在 onclose 里挂）永远不启动，只剩控制台每 2
          // 秒刷一条。现在坏帧要么报出来，要么连连接一起放弃。
          if (++badFrames >= MAX_BAD_FRAMES) {
            gaveUp = true
            setError("推送数据无法解析，已切换为轮询")
            socket?.close()
            return
          }
          setError("推送数据无法解析")
          return
        }
        badFrames = 0
        receive(list)
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (closed) return
        poll ??= setInterval(pollOnce, 5000)
        // 放弃过就不再重连：否则会以 5 秒一轮的节奏连上又断开，对 hub 是纯负担。
        if (!gaveUp) retry = setTimeout(connect, 5000)
      }
    }
    connect()

    return () => {
      closed = true
      socket?.close()
      if (poll) clearInterval(poll)
      if (retry) clearTimeout(retry)
    }
  }, [])

  return { nodes, error, closed }
}
