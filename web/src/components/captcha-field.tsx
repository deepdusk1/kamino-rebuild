import {useEffect,useRef} from 'react';
type Turnstile={render:(element:HTMLElement,options:{sitekey:string;callback:(token:string)=>void;'expired-callback':()=>void;'error-callback':()=>void})=>string;remove:(id:string)=>void};
export function CaptchaField({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}){
  const element=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken;
  useEffect(()=>{
    let disposed=false,id:string|undefined;const win=window as typeof window&{turnstile?:Turnstile};
    const render=()=>{if(!disposed&&element.current&&win.turnstile)id=win.turnstile.render(element.current,{sitekey:siteKey,callback:token=>callback.current(token),'expired-callback':()=>callback.current(''),'error-callback':()=>callback.current('')});};
    let script=document.querySelector<HTMLScriptElement>('script[data-kamino-turnstile]');
    if(win.turnstile)render();else if(script)script.addEventListener('load',render,{once:true});else{script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.dataset.kaminoTurnstile='true';script.addEventListener('load',render,{once:true});document.head.appendChild(script);}
    return()=>{disposed=true;script?.removeEventListener('load',render);if(id)win.turnstile?.remove(id);};
  },[siteKey]);
  return <div ref={element} aria-label="Anti-bot verification" className="min-h-16"/>;
}
