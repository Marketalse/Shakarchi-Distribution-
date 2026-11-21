/** Bound connection attempts; uncertain writes are retried with their original operation ID. */
export async function boundedFetch(input:RequestInfo|URL,init?:RequestInit){
 const controller=new AbortController(),signal=init?.signal
 const cancel=()=>controller.abort()
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true})
 const timer=setTimeout(cancel,12000)
 try{return await fetch(input,{...init,signal:controller.signal})}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
