import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/community/sheet";
import { STORY_STICKERS, positionStoryLayer, type StoryLayer } from "@/lib/kamino/media-v10-rules";

export function StoryLayers({layers}:{layers:StoryLayer[]}) {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Story stickers and text">
    {layers.map(layer=><div key={layer.id} className="absolute max-w-[80%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-center font-bold" style={{left:`${layer.x}%`,top:`${layer.y}%`,transform:`translate(-50%,-50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,fontSize:layer.kind==="sticker"?36:20,color:layer.color,background:layer.backdrop?"rgba(0,0,0,.65)":"transparent"}}>
      {layer.kind==="mention"?<a className="pointer-events-auto underline" href={`/u/${layer.text}`}>@{layer.text}</a>:layer.text}
    </div>)}
  </div>;
}

export function StoryLayerEditor({layers,onChange,background}:{layers:StoryLayer[];onChange:(layers:StoryLayer[])=>void;background:string}) {
  const [selected,setSelected]=useState<string|null>(null),stage=useRef<HTMLDivElement>(null);
  const layer=layers.find(l=>l.id===selected);
  function patch(change:Partial<StoryLayer>){if(layer)onChange(layers.map(l=>l.id===layer.id?{...l,...change}:l));}
  function add(kind:StoryLayer["kind"]){
    const next:StoryLayer={id:crypto.randomUUID(),kind,text:kind==="sticker"?"✨":kind==="mention"?"member":"Your words",x:50,y:50,scale:1,rotation:0,color:"#ffffff",backdrop:true};
    onChange([...layers,next]);setSelected(next.id);
  }
  return <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Story layer editor">
    <h3 className="font-bold">Arrange text, stickers and mentions</h3>
    <p className="text-xs text-muted">Drag a layer to position it. Keyboard users can select a layer and use arrow keys, or adjust its position below.</p>
    <div className="flex flex-wrap gap-2">{(["text","sticker","mention"] as const).map(kind=><Button key={kind} variant="secondary" disabled={layers.length>=12} onClick={()=>add(kind)}>Add {kind}</Button>)}</div>
    <div ref={stage} className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-xl" style={{background}}>
      {layers.map(l=><button key={l.id} type="button" aria-label={`${l.kind}: ${l.text}`} aria-pressed={selected===l.id} className={`k-focus absolute max-w-[80%] select-none whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-center font-bold ${selected===l.id?"ring-2 ring-white":""}`} style={{left:`${l.x}%`,top:`${l.y}%`,touchAction:"none",transform:`translate(-50%,-50%) rotate(${l.rotation}deg) scale(${l.scale})`,fontSize:l.kind==="sticker"?36:20,color:l.color,background:l.backdrop?"rgba(0,0,0,.65)":"transparent"}}
        onPointerDown={event=>{setSelected(l.id);event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const bounds=stage.current?.getBoundingClientRect();if(bounds)onChange(layers.map(item=>item.id===l.id?{...item,x:positionStoryLayer((event.clientX-bounds.left)/bounds.width*100),y:positionStoryLayer((event.clientY-bounds.top)/bounds.height*100)}:item));}}
        onPointerUp={event=>event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={event=>{const dx=event.key==="ArrowLeft"?-2:event.key==="ArrowRight"?2:0,dy=event.key==="ArrowUp"?-2:event.key==="ArrowDown"?2:0;if(dx||dy){event.preventDefault();onChange(layers.map(item=>item.id===l.id?{...item,x:positionStoryLayer(item.x+dx),y:positionStoryLayer(item.y+dy)}:item));}}}>
        {l.kind==="mention"?`@${l.text}`:l.text}
      </button>)}
      {!layers.length?<p className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-white/80">Your layers appear here</p>:null}
    </div>
    {layer?<div className="space-y-3">
      <label className="block text-sm">{layer.kind==="mention"?"Member handle":layer.kind==="sticker"?"Sticker":"Layer text"}
        {layer.kind==="sticker"?<select className={fieldClass} value={layer.text} onChange={e=>patch({text:e.target.value})}>{STORY_STICKERS.map(sticker=><option key={sticker}>{sticker}</option>)}</select>:<input className={fieldClass} maxLength={layer.kind==="mention"?30:200} value={layer.text} onChange={e=>patch({text:e.target.value.replace(layer.kind==="mention"?/^@/:/$^/,"")})}/>}
      </label>
      <div className="grid grid-cols-2 gap-3">{([{key:"x",label:"Horizontal position",min:5,max:95,step:1},{key:"y",label:"Vertical position",min:5,max:95,step:1},{key:"scale",label:"Size",min:.5,max:2.5,step:.1},{key:"rotation",label:"Rotation",min:-180,max:180,step:5}] as const).map(control=><label key={control.key} className="text-sm">{control.label}<input className="w-full" type="range" min={control.min} max={control.max} step={control.step} value={layer[control.key]} onChange={e=>patch({[control.key]:Number(e.target.value)})}/></label>)}</div>
      <label className="flex items-center gap-2 text-sm">Text color<input type="color" value={layer.color} onChange={e=>patch({color:e.target.value})}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={layer.backdrop} onChange={e=>patch({backdrop:e.target.checked})}/>Readable background</label>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{onChange([...layers.filter(l=>l.id!==layer.id),layer]);}}>Bring to front</Button><Button variant="danger" onClick={()=>{onChange(layers.filter(l=>l.id!==layer.id));setSelected(null);}}>Remove layer</Button></div>
    </div>:null}
  </section>;
}
