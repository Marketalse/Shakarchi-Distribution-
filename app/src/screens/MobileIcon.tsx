import type { CSSProperties } from 'react'

/** Supplied Solar asset; CSS mask colors it without altering the source SVG. */
export function MobileIcon({ name, size = 24 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="mobile-icon" style={{ '--icon': `url(/mobile-assets/${name}.svg)`, width: size, height: size } as CSSProperties} />
}
