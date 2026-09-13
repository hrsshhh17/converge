"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import MeetingInviteHub from "./MeetingInviteHub";
import MeetingReminderComposer from "./MeetingReminderComposer";

const themes=[{id:"ember",name:"Ember",colors:["#100c0a","#ff6748"]},{id:"light",name:"Light",colors:["#f7f3ef","#d85c3f"]},{id:"midnight",name:"Midnight",colors:["#080d19","#6987ff"]},{id:"forest",name:"Forest",colors:["#08130f","#4fc487"]},{id:"ocean",name:"Ocean",colors:["#07151a","#40b8cf"]},{id:"plum",name:"Plum",colors:["#160b19","#c873de"]}];
export default function WorkspaceThemePicker({workspaceId,userId}:{workspaceId:string;userId:string}){
 const key=`converge:workspace-theme:${workspaceId}:${userId}`,[theme,setTheme]=useState(()=>typeof localStorage==="undefined"?"ember":localStorage.getItem(key)||"ember"),[open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const shell=document.querySelector<HTMLElement>(".workspaceShell");if(shell)shell.dataset.workspaceTheme=theme;document.documentElement.dataset.workspaceTheme=theme;localStorage.setItem(key,theme);window.dispatchEvent(new CustomEvent("converge:theme-change",{detail:{workspaceId,theme}}));return()=>{if(shell)delete shell.dataset.workspaceTheme}},[key,theme,workspaceId]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[open]);
 useEffect(()=>{const toggle=()=>setOpen(value=>!value);window.addEventListener("converge:toggle-theme-picker",toggle);return()=>window.removeEventListener("converge:toggle-theme-picker",toggle)},[]);
 const topbar=typeof document!=="undefined"?document.querySelector(".topbar"):null;if(!topbar)return null;
 return createPortal(<><div className="workspaceThemeControl" ref={root}><button aria-label="Choose workspace theme" title="Theme" onClick={()=>setOpen(value=>!value)}><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18h1.4a1.8 1.8 0 0 0 0-3.6h-.8a1.8 1.8 0 0 1 0-3.6H16A5 5 0 0 0 21 9c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10" cy="6.8" r=".7"/><circle cx="14.2" cy="6.6" r=".7"/></svg></button>{open&&<aside><header><small>APPEARANCE</small><b>Workspace theme</b></header>{themes.map(item=><button className={theme===item.id?"active":""} onClick={()=>{setTheme(item.id);setOpen(false)}} key={item.id}><i style={{background:`linear-gradient(135deg,${item.colors[0]} 50%,${item.colors[1]} 50%)`}}/><span>{item.name}</span>{theme===item.id&&<em>✓</em>}</button>)}</aside>}</div><MeetingInviteHub workspaceId={workspaceId} meId={userId}/><MeetingReminderComposer workspaceId={workspaceId} meId={userId}/></>,topbar);
}
