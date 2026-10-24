import { emitFiles } from '@/app/store'

// `.meta.json` passes through `.json`; non-transcript files are filtered again at ingest.
export const ACCEPTED_FILE_TYPES = '.jsonl,.json,.meta.json,application/json,application/x-ndjson'

/** Opens the native file picker (multi-select) and forwards the chosen files to the store. */
export function openFilePicker(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = ACCEPTED_FILE_TYPES
  input.addEventListener('change', () => {
    emitFiles(Array.from(input.files ?? []))
  })
  input.click()
}
