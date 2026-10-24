// jsdom has no layout. Give elements sizes so virtualized lists render rows (viewport 800px, rows 120px).
export function fakeLayout(): () => void {
  const rect = HTMLElement.prototype.getBoundingClientRect
  const descriptors = {
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
    clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth'),
  }
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 760,
      bottom: 120,
      width: 760,
      height: 120,
      toJSON: () => ({}),
    } as DOMRect
  }
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 800 })
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 760 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 120 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 760 })
  return () => {
    HTMLElement.prototype.getBoundingClientRect = rect
    if (descriptors.offsetHeight)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.offsetHeight)
    if (descriptors.offsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptors.offsetWidth)
    if (descriptors.clientHeight)
      Object.defineProperty(Element.prototype, 'clientHeight', descriptors.clientHeight)
    if (descriptors.clientWidth)
      Object.defineProperty(Element.prototype, 'clientWidth', descriptors.clientWidth)
  }
}
