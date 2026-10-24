// Lazy loading for the markdown pipeline (react-markdown + remark-gfm + mdast/hast + CodeBlock). The main
// chunk renders a plain-text fallback until the renderer module arrives; App preloads it on start.
import type { ComponentType } from 'react'
import { lazyModule } from '@/components/common/lazyModule'

export interface MarkdownProps {
  markdown: string
  className?: string
  /** Occurrence of the search query to ring (0-based within this markdown). */
  activeIndex?: number
  /** Quieter style for thinking text. */
  variant?: 'default' | 'quiet'
}

const renderer = lazyModule<ComponentType<MarkdownProps>>(() =>
  import('./MarkdownRenderer').then((m) => m.MarkdownRenderer),
)

export const loadMarkdownRenderer = renderer.load
export const useMarkdownRenderer = renderer.use
