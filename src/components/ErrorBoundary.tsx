import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

// chunk 拉取失败、组件渲染时抛错、第三方库边界 bug —— 这层接住
// 它们。Suspense 不会捕获 lazy import 失败（404/网络断/CORS），错误会
// 冒泡到这里。挂在 Suspense 之外：一处详情页挂了，列表与其它视图
// 还能用；整树不会因一个 chunk 404 一起 unmount。
type Props = {
  children: ReactNode
  fallback?: (err: Error, reset: () => void) => ReactNode
}

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台是 dev 唯一的现场，连同 component stack 一并写出来
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (error) {
      return this.props.fallback ? this.props.fallback(error, this.reset) : (
        <div role="alert" className="space-y-3 py-16 text-center text-sm">
          <p className="text-destructive">组件加载失败：{error.message}</p>
          <Button variant="outline" size="sm" onClick={this.reset}>重试</Button>
        </div>
      )
    }
    return this.props.children
  }
}
