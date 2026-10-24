// The per-tool input/result renderers load on demand (cards start collapsed); App preloads them on start.
import type { ComponentType } from 'react'
import { lazyModule } from '@/components/common/lazyModule'
import type { ToolBlock } from '@/lib/transcript/types'

export const toolCardBody = lazyModule<ComponentType<{ block: ToolBlock; skipInput: boolean }>>(() =>
  import('./ToolCardBody').then((m) => m.ToolCardBody),
)
