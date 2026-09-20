import { act, Component, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ErrorBoundary } from "./ErrorBoundary"

// React 的 act 要这个开关才肯工作；没上 testing-library，就自己开。
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// 渲染时主动抛错：用来证明 ErrorBoundary 把渲染时的 throw 接住了，
// 而不只是走通没 throw 的路径。
class Boom extends Component<{ message?: string }, never> {
  render(): ReactNode {
    throw new Error(this.props.message ?? "boom")
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(node: ReactNode) {
  act(() => root.render(node))
  return host.innerHTML
}

describe("ErrorBoundary", () => {
  it("子组件渲染抛错时显示默认 fallback 与错误信息", () => {
    render(
      <ErrorBoundary>
        <Boom message="chunk 404" />
      </ErrorBoundary>,
    )
    // 把 throw 接住 → 不 unmount 整个 host
    expect(host.textContent).toContain("chunk 404")
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector(".text-destructive")).not.toBeNull()
  })

  it("重试按钮把状态清掉，子组件重新尝试渲染", () => {
    // 第一次抛、第二次不抛：retry 必须真的再走一遍 render，否则宿主
    // 永远卡在 fallback 上。
    let shouldThrow = true
    function Maybe(): ReactNode {
      if (shouldThrow) throw new Error("once")
      return <span>ok</span>
    }
    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    )
    expect(host.textContent).toContain("once")
    shouldThrow = false
    const btn = host.querySelector("button")!
    act(() => btn.click())
    expect(host.textContent).toContain("ok")
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it("自定义 fallback 能拿到 error 和 reset", () => {
    render(
      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <span>custom:{err.message}</span>
            <button type="button" onClick={reset}>reset</button>
          </div>
        )}
      >
        <Boom message="x" />
      </ErrorBoundary>,
    )
    expect(host.textContent).toContain("custom:x")
  })

  it("没有错误时不渲染 fallback", () => {
    render(
      <ErrorBoundary>
        <span>children ok</span>
      </ErrorBoundary>,
    )
    expect(host.textContent).toContain("children ok")
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
})
