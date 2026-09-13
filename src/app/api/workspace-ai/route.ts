import {NextRequest,NextResponse} from "next/server";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";

type Source={id:string;kind:"Message"|"Post"|"Person"|"File"|"Group"|"Account"|"Workspace"|"Event";title:string;excerpt:string;href:string;createdAt:string;score:number;imageUrl?:string;citation?:number};
type Turn={role?:string;text?:string};
type Attachment={name?:string;mimeType?:string;data?:string;text?:string};
type Claims={sub?:string;aud?:string|string[];role?:string;iss?:string;exp?:number;nbf?:number};

let jwksCache:{expires:number;keys:(JsonWebKey&{kid?:string})[]}|null=null;
const fallbackProjectJwk:JsonWebKey&{kid:string}={kty:"EC",crv:"P-256",alg:"ES256",use:"sig",kid:"053e6129-64a6-4076-a30e-e3367d28e3be",x:"G-ovsi15ai0mEwK8wPV7uMJE9h1-bmaXHLQjzBfJ9tY",y:"3PIF1LYBwMAybCuZBTDaEQ2pav4zFh9c7m0E7TBRSVw"};
async function signingKey(kid:string){
 const now=Date.now();
 if(!jwksCache||jwksCache.expires<now){
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
  if(!base)return null;
  try{const response=await fetch(`${base}/auth/v1/.well-known/jwks.json`,{next:{revalidate:3600}});if(response.ok){const payload=await response.json() as {keys?:Array<JsonWebKey&{kid?:string}>};jwksCache={keys:payload.keys||[],expires:now+60*60*1000}}}catch{}
 }
 return jwksCache?.keys.find(key=>key.kid===kid)||(fallbackProjectJwk.kid===kid?fallbackProjectJwk:null);
}

const responseText=(payload:unknown)=>{
 const result=payload as {output_text?:string;output?:Array<{content?:Array<{type?:string;text?:string}>}>};
 if(result.output_text?.trim())return result.output_text.trim();
 return (result.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==="output_text").map(item=>item.text||"").join("\n").trim();
};

const geminiText=(payload:unknown)=>{
 const result=payload as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
 return (result.candidates||[]).flatMap(candidate=>candidate.content?.parts||[]).map(part=>part.text||"").join("\n").trim();
};
const geminiFunction=(payload:unknown)=>{
 const result=payload as {candidates?:Array<{content?:{parts?:Array<{functionCall?:{name?:string;args?:Record<string,unknown>}}>} }>};
 return (result.candidates||[]).flatMap(candidate=>candidate.content?.parts||[]).map(part=>part.functionCall).find(Boolean);
};

const decodePart=<T,>(part:string)=>JSON.parse(Buffer.from(part,"base64url").toString("utf8")) as T;
async function verifyAccessToken(token:string){
 const parts=token.split(".");
 if(parts.length!==3)return null;
 try{
  const header=decodePart<{alg?:string;kid?:string}>(parts[0]),claims=decodePart<Claims>(parts[1]);
  if(header.alg!=="ES256"||!header.kid)return null;
  const jwk=await signingKey(header.kid);if(!jwk)return null;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,Buffer.from(parts[2],"base64url"),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now=Math.floor(Date.now()/1000),audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  const issuer=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
  if(!valid||!claims.sub||claims.iss!==issuer||!audiences.includes("authenticated")||claims.role!=="authenticated"||!claims.exp||claims.exp<=now||(claims.nbf&&claims.nbf>now))return null;
  return claims;
 }catch{return null}
}

export async function GET(){
 const provider=process.env.GEMINI_API_KEY?"Gemini":process.env.OPENAI_API_KEY?"OpenAI":"";
 const model=provider==="Gemini"?process.env.GEMINI_MODEL||"gemini-flash-lite-latest":process.env.OPENAI_MODEL||"gpt-5.2";
 return NextResponse.json({configured:Boolean(provider),provider,model});
}

