import { toast } from '@/app/toast'

/** Copies `text` to the clipboard with a toast. Returns whether it worked. */
export async function copyToClipboard(text: string, what = 'Copied to clipboard'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(what)
    return true
  } catch {
    toast.error('Could not copy: clipboard access was denied')
    return false
  }
}
