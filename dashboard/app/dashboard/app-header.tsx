import { LogoutButton } from "./logout-button";
import { HeaderNav } from "./header-nav";
import { MobileNav } from "./mobile-nav";

type Props = {
  email:   string;
  name:    string | null;
  picture: string | null;
};

export function AppHeader({ email, name, picture }: Props) {
  const initial = (name ?? email).trim().charAt(0).toUpperCase() || "?";
  const displayName = name ?? email;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <span
            className="text-xl text-cyan"
            style={{ filter: "drop-shadow(0 0 4px var(--c-cyan))" }}
          >
            ⬡
          </span>
          <span
            className="text-sm font-bold tracking-widest text-cyan"
            style={{ textShadow: "0 0 6px color-mix(in srgb, var(--c-cyan) 60%, transparent)" }}
          >
            WORKTRACE
          </span>
        </div>
        <HeaderNav />
      </div>

      <div className="flex items-center gap-3">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full border border-border"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs font-bold text-purple">
            {initial}
          </span>
        )}
        <span
          className="hidden max-w-[200px] truncate text-xs text-muted sm:inline"
          title={displayName}
        >
          {displayName}
        </span>
        <LogoutButton />
        <MobileNav />
      </div>
    </header>
  );
}
