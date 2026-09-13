const stunServers:RTCIceServer[]=[
 {urls:"stun:stun.l.google.com:19302"},
 {urls:"stun:stun1.l.google.com:19302"},
];

export function getIceServers():RTCIceServer[]{
 const urls=(process.env.NEXT_PUBLIC_TURN_URLS||"").split(",").map(value=>value.trim()).filter(Boolean);
 const username=process.env.NEXT_PUBLIC_TURN_USERNAME||"";
 const credential=process.env.NEXT_PUBLIC_TURN_CREDENTIAL||"";
 return urls.length&&username&&credential?[...stunServers,{urls,username,credential}]:stunServers;
}

export function attachRemoteTrack(stream:MediaStream,event:RTCTrackEvent){
 const incoming=event.streams[0];
 if(incoming){for(const track of incoming.getTracks())if(!stream.getTrackById(track.id))stream.addTrack(track)}
 else if(!stream.getTrackById(event.track.id))stream.addTrack(event.track);
}
