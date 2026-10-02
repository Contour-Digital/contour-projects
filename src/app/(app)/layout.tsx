import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/Sidebar";
import { SignOutButton } from "@/components/nav/SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isTeam } = await supabase.rpc("is_team_member");
  if (!isTeam) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md space-y-3 p-6 text-sm">
          <h1 className="text-lg font-semibold">This account isn&apos;t on the team yet</h1>
          <p className="text-slate-600">
            {user.email} is signed in but isn&apos;t listed in <code>team_members</code>. Add it in the Supabase SQL editor:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">
            insert into team_members (email) values (&apos;{user.email?.toLowerCase()}&apos;);
          </pre>
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="px-4 pb-24 pt-6 md:ml-60 md:px-8 md:pb-10">{children}</main>
    </div>
  );
}
