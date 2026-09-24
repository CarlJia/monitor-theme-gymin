import { cn } from "@/lib/utils"

/**
 * 渲染 hub 下发的公开备注 HTML(`public_remark_html`)。
 *
 * 内容由 hub 端渲染,按受信任的管理员内容处理(未净化),故这里用
 * dangerouslySetInnerHTML 直接渲染。空/缺失时不渲染任何东西(满足「为空不出空框」)。
 */
export function PublicRemark({ html, className }: { html?: string; className?: string }) {
  if (!html) return null
  return (
    <div
      className={cn(
        // 轻量 prose:排版可读、图片不溢出、长串换行,不引入 typography 插件。
        "max-w-none text-sm break-words leading-relaxed",
        "[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5",
        "[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_table]:w-full [&_th]:text-left [&_th]:pr-3 [&_td]:pr-3",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
