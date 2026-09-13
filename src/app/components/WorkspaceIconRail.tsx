"use client";
import Link from "next/link";
import {ReactNode} from "react";

export type RailDestination="home"|"messages"|"groups"|"files"|"calendar"|"screen"|"ai";
const icons:Record<RailDestination,ReactNode>={
 home:<><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
 messages:<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 9 9 0 0 1 18 0Z"/>,
 groups:<><circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 7"/></>,
 files:<path d="M3 5h6l2 2h10v12H3Z"/>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 2v6m8-6v6"/></>,
 screen:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-3-9 3-3 3 3m-3-3v6"/></>,
 ai:<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/>
};
const labels:Record<RailDestination,string>={home:"Home",messages:"Messages",groups:"Groups",files:"Files",calendar:"Calendar",screen:"Meeting",ai:"Converge AI"};
export const RailGlyph=({name}:{name:RailDestination})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
export function WorkspaceRailLinks({workspaceId,active,badge}:{workspaceId:string;active:RailDestination;badge?:number}){
 const href=(destination:RailDestination)=>destination==="home"?`/workspace/${workspaceId}`:destination==="messages"?`/workspace/${workspaceId}/messages`:destination==="groups"?`/workspace/${workspaceId}/groups`:destination==="files"?`/workspace/${workspaceId}/files`:destination==="ai"?`/workspace/${workspaceId}?view=ai`:`/workspace/${workspaceId}?view=${destination}`;
 return <>{(Object.keys(labels) as RailDestination[]).map(destination=><Link className={active===destination?"railActive":""} href={href(destination)} aria-label={labels[destination]} title={labels[destination]} key={destination}><RailGlyph name={destination}/>{destination==="messages"&&!!badge&&<b className="railBadge">{badge>99?"99+":badge}</b>}</Link>)}</>;
}
