import type {RetailReference} from '../lib/retail-reference'
import '../retail-reference.css'
export function RetailTag({name,detail}:RetailReference){return <span className="retail-reference"><span className="retail-reference-name" dir="auto">{name}</span>{detail&&<small dir="auto">{detail}</small>}</span>}
