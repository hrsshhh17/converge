import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const data = await request.formData(); const mode = data.get("mode") === "signup" ? "signup" : "signin"; const next = typeof data.get("next") === "string" && String(data.get("next")).startsWith("/") ? String(data.get("next")) : "/dashboard";
  const origin = request.headers.get("referer") ? new URL(request.headers.get("referer")!).origin : `${request.headers.get("x-forwarded-proto") || "http"}://${request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host}`;
  const response = NextResponse.redirect(new URL(next, origin), 303);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const email = String(data.get("email") || ""); const password = String(data.get("password") || "");
  const result = mode === "signup" ? await supabase.auth.signUp({ email, password, options: { data: { full_name: String(data.get("name") || "") } } }) : await supabase.auth.signInWithPassword({ email, password });
  if (result.error || (mode === "signup" && !result.data.session)) { const url = new URL("/auth", origin); url.searchParams.set("mode", mode); if (next !== "/dashboard") url.searchParams.set("next", next); url.searchParams.set("error", result.error?.message || "Check your email to confirm your account, then sign in."); return NextResponse.redirect(url, 303); }
  return response;
}
