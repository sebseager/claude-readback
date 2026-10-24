import { ExternalLink } from 'lucide-react'
import { memo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import { safeHref } from '@/components/common/url'
import { useSearchQuery } from '../chatStore'

export interface Link {
  title: string
  url: string
}

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** WebSearch results as a list of links. */
export const LinkList = memo(function LinkList({
  links,
  activeIndex,
}: {
  links: Link[]
  activeIndex?: number
}) {
  const query = useSearchQuery()
  const active =
    activeIndex === undefined
      ? undefined
      : splitActive(
          links.map((l) => l.title || l.url),
          query,
          activeIndex,
        )
  return (
    <ul className="flex flex-col gap-0.5">
      {links.map((l, i) => {
        const href = safeHref(l.url)
        return (
          <li key={`${l.url}-${i}`}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="group/link flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-hover"
              >
                <span className="truncate text-fg underline decoration-border underline-offset-2 group-hover/link:decoration-fg-muted">
                  {highlightText(l.title || l.url, query, active?.[i])}
                </span>
                <span className="shrink-0 text-[11.5px] text-fg-muted">{host(href)}</span>
                <ExternalLink className="size-3 shrink-0 self-center text-fg-muted opacity-0 group-hover/link:opacity-100" />
              </a>
            ) : (
              // Not an http(s) URL: never clickable.
              <div className="flex min-w-0 items-baseline gap-2 px-2 py-1 text-[13px]">
                <span className="truncate text-fg">
                  {highlightText(l.title || l.url, query, active?.[i])}
                </span>
                <code className="truncate font-mono text-[11.5px] text-fg-muted">{l.url}</code>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
})
