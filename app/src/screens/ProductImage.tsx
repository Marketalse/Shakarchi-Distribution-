import {useEffect,useRef,useState} from 'react'
import {db} from '../lib/db'
import {supabase} from '../lib/supabase'
import {cachedProductImage,downloadProductImage} from '../lib/product-images'
import '../product-images.css'
/** Private media is downloaded only when its card is visible, then cached on this owner-bound device. */
export function ProductImage({path,label}:{path?:string|null;label:string}){
 const box=useRef<HTMLSpanElement>(null)
 const [state,setState]=useState<{path?:string;src?:string;failed?:boolean}>({})
 useEffect(()=>{
  if(!path)return
  let active=true,started=false
  async function load(){if(started)return;started=true;try{const saved=await cachedProductImage(db,path!);if(saved){if(active)setState({path:path!,src:saved});return}if(!supabase||!navigator.onLine)return;const src=await downloadProductImage(db,supabase,path!);if(active)setState({path:path!,src})}catch{if(active)setState({path:path!,failed:true})}}
  const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){void load();observer?.disconnect()}},{rootMargin:'150px'})
  if(observer&&box.current)observer.observe(box.current);else void load()
  return()=>{active=false;observer?.disconnect()}
 },[path])
 const src=state.path===path&&!state.failed?state.src:undefined
 return <span className="product-thumbnail product-photo" ref={box}>{src?<img src={src} alt={label} loading="lazy" onError={()=>setState({path:path??undefined,failed:true})}/>:<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10"/></svg>}</span>
}
