/// <reference types="node" />
import assert from "node:assert/strict"
import { parseNodesFrame, safeNodes, type Node } from "./api.ts"

const node = { id: 1, metrics: { uptime: 100, cpu: 1, load: [0.1, 0.2, 0.3],
  mem_total: 1024, mem_used: 512, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 1024,
  net_rx: 10, net_tx: 20, total_rx: 100, total_tx: 200, month_rx: 50, month_tx: 100,
  tcp: 3, udp: 4, procs: 20 } } as Node
assert.equal(safeNodes([node])[0], node)
for (const patch of [{ load: null }, { load: [1, "bad", 3] }, { cpu: "bad" }, { net_rx: Infinity }]) {
  const bad = { ...node, metrics: { ...node.metrics, ...patch } } as unknown as Node
  const result = safeNodes([bad, node])
  assert.equal(result[0].metrics, null)
  assert.equal(result[1], node)
}

// country 的边界校验：只有两个大写字母放行。这个值会进 Leaflet 的 tooltip 与国旗
// 路径的构造（lib/flags.ts），所以校验放在数据入界处，而不是指望下游每一处都自己防。
const withCountry = (country: unknown) => ({ ...node, country }) as unknown as Node
const us = withCountry("US")
assert.equal(safeNodes([us])[0], us, "合法 alpha-2 原样返回、不复制")
for (const bad of ["us", "USA", "<img src=x>", "U1", " U", ""]) {
  assert.equal(safeNodes([withCountry(bad)])[0].country, "", `非 alpha-2 清空：${JSON.stringify(bad)}`)
}
assert.equal(safeNodes([withCountry(undefined)])[0].country, undefined, "缺失的 country 不算坏值、不凭空补字段")
// 两处同时坏时不能互相吞没：metrics 清空，country 也清空。
const both = { ...node, country: "zz", metrics: { ...node.metrics, cpu: "bad" } } as unknown as Node
const fixed = safeNodes([both])[0]
assert.equal(fixed.metrics, null, "metrics 仍然清空")
assert.equal(fixed.country, "", "country 也清空")

// 一帧推送的解析：形状不对时返回 null，而不是抛异常。onmessage 里抛异常不会关闭
// socket——连接看着是活的、界面停在最后一帧、兜底轮询（只在 onclose 里挂）永远不
// 启动，这条正是要挡住的。
assert.deepEqual(parseNodesFrame(JSON.stringify({ nodes: [node] })), [node], "正常帧解析出节点数组")
assert.deepEqual(parseNodesFrame(JSON.stringify({ nodes: [] })), [], "空列表是合法帧")
for (const raw of ["", "{", "null", "5", '"str"', JSON.stringify({}), JSON.stringify({ nodes: "x" }), JSON.stringify([node])]) {
  assert.equal(parseNodesFrame(raw), null, `非节点帧返回 null：${raw}`)
}
console.log("invalid live reports are isolated")

// public_remark_html：字符串原样透传（引用相等），非字符串降级为 undefined，
// 且折进 safeNodes 的引用相等提前返回里（不绕过降级）。
const withRemark = (v: unknown) => ({ ...node, public_remark_html: v }) as unknown as Node
const goodRemark = withRemark("<p>hi</p>")
assert.equal(safeNodes([goodRemark])[0], goodRemark, "字符串 public_remark_html 原样返回、不复制")
assert.equal(safeNodes([withRemark(123)])[0].public_remark_html, undefined, "非字符串降级为 undefined")
assert.equal(safeNodes([withRemark({})])[0].public_remark_html, undefined, "对象降级为 undefined")
assert.equal(safeNodes([node])[0].public_remark_html, undefined, "缺失字段不凭空补")
console.log("public_remark_html normalized")
