// Small persisted preferences that live in stores which are not themselves persisted.
import { useChatStore } from '@/components/chat/chatStore'

const HIDDEN_CONTEXT_KEY = 'cc-viewer:show-hidden-context'

export function saveShowHiddenContext(show: boolean): void {
  try {
    localStorage.setItem(HIDDEN_CONTEXT_KEY, show ? '1' : '0')
  } catch {
    // storage unavailable
  }
}

/** Apply the persisted "show hidden context by default" preference (call once at startup). */
export function loadShowHiddenContext(): void {
  try {
    const v = localStorage.getItem(HIDDEN_CONTEXT_KEY)
    if (v !== null) useChatStore.getState().setShowHiddenContextDefault(v === '1')
  } catch {
    // storage unavailable
  }
}
