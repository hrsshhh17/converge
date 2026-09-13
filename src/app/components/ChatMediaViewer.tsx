"use client";

import {useEffect} from "react";
import "./chat-media-viewer.css";

export type ChatMediaItem={id:string;url:string;name:string;video:boolean};

export default function ChatMediaViewer({items,index,onChange,onClose}:{items:ChatMediaItem[];index:number;onChange:(index:number)=>void;onClose:()=>void}){
 const item=items[index];
 const move=(direction:number)=>onChange((index+direction+items.length)%items.length);
 useEffect(()=>{
  const keyboard=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();if(event.key==="ArrowLeft"&&items.length>1)move(-1);if(event.key==="ArrowRight"&&items.length>1)move(1)};
  document.addEventListener("keydown",keyboard);const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  return()=>{document.removeEventListener("keydown",keyboard);document.body.style.overflow=previous};
 // move intentionally reads the currently rendered index.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[index,items.length,onClose]);
 if(!item)return null;
 return <div className="chatMediaViewer" role="dialog" aria-modal="true" aria-label="Chat media viewer" onMouseDown={event=>event.target===event.currentTarget&&onClose()}>
  <header><span><b>{item.name||"Shared media"}</b><small>{index+1} of {items.length}</small></span><a href={item.url} target="_blank" rel="noreferrer" title="Open original">↗</a><button onClick={onClose} aria-label="Close media viewer">×</button></header>
  <section key={item.id}>{item.video?<video src={item.url} controls autoPlay playsInline/>:<img src={item.url} alt={item.name||"Shared media"}/>}</section>
  {items.length>1&&<><button className="mediaViewerPrevious" onClick={()=>move(-1)} aria-label="Previous media">‹</button><button className="mediaViewerNext" onClick={()=>move(1)} aria-label="Next media">›</button><footer>{items.map((media,itemIndex)=><button key={media.id} className={itemIndex===index?"active":""} onClick={()=>onChange(itemIndex)} aria-label={`Open media ${itemIndex+1}`}>{media.video?<video src={media.url} muted preload="metadata"/>:<img src={media.url} alt=""/>}</button>)}</footer></>}
 </div>;
}
