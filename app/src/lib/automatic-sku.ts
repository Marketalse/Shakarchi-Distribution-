/** A pending create keeps its frozen SKU across retries; existing identifiers are never regenerated. */
export function automaticSku(existing:unknown,pending:{label:string;command:{request:unknown}}|null,generated:string){
 if(typeof existing==='string'&&existing.trim())return existing
 if(pending?.label==='Product'){
  const request=pending.command.request as {rows?:{sku?:unknown}[]}
  const saved=request.rows?.[0]?.sku
  if(typeof saved!=='string'||!saved)throw Error('The pending product identifier needs review. Retry the original request.')
  return saved
 }
 return generated
}
