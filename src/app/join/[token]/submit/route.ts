import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const origin = request.headers.get("referer") ? new URL(request.headers.get("referer")!).origin : `${request.headers.get("x-forwarded-proto") || "http"}://${request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host}`;
  const response = NextResponse.redirect(new URL(`/join/${token}`, origin), 303);
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/auth?next=${encodeURIComponent(`/join/${token}`)}`, origin), 303);
  const { data, error } = await client.rpc("join_workspace_by_invite", { invite_token: token });
  if (error || !data) return NextResponse.redirect(new URL(`/join/${token}?error=${encodeURIComponent(error?.message || "This invite could not be used.")}`, origin), 303);
  return NextResponse.redirect(new URL(`/workspace/${data}`, origin), 303);
}
