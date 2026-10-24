import { createElement, memo } from 'react'
import { highlightText } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from './chatStore'
import { useMarkdownRenderer, type MarkdownProps } from './markdownLoader'

/**
 * GFM markdown with highlighted code fences, copyable code blocks and search marks. The renderer loads
 * lazily; until then the raw text shows (whitespace kept, search marks included) so nothing jumps far.
 */
export const Markdown = memo(function Markdown(props: MarkdownProps) {
  const Renderer = useMarkdownRenderer()
  const query = useSearchQuery()
  // createElement: the component comes from a module loaded at runtime (stable once loaded).
  if (Renderer) return createElement(Renderer, props)
  const { markdown, className, activeIndex, variant = 'default' } = props
  return (
    <div
      className={cn(
        'markdown whitespace-pre-wrap wrap-anywhere',
        variant === 'quiet' && 'markdown-quiet',
        className,
      )}
    >
      {highlightText(markdown, query, activeIndex)}
    </div>
  )
})
