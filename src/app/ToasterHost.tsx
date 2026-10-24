import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { markToasterReady } from './toast'

/** Lazily loaded toaster; its effect runs after sonner's own subscription, so queued toasts can go. */
export default function ToasterHost() {
  useEffect(() => markToasterReady(), [])
  return <Toaster position="bottom-right" />
}
