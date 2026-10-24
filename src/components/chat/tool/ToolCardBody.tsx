import type { ToolBlock } from '@/lib/transcript/types'
import { Section } from './Section'
import { ToolInput } from './ToolInput'
import { ToolResultView } from './ToolResultView'

/** The expanded part of a ToolCard. Lives in its own chunk with every per-tool renderer. */
export function ToolCardBody({ block, skipInput }: { block: ToolBlock; skipInput: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-3 pt-2.5 pb-3">
      {!skipInput && (
        <Section title="Input">
          <ToolInput block={block} />
        </Section>
      )}
      <Section title="Result">
        <ToolResultView block={block} />
      </Section>
    </div>
  )
}
