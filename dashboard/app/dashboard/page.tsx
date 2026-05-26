import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/server/cookies";
import { verifyJwt } from "@/server/jwt";
import { LogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let email: string;
  try {
    ({ email } = await verifyJwt(token));
  } catch {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-black/[.08] bg-white p-10 dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Welcome to WorkTrace
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium text-black dark:text-zinc-50">{email}</span>
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
