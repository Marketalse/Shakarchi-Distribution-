import { multiplyUsd } from './money'
export function packTotal(perItem: string | number, itemsPerHalf: number, packs: number) {
 if (!Number.isSafeInteger(itemsPerHalf) || itemsPerHalf < 1 || !Number.isSafeInteger(packs * 2) || packs < 0 || packs > 100000) throw Error('Use nonnegative 0.5 Pack steps and a valid pack size.')
 return multiplyUsd(perItem, packs * 2 * itemsPerHalf)
}
