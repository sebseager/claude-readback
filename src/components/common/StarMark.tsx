import { cn } from '@/lib/utils'

/**
 * Soft eight-pointed starburst in the accent color. A generic geometric mark (not a
 * trademarked logo): long and short rays alternate around a rounded hub.
 */
export function StarMark({ className, title }: { className?: string; title?: string }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('size-6 text-accent', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        {rays.map((deg, i) => (
          <path key={deg} d={i % 2 === 0 ? 'M12 12V2.7' : 'M12 12V4.6'} transform={`rotate(${deg} 12 12)`} />
        ))}
      </g>
    </svg>
  )
}
