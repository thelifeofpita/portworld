// DOM writes that skip when nothing changed. A per-frame animation that has
// settled otherwise keeps rewriting identical attributes and styles, and every
// write invalidates style (and, for SVG geometry, layout) for that frame.
// Reading an attribute or inline style back is a plain DOM read — it never
// forces layout — so the comparison is far cheaper than the write it avoids.

export function setAttr(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value)
}

export function setStyle(element: HTMLElement | SVGElement, name: 'opacity' | 'transform' | 'visibility', value: string) {
  if (element.style[name] !== value) element.style[name] = value
}

// Positions rounded to 1/100px: invisible on screen, but it lets values that
// converge asymptotically (lerps never land exactly) settle into identical
// strings, so setAttr/setStyle can actually skip them.
export const px = (value: number) => String(Math.round(value * 100) / 100)
