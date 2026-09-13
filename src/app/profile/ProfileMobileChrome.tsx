"use client";

import { useSearchParams } from "next/navigation";
import MobileWorkspaceChrome from "../components/MobileWorkspaceChrome";

export default function ProfileMobileChrome() {
  const workspaceId = useSearchParams().get("workspace");
  return workspaceId ? <MobileWorkspaceChrome workspaceId={workspaceId} /> : null;
}
