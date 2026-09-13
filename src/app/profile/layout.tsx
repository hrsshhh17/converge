import { Suspense } from "react";
import ProfileMobileChrome from "./ProfileMobileChrome";

export default function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <Suspense fallback={null}><ProfileMobileChrome /></Suspense>
    {children}
  </>;
}
