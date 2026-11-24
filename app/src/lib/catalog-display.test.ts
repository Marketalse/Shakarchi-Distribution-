import {it,expect} from 'vitest'
import {catalogMode} from './catalog-display'
it('uses explicit master-data type tokens without guessing from brand or partial words',()=>{expect(catalogMode('Lost Mary DTL')).toBe('DTL');expect(catalogMode('Series_mtl')).toBe('MTL');expect(catalogMode('DTL-special')).toBe('DTL');expect(catalogMode('LOST MARY')).toBe('');expect(catalogMode('DTLux')).toBe('')})
