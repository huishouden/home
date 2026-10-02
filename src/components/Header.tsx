import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

export interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  tab: string;
  onTab: (id: string) => void;
  /** Undefined while the session is being restored: show neither the avatar nor Sign in. */
  user: User | null | undefined;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn?: boolean;
}

/** The Huishouden frame: family logo back to the portal, suite name over the app name, the avatar. */
export function Header({ tabs, tab, onTab, user, onSignIn, onSignOut, signingIn }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <a href="https://huishouden-piekstra.web.app" className="flex items-center gap-2.5 rounded-xl" aria-label="Huishouden home">
          <img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="text-xs font-medium text-stone-600">Huishouden</p>
            <h1 className="text-lg leading-tight font-bold tracking-tight text-forest-700">Home</h1>
          </div>
        </a>

        {tabs.length > 0 && (
          <nav aria-label="Sections" className="order-3 flex w-full gap-0.5 overflow-x-auto sm:gap-1 rounded-2xl border border-stone-200 bg-white p-1 sm:order-none sm:w-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                aria-current={t.id === tab ? 'page' : undefined}
                className={`min-h-11 flex-1 rounded-xl px-1 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:flex-none sm:px-5 sm:text-base ${
                  t.id === tab ? 'bg-forest-700 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {user === undefined ? null : user ? (
            <AccountMenu user={user} onSignOut={onSignOut} />
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 font-medium text-white hover:bg-forest-600 disabled:opacity-60"
            >
              {signingIn ? 'Opening Google' : 'Sign in with Google'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const initial = (user.displayName ?? user.email ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="hh-avatar"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Signed in as ${user.email ?? 'you'}`}
        title={user.email ?? ''}
        onClick={() => setOpen((o) => !o)}
      >
        {user.photoURL && !photoFailed ? (
          // Google profile photos refuse requests that carry a referrer from another site.
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
        ) : (
          <span>{initial}</span>
        )}
      </button>
      {open && (
        <div className="absolute top-14 right-0 z-40 w-64 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg">
          <p className="text-sm break-words text-stone-600">{user.email}</p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-3 font-medium text-forest-700 hover:bg-forest-50"
          >
            Sign out
          </button>
          <p className="mt-2 text-xs text-stone-600">
            Huishouden Home {import.meta.env.VITE_APP_VERSION} ({import.meta.env.VITE_BUILD_SHA})
          </p>
        </div>
      )}
    </div>
  );
}
