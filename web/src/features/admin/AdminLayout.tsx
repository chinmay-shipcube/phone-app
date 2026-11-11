import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, KeyRound, LogOut, ReceiptText, Settings, ShoppingCart, Sun, Users } from 'lucide-react';
import type { Me } from '../../../../shared/types';
import { useLogout } from '../../lib/auth';
import { AppHeader } from '../../components/AppHeader';
import { ChangePasswordSheet } from './ChangePasswordSheet';

const tabs = [
  { to: '/admin', label: 'Today', icon: Sun, end: true },
  { to: '/admin/bills', label: 'Bills', icon: ReceiptText },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/items', label: 'Items', icon: Boxes },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ me }: { me: Me }) {
  const logout = useLogout();
  const nav = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-neutral-50">
      <AppHeader
        who={me.name}
        role="Admin panel"
        menu={[
          { label: 'New bill', icon: <ShoppingCart size={18} />, onClick: () => nav('/bill') },
          { label: 'Change password', icon: <KeyRound size={18} />, onClick: () => setPwOpen(true) },
          { label: 'Log out', icon: <LogOut size={18} />, onClick: logout, danger: true },
        ]}
      />
      <nav className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl overflow-x-auto px-2 [scrollbar-width:none]">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold ${isActive ? 'border-brand-700 text-brand-800' : 'border-transparent text-neutral-500'}`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
