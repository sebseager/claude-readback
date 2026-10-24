// Parsers for loosely-typed tool inputs/results.
import { asArray, asBool, asRecord, asString } from '../util'
import type { Question } from './QuestionsView'
import type { Todo } from './TodoList'

export function toQuestions(v: unknown): Question[] | undefined {
  const arr = asArray(v)
  if (!arr) return undefined
  return arr.flatMap((q) => {
    const r = asRecord(q)
    const question = asString(r?.question)
    if (!r || !question) return []
    const options = (asArray(r.options) ?? []).flatMap((o) => {
      const or = asRecord(o)
      const label = asString(or?.label) ?? asString(o)
      return label ? [{ label, description: asString(or?.description) }] : []
    })
    return [{ question, header: asString(r.header), options, multiSelect: asBool(r.multiSelect) }]
  })
}

export function toTodos(v: unknown): Todo[] | undefined {
  const arr = asArray(v)
  if (!arr) return undefined
  return arr.flatMap((t) => {
    const r = asRecord(t)
    const content = asString(r?.content)
    return r && content
      ? [{ content, status: asString(r.status) ?? 'pending', activeForm: asString(r.activeForm) }]
      : []
  })
}
