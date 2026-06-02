import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";
import { AppHeader } from "./app-header";
import { ParallaxBg } from "@/components/parallax-bg";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="relative flex min-h-full flex-1 flex-col text-text">
      <ParallaxBg />
      <AppHeader email={user.email} name={user.name} picture={user.picture} />
      <main className="relative z-1 flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="relative z-10 flex items-center justify-center border-t border-border bg-bg/95 px-6 py-3 backdrop-blur">
        <a
          href="https://github.com/BODMAT/worktrace/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold tracking-widest text-muted transition-colors hover:text-cyan"
        >
          GITHUB · RELEASES
        </a>
      </footer>
    </div>
  );
}
