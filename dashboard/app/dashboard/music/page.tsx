import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";
import { MusicClient } from "./music-client";

export const metadata: Metadata = {
  title:       "Music Analytics",
  description: "Correlation between music listening and session activity.",
  robots:      { index: false, follow: false },
};

export default async function MusicPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <h1 className="text-base font-bold tracking-widest text-cyan">MUSIC ANALYTICS</h1>
      <MusicClient />
    </div>
  );
}
