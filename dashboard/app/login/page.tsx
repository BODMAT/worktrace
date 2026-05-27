import Script from "next/script";
import { GoogleLoginButton } from "./google-button";

export default function LoginPage() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="flex flex-1 items-center justify-center bg-bg">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-md border border-border bg-surface p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <span
              className="text-2xl text-cyan"
              style={{ filter: "drop-shadow(0 0 6px var(--c-cyan))" }}
            >
              ⬡
            </span>
            <span
              className="text-lg font-bold tracking-widest text-cyan"
              style={{ textShadow: "0 0 6px color-mix(in srgb, var(--c-cyan) 60%, transparent)" }}
            >
              WORKTRACE
            </span>
          </div>
          <p className="text-xs text-muted">
            Sign in with the same Google account you use in the extension.
          </p>
        </div>

        {clientId ? (
          <>
            <Script src="https://accounts.google.com/gsi/client?hl=en" strategy="afterInteractive" />
            <GoogleLoginButton clientId={clientId} />
          </>
        ) : (
          <p className="text-xs text-pink">
            NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.
          </p>
        )}
      </div>
    </main>
  );
}
