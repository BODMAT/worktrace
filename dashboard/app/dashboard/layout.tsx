import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/server/cookies";
import { verifyJwt } from "@/server/jwt";
import { findUserById } from "@/server/users";
import { AppHeader } from "./app-header";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let userId: string;
  try {
    ({ sub: userId } = await verifyJwt(token));
  } catch {
    redirect("/login");
  }

  const user = await findUserById(userId);
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-text">
      <AppHeader email={user.email} name={user.name} picture={user.picture} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
