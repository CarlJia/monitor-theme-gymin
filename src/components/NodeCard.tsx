import { ArrowDown, ArrowUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { CountryFlag } from "@/components/CountryFlag"
import { Meter } from "@/components/Meter"
import { OsIcon } from "@/components/OsIcon"
import { PublicRemark } from "@/components/PublicRemark"
import { QualitySlot } from "@/components/QualityBand"
import type { Node } from "@/lib/api"
import { bytes, daysUntil, FOREVER, osName, pair, percent, rate, uptime } from "@/lib/format"
import type { ProbeSeries } from "@/lib/quality"
import { monthUsage, trafficFoot } from "@/lib/traffic"
import { cn } from "@/lib/utils"

// A node that has reported once has told the hub its shape -- cores, memory,
// disk -- and the hub retains its traffic totals whether connected or not. A node
// that never connected is the only case with nothing to show.
function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/**
 * The dot plus how long the machine has been up, or once it is gone, how long it
 * has been absent -- the first question asked of an offline node. Both are
 * durations, so the badge keeps its shape either way.
 */
export function Status({ node }: { node: Node }) {
  const down = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const label = node.online
    ? `在线 ${node.metrics ? uptime(node.metrics.uptime) : ""}`
    : deployed(node)
      ? `离线 ${down >= 60 ? uptime(down) : ""}`
      : "未接入"
  return (
    // Muted once it stops reporting: the figures on the page are genuine, merely
    // no longer current.
    <Badge
      variant="outline"
      className={cn("tnum shrink-0 gap-1.5 font-normal", !node.online && "text-muted-foreground")}
    >
      <span className={cn("size-1.5 rounded-full", node.online ? "bg-online" : "bg-muted-foreground/40")} />
      {label.trim()}
    </Badge>
  )
}

/** Where the machine is. Default render is the country's flag so a row of cards
 *  reads at a glance; the native tooltip on hover shows the country letters for
 *  anyone who needs the code spelled out. */
export function Country({ node }: { node: Node }) {
  if (!node.country) return null
  return (
    // 旗子不带外框：这里除了旗没有别的内容，描一圈等于把旗子的边再画一遍。
    // 悬停提示与可访问名字留在 span 上——role="img" 不可省，光有 aria-label 的裸
    // span 没有角色，读屏不一定把它念出来。
    <span
      role="img"
      aria-label={node.country}
      title={node.country}
      className="inline-flex shrink-0 items-center"
    >
      <CountryFlag code={node.country} />
    </span>
  )
}

// No date means nothing expires: a permanent host, or one with no renewal set. A
// blank corner asserts neither.
function Expiry({ node }: { node: Node }) {
  const days = daysUntil(node.expires_at)
  if (days === null) return <span className="text-xs text-muted-foreground" title="永不到期">{FOREVER}</span>
  const tone = days < 0 ? "text-destructive" : days <= 7 ? "text-warn" : "text-muted-foreground"
  return (
    <span className={cn("tnum text-xs", tone)}>
      {days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}
    </span>
  )
}

export function NodeCard({
  node,
  onOpen,
  quality,
}: {
  node: Node
  onOpen: () => void
  /** Per-node series: undefined = toggle off, null = loading, [] = no probe. */
  quality?: ProbeSeries[] | null
}) {
  const m = node.metrics
  // 发行版名交给图标，虚拟化与架构留在文字里：这两者没有能一眼认出的标志，
  // 缩成图标只会变成两个分不清的方块。
  const spec = [node.virt && node.virt !== "none" ? node.virt : "", node.arch].filter(Boolean).join(" · ")

  return (
    <Card
      onClick={onOpen}
      // min-w-0: a grid item sizes to its content unless told otherwise, and the
      // OS line below does not wrap, so on a phone the card would grow past its
      // column and scroll the page sideways. The truncate inside only takes effect
      // once the card is allowed to be narrower.
      className="min-w-0 cursor-pointer gap-0 p-4 transition-colors hover:border-ring"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate font-medium">{node.name}</h3>
            <Country node={node} />
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {node.os ? (
              <>
                <OsIcon os={node.os} title={osName(node.os)} />
                {/* 图标把发行版名换掉了，而 svg 的 title 只在悬停时出现——触屏
                    永远不会悬停，光看标志也分不出两个都没收录的发行版。所以悬停
                    拿不到的那类设备上把名字补回文字。它与图标承担的是同一个名字，
                    读屏只该听见一次，因此对无障碍隐藏。 */}
                <span aria-hidden="true" className="hidden truncate pointer-coarse:inline">
                  {osName(node.os)}
                </span>
              </>
            ) : (
              /* 一句话都没有才写「等待首次上报」：os 没读到、架构却报上来了时，
                 写成「等待首次上报 · x86_64」是自相矛盾的。 */
              !spec && <span className="truncate">等待首次上报</span>
            )}
            {/* virt/arch 单独渲染：它们与 os 同属一次上报，但只在 os 缺席时一并
                丢掉这两个字段，等于凭一个字段的缺失抹掉另外两个。 */}
            {spec && <span className="truncate">{spec}</span>}
          </p>
        </div>
        {/* State right, identity left, one line each. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Status node={node} />
          <Expiry node={node} />
        </div>
      </div>

      {/* One layout for both states: a disconnected node still knows its
          cores, memory, disk size and traffic totals, and showing those with
          the live figures blank beats a stretched card with one line in it. */}
      {deployed(node) ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            {/* The core count belongs beside the word CPU: it is what the
                percentage and the load averages are both measured against. */}
            <Meter
              label={`CPU ${node.cpu_cores} 核`}
              pct={m ? m.cpu : null}
              foot={m ? m.load.map((n) => n.toFixed(2)).join(" ") : "—"}
            />
            <Meter
              label="内存"
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
            />
            <Meter
              label="硬盘"
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
            />
            <Meter
              label="流量"
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              empty={FOREVER}
              foot={trafficFoot(node)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
            <span className="tnum inline-flex items-center gap-1.5">
              <ArrowDown className="size-3 text-muted-foreground" />
              {m ? rate(m.net_rx) : "—"}
            </span>
            <span className="tnum inline-flex items-center gap-1.5">
              <ArrowUp className="size-3 text-muted-foreground" />
              {m ? rate(m.net_tx) : "—"}
            </span>
            <span className="tnum inline-flex items-center gap-1.5 text-muted-foreground">
              <ArrowDown className="size-3" />
              {bytes(node.total_rx)}
            </span>
            <span className="tnum inline-flex items-center gap-1.5 text-muted-foreground">
              <ArrowUp className="size-3" />
              {bytes(node.total_tx)}
            </span>
          </div>

          {/* Quality bands sit below the live figures: they answer a different
              question ("how has the line been") than the instantaneous rates
              above. QualitySlot renders nothing when there is nothing to draw,
              so the card keeps its height whether or not probes exist. */}
          <QualitySlot quality={quality} className="mt-4 border-t pt-4" />
        </>
      ) : (
        /* Never connected: nothing to plot, so the card stays short rather than
           padding out to match its neighbours. */
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          还没有接入。在后台生成安装命令并执行一次。
        </p>
      )}
      {/* 公开备注:紧凑呈现,限高避免撑破卡片栅格;详情页展示完整版。 */}
      <PublicRemark
        html={node.public_remark_html}
        className="mt-4 border-t pt-3 text-xs text-muted-foreground line-clamp-3"
      />
    </Card>
  )
}
