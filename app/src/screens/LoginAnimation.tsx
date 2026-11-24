import {useEffect,useRef} from 'react'
import {MobileIcon} from './MobileIcon'
/** First-party vector animation, no remote animation assets or tracking. */
export function LoginAnimation(){
 const host=useRef<HTMLDivElement>(null)
 useEffect(()=>{let active=true,animation:import('lottie-web').AnimationItem|undefined
  void import('lottie-web/build/player/lottie_light').then(({default:lottie})=>{if(!active||!host.current)return
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),shape={ty:'gr',it:[{ty:'rc',d:1,s:{a:0,k:[84,100]},p:{a:0,k:[0,0]},r:{a:0,k:18}},{ty:'fl',c:{a:0,k:[.11,.16,.27,1]},o:{a:0,k:100}},{ty:'tr',p:{a:0,k:[80,80]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100},sk:{a:0,k:0},sa:{a:0,k:0}}]}
   const animationData={v:'5.12.2',fr:30,ip:0,op:90,w:160,h:160,nm:'Connected workspace',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'Workspace card',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},shapes:[shape],ip:0,op:90,st:0,bm:0},{ddd:0,ind:2,ty:4,nm:'Connected signal',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[80,80,0]},a:{a:0,k:[0,0,0]},s:{a:1,k:[{t:0,s:[85,85,100],e:[115,115,100],i:{x:[.6,.6,.6],y:[1,1,1]},o:{x:[.4,.4,.4],y:[0,0,0]}},{t:45,s:[115,115,100],e:[85,85,100],i:{x:[.6,.6,.6],y:[1,1,1]},o:{x:[.4,.4,.4],y:[0,0,0]}},{t:90,s:[85,85,100]}]}},shapes:[{ty:'el',d:1,s:{a:0,k:[38,38]},p:{a:0,k:[0,0]}},{ty:'fl',c:{a:0,k:[.79,.95,.25,1]},o:{a:0,k:100}}],ip:0,op:90,st:0,bm:0}]}
   animationData.layers.reverse();animation=lottie.loadAnimation({container:host.current,renderer:'svg',loop:true,autoplay:!reduced.matches,animationData})
   const change=()=>{if(reduced.matches)animation?.goToAndStop(0,true);else animation?.play()};reduced.addEventListener('change',change);change();remove=()=>reduced.removeEventListener('change',change)
  }).catch(()=>{/* Static accessible fallback remains. */})
  let remove=()=>{};return()=>{active=false;remove();animation?.destroy()}
 },[])
 return <div className="login-animation" aria-hidden="true"><MobileIcon name="lock" size={48}/><div ref={host}/></div>
}
