"use client";

export function startRingtone(){
  let context:AudioContext|null=null;let timer:number|null=null;let stopped=false;
  const ring=async()=>{if(stopped)return;context ||= new AudioContext();await context.resume();[0,0.22].forEach(delay=>{const oscillator=context!.createOscillator();const gain=context!.createGain();oscillator.type="sine";oscillator.frequency.value=880;gain.gain.setValueAtTime(0.0001,context!.currentTime+delay);gain.gain.exponentialRampToValueAtTime(0.16,context!.currentTime+delay+.02);gain.gain.exponentialRampToValueAtTime(0.0001,context!.currentTime+delay+.16);oscillator.connect(gain).connect(context!.destination);oscillator.start(context!.currentTime+delay);oscillator.stop(context!.currentTime+delay+.18)});timer=window.setTimeout(ring,1450)};
  void ring().catch(()=>{});
  return()=>{stopped=true;if(timer!==null)window.clearTimeout(timer);void context?.close()};
}

export function callDuration(ms:number){const seconds=Math.max(0,Math.round(ms/1000));const minutes=Math.floor(seconds/60);const rest=seconds%60;return `${String(minutes).padStart(2,"0")}:${String(rest).padStart(2,"0")}`}
