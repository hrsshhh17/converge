"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import "./onboarding.css";
import "./onboarding-profile.css";

const personalities = [
  ["Startup", "Move fast. Align and ship.", ["# product", "# engineering", "# growth"]],
  ["Student team", "Create, learn, and build together.", ["# projects", "# study-room", "# resources"]],
  ["Creative studio", "Make ideas visible, together.", ["# briefs", "# creative", "# feedback"]],
  ["Company", "A clear home for every team.", ["# general", "# projects", "# announcements"]],
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("Startup");
  const [privacy, setPrivacy] = useState("Invite only");
  const [profileName, setProfileName] = useState("");
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const supabase=createClient();
    void supabase.auth.getUser().then(({data:{user}})=>setProfileName(user?.user_metadata?.full_name||user?.email?.split("@")[0]||""));
  }, []);
  useEffect(()=>()=>{if(photoPreview)URL.revokeObjectURL(photoPreview)},[photoPreview]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"smooth"})},[step]);
  const choosePhoto=(file?:File)=>{if(!file){setProfilePhoto(null);setPhotoPreview(null);return}setProfilePhoto(file);setPhotoPreview(URL.createObjectURL(file))};

  async function createWorkspace(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    const workspaceName = name.trim();
    const { data: workspace, error } = await supabase.from("workspaces").insert({ name: workspaceName, owner_id: user.id, personality, privacy }).select().single();
    if (error || !workspace) { setLoading(false); setMessage(error?.message ?? "Could not create workspace."); return; }
    const {error:memberError}=await supabase.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });
    if(memberError){setLoading(false);setMessage(memberError.message);return}
    await supabase.from("channels").insert({ workspace_id: workspace.id, name: workspaceName, kind: "group", is_workspace_group: true });
    let avatarUrl:string|null=null;
    if(profilePhoto){const ext=profilePhoto.name.split(".").pop()||"jpg",path=`${user.id}/${workspace.id}/avatar-${Date.now()}.${ext}`;const{error:uploadError}=await supabase.storage.from("avatars").upload(path,profilePhoto,{upsert:true,contentType:profilePhoto.type});if(!uploadError)avatarUrl=supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}
    const profile={workspace_id:workspace.id,id:user.id,full_name:profileName.trim(),bio:bio.trim()||null,...(avatarUrl?{avatar_url:avatarUrl}:{})};
    const{error:profileError}=await supabase.from("workspace_profiles").upsert(profile,{onConflict:"workspace_id,id"});
    if(profileError){setLoading(false);setMessage(`Workspace created, but your profile could not be saved: ${profileError.message}`);return}
    router.push(`/workspace/${workspace.id}`); router.refresh();
  }

  return <main className="onboardPage"><header><Link href="/" className="onboardBrand"><span>oo</span> CONVERGE</Link><p>Step {step} of 4</p></header><div className="progress"><i style={{ width: `${step / 4 * 100}%` }}/></div><form className="onboardBody" onSubmit={createWorkspace}>
    {step === 1 && <section><p className="stepNo">01</p><h1>Name the place<br/>your team will <em>converge.</em></h1><p>Start with a workspace name. You can refine every detail later.</p><label>Workspace name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Orbit Studio" autoFocus required /></label><button type="button" onClick={() => name.trim() && setStep(2)}>Continue</button></section>}
    {step === 2 && <section><p className="stepNo">02</p><h1>Choose your<br/>team&apos;s <em>rhythm.</em></h1><p>We will set up a thoughtful starting space around this choice.</p><div className="personalityGrid">{personalities.map(([title, description, channels]) => <button type="button" className={personality === title ? "chosen" : ""} onClick={() => setPersonality(title)} key={title}><b>{title}</b><span>{description}</span><small>{channels.join(" ")}</small></button>)}</div><div className="stepActions"><button type="button" className="back" onClick={() => setStep(1)}>Back</button><button type="button" onClick={() => setStep(3)}>Continue</button></div></section>}
    {step === 3 && <section><p className="stepNo">03</p><h1>Make it feel<br/>like <em>yours.</em></h1><p>Choose who can find your workspace. Invitations can be sent from your dashboard.</p><div className="privacyOptions">{["Invite only", "Anyone with a link"].map((item) => <button type="button" key={item} className={privacy === item ? "chosen" : ""} onClick={() => setPrivacy(item)}><b>{item}</b><span>{item === "Invite only" ? "Private by default. Members join through an invitation." : "Useful for classrooms, clubs, and project groups."}</span></button>)}</div><div className="stepActions"><button type="button" className="back" onClick={() => setStep(2)}>Back</button><button type="button" onClick={()=>setStep(4)}>Continue</button></div></section>}
    {step === 4 && <section className="profileSetup"><p className="stepNo">04</p><h1>Introduce<br/><em>yourself.</em></h1><p>Your name appears across chats, posts and member lists. Bio and photo are optional.</p><div className="profileSetupGrid"><label className="photoPicker"><span>{photoPreview?<img src={photoPreview} alt="Profile preview"/>:(profileName.trim()[0]||"Y").toUpperCase()}</span><b>{profilePhoto?"Change photo":"Add profile photo"}</b><small>Optional · JPG, PNG or WEBP</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>choosePhoto(event.target.files?.[0])}/></label><div><label>Username<input value={profileName} onChange={event=>setProfileName(event.target.value)} placeholder="Your name" maxLength={60} required/></label><label>Bio <small>Optional</small><textarea value={bio} onChange={event=>setBio(event.target.value)} placeholder="Tell your team a little about yourself…" maxLength={150}/></label><small className="bioCount">{bio.length}/150</small></div></div>{message&&<p className="onboardMessage">{message}</p>}<div className="stepActions"><button type="button" className="back" onClick={()=>setStep(3)}>Back</button><button disabled={loading||!profileName.trim()}>{loading?"Creating…":"Create workspace →"}</button></div></section>}
  </form></main>;
}
