import { memo } from 'react'
import { ClampedText } from './ClampedText'

type Props = {
  id: string
  stdout?: string
  stderr?: string
  exitCode?: number
  interrupted?: boolean
  /** e.g. returnCodeInterpretation ("No matches found"), timed out note. */
  note?: string
  /** Search occurrences to ring in stdout / stderr. */
  activeIndex?: number
  stderrActiveIndex?: number
}

/** Bash output: stdout, stderr in a danger tint, and exit code / interrupted badges. */
export const TerminalPane = memo(function TerminalPane({
  id,
  stdout,
  stderr,
  exitCode,
  interrupted,
  note,
  activeIndex,
  stderrActiveIndex,
}: Props) {
  const hasOut = Boolean(stdout?.trim())
  const hasErr = Boolean(stderr?.trim())
  const showBadges = exitCode !== undefined || interrupted || note
  return (
    <div className="flex flex-col gap-1.5" data-testid="terminal-pane">
      {hasOut && (
        <ClampedText id={`${id}:stdout`} text={stdout ?? ''} title="stdout" activeIndex={activeIndex} />
      )}
      {hasErr && (
        <ClampedText
          id={`${id}:stderr`}
          text={stderr ?? ''}
          title="stderr"
          tone="danger"
          activeIndex={stderrActiveIndex}
        />
      )}
      {!hasOut && !hasErr && <p className="text-[12.5px] text-fg-muted italic">(no output)</p>}
      {showBadges && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {exitCode !== undefined && (
            <span
              className={
                exitCode === 0
                  ? 'rounded-full bg-success/12 px-2 py-px font-mono text-success'
                  : 'rounded-full bg-danger/10 px-2 py-px font-mono text-danger'
              }
            >
              exit {exitCode}
            </span>
          )}
          {interrupted && (
            <span className="rounded-full bg-accent/12 px-2 py-px text-accent-hover dark:text-accent">
              interrupted
            </span>
          )}
          {note && <span className="text-fg-muted">{note}</span>}
        </div>
      )}
    </div>
  )
})
