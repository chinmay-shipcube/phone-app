import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Logo } from './Logo';

export interface MenuEntry {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** Navy top bar with the logo, who is logged in, and a menu. */
export function AppHeader({ who, role, menu }: { who: string; role: string; menu: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <header className="safe-top sticky top-0 z-30 bg-brand-900 text-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Logo size={30} light />
        <div className="ml-auto min-w-0 text-right leading-tight">
          <p className="truncate text-[15px] font-bold">{who}</p>
          <p className="text-xs text-brand-200">{role}</p>
        </div>
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-xl p-2 hover:bg-brand-800"
            aria-label="Menu"
            aria-expanded={open}
          >
            <Menu size={22} />
          </button>
          {open ? (
            <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-1 text-ink shadow-xl">
              {menu.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    m.onClick();
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-brand-50 ${m.danger ? 'text-red-600' : ''}`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
