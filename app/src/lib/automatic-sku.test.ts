import {it,expect}from'vitest'
import {automaticSku}from'./automatic-sku'
it('preserves existing and frozen pending identifiers across retries',()=>{expect(automaticSku('EXISTING',null,'NEW')).toBe('EXISTING');expect(automaticSku(undefined,{label:'Product',command:{request:{rows:[{sku:'FROZEN'}]}}},'NEW')).toBe('FROZEN');expect(automaticSku(undefined,null,'GENERATED')).toBe('GENERATED');expect(()=>automaticSku(undefined,{label:'Product',command:{request:{}}},'NEW')).toThrow('pending product identifier')})
