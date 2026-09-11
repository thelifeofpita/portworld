/** Cache geometry until layout or an ancestor transform changes. */
export function observeLayout(element: HTMLElement) {
  let dirty = true
  const transitions = new Map<EventTarget, Set<string>>()
  const ancestors: HTMLElement[] = []
  const transition = (event: TransitionEvent) => {
    if (event.target !== event.currentTarget) return
    const target = event.currentTarget!
    const properties = transitions.get(target) ?? new Set<string>()
    if (event.type === 'transitionrun') properties.add(event.propertyName)
    else properties.delete(event.propertyName)
    if (properties.size) transitions.set(target, properties)
    else transitions.delete(target)
    dirty = true
  }
  let rect: DOMRect | null = null
  const invalidate = () => { dirty = true }
  const resize = new ResizeObserver(invalidate)
  const mutation = new MutationObserver(invalidate)
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    ancestors.push(node)
    node.addEventListener('transitionrun', transition)
    node.addEventListener('transitionend', transition)
    node.addEventListener('transitioncancel', transition)
    resize.observe(node)
    mutation.observe(node, { attributes: true, attributeFilter: ['style', 'class'] })
  }
  window.addEventListener('resize', invalidate)
  window.addEventListener('scroll', invalidate, true)
  return {
    read() { if (dirty || transitions.size) { rect = element.getBoundingClientRect(); dirty = false } },
    get rect() { return rect },
    dispose() { for (const node of ancestors) { node.removeEventListener('transitionrun', transition); node.removeEventListener('transitionend', transition); node.removeEventListener('transitioncancel', transition) }; resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', invalidate); window.removeEventListener('scroll', invalidate, true) },
  }
}
