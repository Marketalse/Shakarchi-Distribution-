import { multiplyUsd } from './money'
export function packTotal(perItem: string | number, itemsPerHalf: number, packs: number) {
 if (!Number.isSafeInteger(itemsPerHalf) || itemsPerHalf < 1 || !Number.isSafeInteger(packs * 2) || packs < 0 || packs > 100000) throw Error('Use nonnegative 0.5 Pack steps and a valid pack size.')
 return multiplyUsd(perItem, packs * 2 * itemsPerHalf)
}

/** Display only. Never encode boxes and packs as ambiguous decimal digits. */
export function packBreakdown(packs: number, packsPerBox: number): string {
 if (!Number.isSafeInteger(packs * 2) || packs < 0 || !Number.isSafeInteger(packsPerBox) || packsPerBox < 1) throw Error('Invalid packaging quantity.')
 const halves = packs * 2
 const boxes = Math.floor(halves / (packsPerBox * 2))
 const remainder = halves % (packsPerBox * 2)
 const wholePacks = Math.floor(remainder / 2)
 const parts: string[] = []
 if (boxes) parts.push(`${boxes} ${boxes === 1 ? 'Box' : 'Boxes'}`)
 if (wholePacks) parts.push(`${wholePacks} ${wholePacks === 1 ? 'Pack' : 'Packs'}`)
 if (remainder % 2) parts.push('½ Pack')
 return parts.join(' · ') || '0 Packs'
}
