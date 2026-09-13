"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import "./media-editor.css";
import "./media-draft.css";

type Ratio={label:string;value:number|null};
type CropRect={sx:number;sy:number;sw:number;sh:number;ratio:number};

const RATIOS:Ratio[]=[
 {label:"Original",value:null},
 {label:"1:1",value:1},
 {label:"4:5",value:4/5},
 {label:"16:9",value:16/9},
];

const outputName=(file:File,extension:string)=>`${file.name.replace(/\.[^.]+$/,"")}-edited.${extension}`;
const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,"0")}`;

function useObjectUrl(file:File){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]);
 return url;
}

function cropRect(image:HTMLImageElement,selectedRatio:number|null,zoom:number,x:number,y:number):CropRect{
 const naturalRatio=image.naturalWidth/image.naturalHeight;
 const ratio=selectedRatio||naturalRatio;
 let baseWidth=image.naturalWidth,baseHeight=image.naturalHeight;
 if(naturalRatio>ratio)baseWidth=baseHeight*ratio;else baseHeight=baseWidth/ratio;
 const sw=baseWidth/zoom,sh=baseHeight/zoom;
 const maxX=Math.max(0,image.naturalWidth-sw),maxY=Math.max(0,image.naturalHeight-sh);
 return {sx:maxX*(x+1)/2,sy:maxY*(y+1)/2,sw,sh,ratio};
}

export function MediaDraftPreview({file,onEdit,onRemove}:{file:File;onEdit:()=>void;onRemove:()=>void}){
 const url=useObjectUrl(file),video=file.type.startsWith("video/");
 return <div className="mediaDraftPreview">
  {url?(video?<video src={url} playsInline controls preload="metadata"/>:<img src={url} alt="Selected media preview"/>):<i className="mediaDraftLoading">Loading…</i>}
  <span><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(1)} MB · Ready to upload</small></span>
  <button type="button" onClick={onEdit}>{video?"Trim":"Crop"}</button>
  <button type="button" onClick={onRemove}>Remove</button>
 </div>;
}

export default function MediaEditor({file,onApply,onCancel}:{file:File;onApply:(file:File)=>void;onCancel:()=>void}){
 const url=useObjectUrl(file),image=file.type.startsWith("image/");
 const imageRef=useRef<HTMLImageElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),videoRef=useRef<HTMLVideoElement>(null);
 const [ratio,setRatio]=useState<number|null>(null),[ready,setReady]=useState(false),[zoom,setZoom]=useState(1),[x,setX]=useState(0),[y,setY]=useState(0);
 const [duration,setDuration]=useState(0),[start,setStart]=useState(0),[end,setEnd]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");

 const drawPreview=useCallback(()=>{
  const source=imageRef.current,canvas=canvasRef.current;
  if(!source?.naturalWidth||!canvas)return;
  const rect=cropRect(source,ratio,zoom,x,y),width=Math.min(1000,Math.max(320,Math.round(rect.sw)));
  canvas.width=width;canvas.height=Math.max(1,Math.round(width/rect.ratio));
  const context=canvas.getContext("2d");if(!context)return;
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
  context.clearRect(0,0,canvas.width,canvas.height);
  context.drawImage(source,rect.sx,rect.sy,rect.sw,rect.sh,0,0,canvas.width,canvas.height);
 },[ratio,zoom,x,y]);

 useEffect(()=>{if(ready)drawPreview()},[ready,drawPreview]);

 const chooseRatio=(value:number|null)=>{setRatio(value);setZoom(1);setX(0);setY(0)};
 const resetCrop=()=>{setRatio(null);setZoom(1);setX(0);setY(0)};

 const crop=async()=>{
  const source=imageRef.current;if(!source?.naturalWidth){setError("Image preview is still loading.");return}
  setBusy(true);setError("");
  try{
   const rect=cropRect(source,ratio,zoom,x,y),max=1920,width=Math.min(max,Math.max(1,Math.round(rect.sw))),height=Math.max(1,Math.round(width/rect.ratio));
   const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
   const context=canvas.getContext("2d");if(!context)throw Error("Image editor is unavailable.");
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
   context.drawImage(source,rect.sx,rect.sy,rect.sw,rect.sh,0,0,width,height);
   const type=file.type==="image/png"?"image/png":"image/jpeg";
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,.92));
   if(!blob)throw Error("Image could not be cropped.");
   onApply(new File([blob],outputName(file,type==="image/png"?"png":"jpg"),{type,lastModified:Date.now()}));
  }catch(reason){setError(reason instanceof Error?reason.message:"Image could not be cropped.")}finally{setBusy(false)}
 };

 const setVideoDuration=(video:HTMLVideoElement)=>{
  const value=video.duration;
  if(Number.isFinite(value)&&value>0){setDuration(value);setEnd(value);return}
  if(value===Infinity){video.currentTime=Number.MAX_SAFE_INTEGER;video.addEventListener("durationchange",()=>{const fixed=video.duration;if(Number.isFinite(fixed)){setDuration(fixed);setEnd(fixed);video.currentTime=0}},{once:true})}
 };

 const playSelection=async()=>{const video=videoRef.current;if(!video)return;video.currentTime=start;await video.play().catch(()=>setError("Preview could not play."))};

 const trim=async()=>{
  const video=videoRef.current;if(!video||!duration)return;
  if(start<=.05&&end>=duration-.05){onApply(file);return}
  const capture=(video as HTMLVideoElement&{captureStream?:()=>MediaStream}).captureStream;
  if(!capture){setError("This browser cannot export a trimmed video. Use Chrome/Edge or upload the original.");return}
  setBusy(true);setError("");
  let captured:MediaStream|null=null;
  try{
   video.pause();video.currentTime=start;
   await new Promise<void>(resolve=>{if(Math.abs(video.currentTime-start)<.12)return resolve();video.addEventListener("seeked",()=>resolve(),{once:true})});
   captured=capture.call(video);
   const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(value=>MediaRecorder.isTypeSupported(value))||"";
   const recorder=new MediaRecorder(captured,mime?{mimeType:mime}:undefined),chunks:Blob[]=[];
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
   const stopped=new Promise<void>((resolve,reject)=>{recorder.onstop=()=>resolve();recorder.onerror=()=>reject(Error("Video trim failed."))});
   recorder.start(250);await video.play();
   await new Promise<void>((resolve,reject)=>{const limit=window.setTimeout(()=>reject(Error("Video trim timed out.")),Math.max(8000,(end-start+4)*1000));const check=()=>{if(video.currentTime>=end||video.ended){window.clearTimeout(limit);video.removeEventListener("timeupdate",check);resolve()}};video.addEventListener("timeupdate",check)});
   video.pause();recorder.stop();await stopped;
   const blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"});if(!blob.size)throw Error("Trimmed video is empty.");
   onApply(new File([blob],outputName(file,"webm"),{type:blob.type,lastModified:Date.now()}));
  }catch(reason){setError(reason instanceof Error?reason.message:"Video could not be trimmed.")}finally{captured?.getTracks().forEach(track=>track.stop());setBusy(false)}
 };

 return <div className="mediaEditorBackdrop" role="dialog" aria-modal="true" aria-label="Edit media" onMouseDown={event=>event.target===event.currentTarget&&!busy&&onCancel()}>
  <section className="mediaEditor">
   <header><div><small>BEFORE YOU SEND</small><h2>{image?"Crop your photo":"Trim your video"}</h2><p>{image?"Choose a frame and move the focus exactly where you want it.":"Select the start and end, then preview the clip."}</p></div><button disabled={busy} onClick={onCancel} aria-label="Close media editor">×</button></header>
   {!url?<div className="mediaEditorLoading">Preparing preview…</div>:image?<>
    <div className="imageCropStage"><img className="mediaSourceImage" ref={imageRef} src={url} alt="" onLoad={()=>{setReady(true);requestAnimationFrame(drawPreview)}}/><canvas ref={canvasRef} aria-label="Crop preview"/></div>
    <div className="editorToolbar"><div className="ratioButtons">{RATIOS.map(item=><button type="button" className={ratio===item.value?"active":""} key={item.label} onClick={()=>chooseRatio(item.value)}>{item.label}</button>)}</div><button className="resetCrop" type="button" onClick={resetCrop}>Reset</button></div>
    <section className="cropControls"><label><span>Zoom <b>{zoom.toFixed(1)}×</b></span><input aria-label="Zoom" type="range" min="1" max="3" step=".05" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><label><span>Move left / right</span><input aria-label="Horizontal position" type="range" min="-1" max="1" step=".02" value={x} onChange={event=>setX(Number(event.target.value))}/></label><label><span>Move up / down</span><input aria-label="Vertical position" type="range" min="-1" max="1" step=".02" value={y} onChange={event=>setY(Number(event.target.value))}/></label></section>
   </>:<>
    <div className="videoEditStage"><video ref={videoRef} src={url} controls playsInline preload="metadata" onLoadedMetadata={event=>setVideoDuration(event.currentTarget)} onTimeUpdate={event=>{if(end&&event.currentTarget.currentTime>=end)event.currentTarget.pause()}}/></div>
    <div className="videoRangeSummary"><span><small>START</small><b>{formatTime(start)}</b></span><em>{Math.max(0,end-start).toFixed(1)} sec selected</em><span><small>END</small><b>{formatTime(end)}</b></span></div>
    <section className="trimControls"><label><span>Start point</span><input aria-label="Trim start" type="range" min="0" max={Math.max(0,end-.1)} step=".1" value={start} onChange={event=>{const value=Math.min(Number(event.target.value),end-.1);setStart(value);if(videoRef.current)videoRef.current.currentTime=value}}/></label><label><span>End point</span><input aria-label="Trim end" type="range" min={Math.min(duration,start+.1)} max={duration||1} step=".1" value={end} onChange={event=>{const value=Math.max(Number(event.target.value),start+.1);setEnd(value);if(videoRef.current)videoRef.current.currentTime=value}}/></label><button type="button" className="previewSelection" disabled={!duration||busy} onClick={()=>void playSelection()}>▶ Preview selection</button></section>
   </>}
   {error&&<p className="mediaEditorError" role="alert">{error}</p>}
   <footer><button disabled={busy} onClick={onCancel}>Cancel</button>{!image&&error&&<button disabled={busy} onClick={()=>onApply(file)}>Use original</button>}<button className="applyMedia" disabled={busy||(image?!ready:!duration)} onClick={()=>void(image?crop():trim())}>{busy?image?"Cropping…":"Creating clip…":image?"Use cropped photo":"Use trimmed video"}</button></footer>
  </section>
 </div>;
}
