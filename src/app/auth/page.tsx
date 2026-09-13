import AuthForm from "./AuthForm";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const params = await searchParams;
  const nextPage = params.next?.startsWith("/") ? params.next : "/dashboard";
  const initialMode = params.mode === "signup" || (!params.mode && nextPage !== "/dashboard") ? "signup" : "signin";
  return <AuthForm initialMode={initialMode} nextPage={nextPage} />;
}
