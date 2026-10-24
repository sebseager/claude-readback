// Public surface of the transcript data layer (pure functions, no React).
export * from './types'
export { parseJsonl, recordByLine, type ParseError, type ParseResult } from './parse'
export { foldSession, type FoldOptions } from './fold'
export { summarizeTool, toolCategory, isAgentTool, type ToolCategory } from './tools'
export { buildSearchIndex, searchSession, stripBase64, type Match, type SearchOptions } from './search'
export { classifyFile, linkSubagents, forkParentOf, type FileClass, type FileRole } from './subagents'
export {
  parsePromptText,
  parsePromptContent,
  parseCommandTags,
  parseCommandOutput,
  parseTaskNotification,
  parseAgentMessage,
  detectInterrupt,
  promptPreview,
  newPasteCounter,
  type PasteCounter,
} from './prompt'
