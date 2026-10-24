import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Button>, 'children'> & {
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** Ghost icon button with a tooltip; `label` doubles as the accessible name. */
export function IconButton({ label, children, side = 'bottom', className, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn('text-fg-secondary hover:bg-hover hover:text-fg', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
