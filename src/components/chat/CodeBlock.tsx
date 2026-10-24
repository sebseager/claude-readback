import type { ComponentProps } from 'react'
import type { ExtraProps } from 'react-markdown'
import { CopyButton } from '@/components/common/CopyButton'
import { hastToString } from './rehypeSearchHighlight'

const LANGUAGE_LABELS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
}

function languageOf(node: ExtraProps['node']): string | undefined {
  const code = node?.children.find((c) => c.type === 'element' && c.tagName === 'code')
  if (!code || code.type !== 'element') return undefined
  const cls: unknown = code.properties?.className
  const list: unknown[] = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(' ') : []
  const lang = list.map(String).find((c) => c.startsWith('language-'))
  return lang?.slice('language-'.length)
}

/** `pre` override for react-markdown: language label + copy button above the highlighted code. */
export function CodeBlock({ node, children, className, ...rest }: ComponentProps<'pre'> & ExtraProps) {
  const lang = languageOf(node)
  const label = lang ? (LANGUAGE_LABELS[lang] ?? lang) : 'text'
  return (
    <div className="md-codeblock not-prose my-3 overflow-hidden rounded-xl border border-border bg-bubble">
      <div className="flex h-8 items-center justify-between border-b border-border/70 pr-1.5 pl-3.5">
        <span className="font-mono text-[11.5px] text-fg-muted">{label}</span>
        <CopyButton text={() => hastToString(node).replace(/\n$/, '')} label="Copy code" />
      </div>
      <pre className={className} {...rest}>
        {children}
      </pre>
    </div>
  )
}
