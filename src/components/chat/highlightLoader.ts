// highlight.js in its own chunk: code fences render unhighlighted until it arrives, then re-render coloured.
// rehype-highlight registers lowlight's `common` subset (~37 languages) by default, never all of highlight.js,
// and we pass `detect: false` so unlabelled fences are not guessed at.
import type rehypeHighlightFn from 'rehype-highlight'
import { lazyModule } from '@/components/common/lazyModule'

const plugin = lazyModule<typeof rehypeHighlightFn>(() => import('rehype-highlight').then((m) => m.default))

export const loadRehypeHighlight = plugin.load
export const useRehypeHighlight = plugin.use
