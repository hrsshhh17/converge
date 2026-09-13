export function appearanceStorageKey(workspaceId:string,userId:string,chatId:string,setting:string){
 return `converge:appearance:${workspaceId}:${userId}:${chatId}:${setting}`;
}

// Compare local calendar days, not elapsed hours (which vary with daylight saving).
export function chatDateLabel(value:string,now=new Date(),locale?:string){
 const date=new Date(value);
 const ordinal=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
 const days=ordinal(now)-ordinal(date);
 if(days===0)return "Today";
 if(days===1)return "Yesterday";
 if(days>1&&days<7)return date.toLocaleDateString(locale,{weekday:"long"});
 return date.toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"});
}

export function chatDateTime(value:string,now=new Date(),locale?:string){
 return `${chatDateLabel(value,now,locale)} · ${new Date(value).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"})}`;
}

export function messageLinkParts(text:string):{text:string;href?:string}[]{
 const parts:{text:string;href?:string}[]=[];let cursor=0;
 for(const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi)){
  const start=match.index!;let url=match[0].replace(/[.,!?;:'"\u2019\u201d]+$/u,"");
  while(url.endsWith(")")&&(url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length)url=url.slice(0,-1);
  while(url.endsWith("]")&&(url.match(/\]/g)||[]).length>(url.match(/\[/g)||[]).length)url=url.slice(0,-1);
  const href=/^www\./i.test(url)?`https://${url}`:url;
  try{const parsed=new URL(href);if(!["http:","https:"].includes(parsed.protocol)||!parsed.hostname)continue}catch{continue}
  if(start>cursor)parts.push({text:text.slice(cursor,start)});
  parts.push({text:url,href});cursor=start+url.length;
 }
 if(cursor<text.length)parts.push({text:text.slice(cursor)});
 return parts;
}
