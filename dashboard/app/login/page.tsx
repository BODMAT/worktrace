import Script from "next/script";
import { GoogleLoginButton } from "./google-button";

export default function LoginPage() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-black/[.08] bg-white p-10 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Sign in to WorkTrace
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Continue with the same Google account you use in the extension.
          </p>
        </div>

        {clientId ? (
          <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
            <GoogleLoginButton clientId={clientId} />
          </>
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.
          </p>
        )}
      </div>
    </main>
  );
}
