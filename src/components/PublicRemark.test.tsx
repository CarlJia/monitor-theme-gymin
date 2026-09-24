import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PublicRemark } from "./PublicRemark"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
  return host
}

describe("PublicRemark", () => {
  it("为空或缺失时不渲染任何东西", () => {
    expect(render(<PublicRemark html="" />).innerHTML).toBe("")
    expect(render(<PublicRemark html={undefined} />).innerHTML).toBe("")
  })

  it("非空时把 hub 下发的 HTML 渲染出来", () => {
    render(<PublicRemark html={"<strong>用途</strong> <a href=\"/x\">x</a>"} />)
    const strong = host.querySelector("strong")
    expect(strong?.textContent).toBe("用途")
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/x")
  })
})
