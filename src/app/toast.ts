// Toast facade: same call shape as sonner's `toast`, but sonner itself (and the Toaster) load lazily, off
// the main chunk. Calls made before the Toaster has mounted wait for it, so no toast is lost.
import type { ExternalToast } from 'sonner'

type Kind = 'message' | 'success' | 'error' | 'info' | 'warning'

let ready: () => void = () => {}
const toasterReady = new Promise<void>((resolve) => {
  ready = resolve
})

/** Called by ToasterHost once sonner's <Toaster> is subscribed. */
export function markToasterReady(): void {
  ready()
}

function show(kind: Kind, message: string, opts?: ExternalToast): void {
  void Promise.all([import('sonner'), toasterReady]).then(([{ toast: t }]) => {
    if (kind === 'message') t(message, opts)
    else t[kind](message, opts)
  })
}

export const toast = Object.assign(
  (message: string, opts?: ExternalToast) => show('message', message, opts),
  {
    success: (message: string, opts?: ExternalToast) => show('success', message, opts),
    error: (message: string, opts?: ExternalToast) => show('error', message, opts),
    info: (message: string, opts?: ExternalToast) => show('info', message, opts),
    warning: (message: string, opts?: ExternalToast) => show('warning', message, opts),
  },
)
