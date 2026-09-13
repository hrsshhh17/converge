"use client";
import {useEffect,useMemo,useState} from "react";
import {messageLinkParts} from "../../lib/chat-display";

type Reminder={title:string;startsAt:string;duration:number;host:string;details:string};
const parseReminder=(text:string):Reminder|null=>{if(!text.startsWith("📣 MEETING REMINDER\n"))return null;const[,title,startsAt,duration,host,...details]=text.split("\n");const minutes=Number(duration);return title&&startsAt&&!Number.isNaN(new Date(startsAt).getTime())?{title,startsAt,duration:Number.isFinite(minutes)?minutes:60,host:host||"Workspace member",details:details.join("\n").trim()}:null};
const countdown=(milliseconds:number)=>{const total=Math.max(0,Math.floor(milliseconds/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return [{value:days,label:"DAYS"},{value:hours,label:"HRS"},{value:minutes,label:"MIN"},{value:seconds,label:"SEC"}]};

function MeetingReminderText({reminder,selecting}:{reminder:Reminder;selecting:boolean}){
 const[now,setNow]=useState(0);
 useEffect(()=>{const tick=()=>setNow(Date.now()),first=window.setTimeout(tick,0),timer=window.setInterval(tick,1000);return()=>{window.clearTimeout(first);window.clearInterval(timer)}},[]);
 const start=useMemo(()=>new Date(reminder.startsAt),[reminder.startsAt]),ready=now>0,remaining=ready?start.getTime()-now:1,ended=ready&&now>start.getTime()+reminder.duration*60000;
 const openMeeting=()=>{if(selecting)return;const match=location.pathname.match(/^\/workspace\/[^/]+/);if(match)location.assign(`${match[0]}?view=screen`)};
 return <span className="meetingReminderCard"><span className="meetingReminderTop"><i>◎</i><span><small>UPCOMING WORKSPACE MEETING</small><b>{reminder.title}</b></span></span><span className="meetingReminderFacts"><span><small>HOSTED BY</small><b>{reminder.host}</b></span><span><small>STARTS</small><b>{start.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}</b></span><span><small>DURATION</small><b>{reminder.duration} min</b></span></span>{reminder.details&&<span className="meetingReminderDetails">{reminder.details}</span>}<span className={`meetingCountdown ${remaining<=0?"started":""}`}><small>{ended?"SCHEDULED TIME PASSED":remaining<=0?"MEETING TIME REACHED":"STARTS IN"}</small>{remaining>0&&<span>{countdown(remaining).map(part=><b key={part.label}>{String(part.value).padStart(2,"0")}<em>{part.label}</em></b>)}</span>}</span><button type="button" onClick={event=>{event.stopPropagation();openMeeting()}}>Open meeting</button></span>;
}

export default function MessageText({text,selecting=false}:{text:string;selecting?:boolean}){
 const reminder=parseReminder(text);if(reminder)return <MeetingReminderText reminder={reminder} selecting={selecting}/>;
 return <>{messageLinkParts(text).map((part,index)=>part.href?<a key={index} className="chatTextLink" href={part.href} target="_blank" rel="noopener noreferrer" onClick={event=>{if(selecting)event.preventDefault();else event.stopPropagation()}}>{part.text}</a>:part.text)}</>;
}