export async function POST(request:NextRequest){
 const provider=process.env.GEMINI_API_KEY?"Gemini":process.env.OPENAI_API_KEY?"OpenAI":"";
 const modelName=provider==="Gemini"?process.env.GEMINI_MODEL||"gemini-flash-lite-latest":process.env.OPENAI_MODEL||"gpt-5.2";
 if(!provider)return NextResponse.json({error:"Converge AI needs a GEMINI_API_KEY or OPENAI_API_KEY in .env.local before it can generate real answers."},{status:503});
 const body=await request.json().catch(()=>null) as {workspaceId?:string;question?:string;sources?:Source[];history?:Turn[];attachment?:Attachment}|null;
 const workspaceId=body?.workspaceId?.trim(),question=body?.question?.trim();
 if(!workspaceId||!question)return NextResponse.json({error:"Workspace and question are required."},{status:400});
 if(!/^[0-9a-f-]{36}$/i.test(workspaceId)||question.length>1200)return NextResponse.json({error:"The AI request is not valid."},{status:400});
 const token=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:"AI request did not receive your browser session. Refresh the workspace and try again."},{status:401});
 const claims=await verifyAccessToken(token);
 if(!claims)return NextResponse.json({error:"Your login session has expired or is invalid. Sign in once and try again."},{status:401});
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!supabaseUrl||!supabaseKey)return NextResponse.json({error:"Workspace data service is not configured."},{status:503});
 const supabase=createSupabaseClient(supabaseUrl,supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:membership,error:membershipError}=await supabase.from("workspace_members").select("user_id").eq("workspace_id",workspaceId).eq("user_id",claims.sub).maybeSingle();
 if(membershipError||!membership)return NextResponse.json({error:"You do not have access to this workspace."},{status:403});

 const allowedKinds=new Set(["Message","Post","Person","File","Group","Account","Workspace","Event"]);
 const sources=(Array.isArray(body?.sources)?body.sources:[]).slice(0,30).map((source,index):Source=>({
  id:String(source.id||`source-${index}`).slice(0,120),
  kind:allowedKinds.has(source.kind)?source.kind:"Message",
  title:String(source.title||"Workspace source").replace(/\s+/g," ").slice(0,180),
  excerpt:String(source.excerpt||"").replace(/\s+/g," ").slice(0,500),
  href:String(source.href||"").startsWith(`/workspace/${workspaceId}`)||String(source.href||"").startsWith("/profile/")?String(source.href):`/workspace/${workspaceId}`,
  createdAt:String(source.createdAt||"").slice(0,40),
  score:Number.isFinite(source.score)?Number(source.score):0,
  imageUrl:/^https?:\/\//i.test(String(source.imageUrl||""))?String(source.imageUrl).slice(0,1000):undefined
 }));
 const rawAttachment=body?.attachment;
 const attachment=rawAttachment&&String(rawAttachment.name||"").length<=180&&String(rawAttachment.data||"").length<=12_000_000&&String(rawAttachment.text||"").length<=1_000_000?{name:String(rawAttachment.name||"Attached file"),mimeType:String(rawAttachment.mimeType||"application/octet-stream"),data:String(rawAttachment.data||""),text:String(rawAttachment.text||"")}:null;
 const context=sources.map((item,index)=>`[${index+1}] ${item.kind} | ${item.title} | ${item.createdAt||"no date"}\n${item.excerpt}`).join("\n\n");
 const history=(body?.history||[]).slice(-6).map(turn=>`${turn.role==="assistant"?"Assistant":"User"}: ${String(turn.text||"").slice(0,700)}`).join("\n");
 const instructions=`You are Converge AI, a grounded workspace assistant powered by ${provider} model ${modelName}. If asked which AI or model powers you, answer directly. Answer other questions from authorized workspace sources and attached files. Account, Workspace and Group sources are authoritative for identity, dates and member counts. Never invent missing details or show unrelated sources. Cite only supporting workspace sources. For an explicit main-group message request call propose_main_group_message. For an explicit direct-message request call propose_direct_message. For a request to open or go to a workspace page call navigate_workspace. Message functions create confirmation cards and must not be described as sent before confirmation. Navigation can happen directly. Use the user's language.`;
 const functionDeclarations=[{name:"propose_main_group_message",description:"Prepare a text message for the main workspace group.",parameters:{type:"OBJECT",properties:{message:{type:"STRING",description:"Exact message text."}},required:["message"]}},{name:"propose_direct_message",description:"Prepare a direct message to one named workspace member.",parameters:{type:"OBJECT",properties:{recipientName:{type:"STRING",description:"Exact member name supplied by the user."},message:{type:"STRING",description:"Exact message text."}},required:["recipientName","message"]}},{name:"navigate_workspace",description:"Open a page inside the current workspace.",parameters:{type:"OBJECT",properties:{destination:{type:"STRING",enum:["home","messages","groups","files","calendar","meeting","ai","profile"],description:"Requested destination page."}},required:["destination"]}}];
 const input=`Conversation context:\n${history||"No earlier turns."}\n\nUser question:\n${question}\n${attachment?`\nAttached file: ${attachment.name} (${attachment.mimeType}). Analyze it as requested.`:""}\n\nAuthorized workspace sources:\n${context||"No matching sources found."}`;
 let aiResponse:Response;
 try{
  aiResponse=provider==="Gemini"
   ?await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":process.env.GEMINI_API_KEY!,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:"user",parts:[...(attachment?.text?[{text:`Contents of ${attachment.name}:\n${attachment.text}`}]:attachment?.data?[{inlineData:{mimeType:attachment.mimeType,data:attachment.data}}]:[]),{text:input}]}],tools:[{functionDeclarations}],generationConfig:{maxOutputTokens:attachment?1600:1000}})})
   :await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.2",store:false,max_output_tokens:900,instructions,input})});
 }catch{return NextResponse.json({error:"The server could not reach the AI model. Please try again in a moment."},{status:503})}
 const payload=await aiResponse.json().catch(()=>null);
 if(!aiResponse.ok){
  const providerError=(payload as {error?:{message?:string;code?:string|number;type?:string;status?:string}}|null)?.error;
  if(provider==="Gemini"){const exhausted=aiResponse.status===429||providerError?.status==="RESOURCE_EXHAUSTED";return NextResponse.json({error:exhausted?"Gemini free-tier quota is temporarily exhausted. Wait for the quota window to reset and try again.":providerError?.message||"Gemini could not answer right now.",code:exhausted?"ai_quota_exhausted":"gemini_error"},{status:exhausted?429:502})}
  const creditsRequired=aiResponse.status===429&&(providerError?.code==="insufficient_quota"||providerError?.type==="insufficient_quota"||/credits remaining|billing|quota/i.test(providerError?.message||""));
  if(creditsRequired)return NextResponse.json({error:"Converge AI is paused because this API organization has no credits remaining.",code:"ai_credits_exhausted",billingUrl:"https://platform.openai.com/settings/organization/billing/"},{status:402});
  return NextResponse.json({error:providerError?.message||"The AI model could not answer right now."},{status:502});
 }
 const functionCall=provider==="Gemini"?geminiFunction(payload):undefined;
 const proposedMessage=/^propose_(main_group|direct)_message$/.test(functionCall?.name||"")?String(functionCall?.args?.message||"").trim().slice(0,4000):"";
 const recipientName=functionCall?.name==="propose_direct_message"?String(functionCall.args?.recipientName||"").trim().slice(0,160):"";
 const destination=functionCall?.name==="navigate_workspace"?String(functionCall.args?.destination||"").trim():"";
 const pendingAction=destination?{type:"navigate_workspace",destination}:proposedMessage?(recipientName?{type:"send_direct_message",message:proposedMessage,recipientName}:{type:"send_main_group_message",message:proposedMessage}):null;
 const answer=destination?`Opening ${destination}.`:pendingAction?`I prepared a ${recipientName?`direct message to ${recipientName}`:"message for the main workspace group"}. Review it below and confirm before sending.`:provider==="Gemini"?geminiText(payload):responseText(payload);
 if(!answer)return NextResponse.json({error:"The AI model returned an empty answer."},{status:502});
 const cited=[...answer.matchAll(/\[(\d+)\]/g)].map(match=>Number(match[1])-1).filter(index=>index>=0&&index<sources.length);
 const visibleSources=[...new Set(cited)].map(index=>({...sources[index],citation:index+1}));
 return NextResponse.json({answer,sources:visibleSources,pendingAction,mode:"ai",provider,userId:claims.sub});
}
