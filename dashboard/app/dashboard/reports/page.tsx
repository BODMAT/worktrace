import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/current-user";
import { ReportForm } from "./report-form";

export const metadata: Metadata = {
  title:       "Reports",
  description: "Generate an AI-summarized session report from your captured events and music.",
  robots:      { index: false, follow: false },
};

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-widest text-cyan">AI SESSION REPORT</h1>
      </div>
      <ReportForm />
    </div>
  );
}
