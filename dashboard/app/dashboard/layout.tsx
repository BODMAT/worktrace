import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";
import { AppHeader } from "./app-header";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-text">
      <AppHeader email={user.email} name={user.name} picture={user.picture} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
