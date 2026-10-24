import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildLongMockSession, buildMockSession } from '@/lib/transcript/mock'
import { MessageList, type MessageListHandle } from '../MessageList'
import { resetChatStore } from './testUtils'

// jsdom has no layout: give every element a size so the virtualizer has a viewport and row heights.
let restore: () => void
beforeAll(() => {
  const rect = HTMLElement.prototype.getBoundingClientRect
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  HTMLElement.prototype.getBoundingClientRect = function () {
    const h = this.dataset.testid === 'scroller' ? 800 : 120
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 760,
      bottom: h,
      width: 760,
      height: h,
      toJSON: () => ({}),
    } as DOMRect
  }
  // Viewport (clientHeight) 800px; every measured row (offsetHeight) 120px.
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 800 })
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 760 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 120 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 760 })
  restore = () => {
    HTMLElement.prototype.getBoundingClientRect = rect
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight)
    if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
    if (clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', clientHeight)
    if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth)
  }
})
afterAll(() => restore())
beforeEach(resetChatStore)

function renderList(session = buildLongMockSession(3000)) {
  const scroller = document.createElement('div')
  scroller.dataset.testid = 'scroller'
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 10_000_000 })
  // jsdom doesn't scroll; record the virtualizer's requests instead.
  scroller.scrollTo = ((opts?: ScrollToOptions) => {
    if (typeof opts?.top === 'number') scroller.scrollTop = opts.top
  }) as typeof scroller.scrollTo
  document.body.appendChild(scroller)
  const ref = createRef<MessageListHandle>()
  const utils = render(
    <TooltipProvider>
      <MessageList session={session} ref={ref} scrollElement={scroller} />
    </TooltipProvider>,
    { container: scroller },
  )
  return { ...utils, scroller, ref }
}

describe('MessageList virtualization', () => {
  it('renders only a bounded window of a 3000-row session', () => {
    const { container } = renderList()
    const rendered = container.querySelectorAll('[data-row-id]').length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(40)
  })

  it('keeps stable row keys and scrolls to a row by id through the ref', () => {
    const session = buildLongMockSession(3000)
    const { container, ref, scroller } = renderList(session)
    expect(container.querySelector('[data-row-id="long-turn-0"]')).not.toBeNull()
    let ok = false
    act(() => {
      ok = ref.current!.scrollToRow('long-turn-500', { align: 'start' })
    })
    expect(ok).toBe(true)
    expect(scroller.scrollTop).toBeGreaterThan(10_000)
    expect(ref.current!.scrollToRow('nope')).toBe(false)
  })

  it('renders the rich mock session without crashing', () => {
    const { container } = renderList(buildMockSession())
    expect(container.querySelectorAll('[data-row-id]').length).toBeGreaterThan(0)
  })
})
