import { memo, useMemo, type ComponentProps } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeHref } from '@/components/common/url'
import { cn } from '@/lib/utils'
import { useSearchQuery } from './chatStore'
import { CodeBlock } from './CodeBlock'
import { useRehypeHighlight } from './highlightLoader'
import type { MarkdownProps } from './markdownLoader'
import { rehypeSearchHighlight, type Pluggable } from './rehypeSearchHighlight'

const remarkPlugins = [remarkGfm]

const components: Components = {
  pre: CodeBlock,
  table: ({ node: _node, ...props }: ComponentProps<'table'> & ExtraProps) => (
    <div className="md-table-wrap scrollbar-thin">
      <table {...props} />
    </div>
  ),
  // Only absolute http(s) links are clickable; anything else (javascript:, data:, relative paths) renders
  // as plain text with the target in a tooltip.
  a: ({ node: _node, href, children, ...props }: ComponentProps<'a'> & ExtraProps) => {
    const safe = safeHref(href)
    return safe ? (
      <a {...props} href={safe} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ) : (
      <span className="md-unsafe-link" title={href}>
        {children}
      </span>
    )
  },
}

/**
 * GFM markdown with highlighted code fences, copyable code blocks and search marks. Loaded lazily (see
 * markdownLoader): react-markdown, remark and highlight.js stay out of the main chunk.
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  markdown,
  className,
  activeIndex,
  variant = 'default',
}: MarkdownProps) {
  const query = useSearchQuery()
  // highlight.js arrives in its own chunk; code renders plain until then.
  const rehypeHighlight = useRehypeHighlight()
  const rehypePlugins = useMemo<Pluggable[]>(() => {
    const list: Pluggable[] = []
    if (rehypeHighlight) list.push([rehypeHighlight, { detect: false }] as Pluggable)
    if (query.trim()) list.push([rehypeSearchHighlight, { query, activeIndex }] as Pluggable)
    return list
  }, [query, activeIndex, rehypeHighlight])
  return (
    <div className={cn('markdown', variant === 'quiet' && 'markdown-quiet', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
})
