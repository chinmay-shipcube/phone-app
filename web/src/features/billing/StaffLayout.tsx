import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { KeyRound, LayoutDashboard, LogOut, ReceiptText, ShoppingCart } from 'lucide-react';
import type { Me } from '../../../../shared/types';
import { useLogout } from '../../lib/auth';
import { AppHeader, type MenuEntry } from '../../components/AppHeader';
import { ChangePinSheet } from './ChangePinSheet';

/** Billing screens for staff (and for the admin when they bill). */
export function StaffLayout({ me }: { me: Me }) {
  const logout = useLogout();
  const nav = useNavigate();
  const [pinOpen, setPinOpen] = useState(false);

  const menu: MenuEntry[] = [
    ...(me.role === 'admin' ? [{ label: 'Admin panel', icon: <LayoutDashboard size={18} />, onClick: () => nav('/admin') }] : []),
    ...(me.role === 'employee'
      ? [{ label: me.hasPin ? 'Change PIN' : 'Set a PIN', icon: <KeyRound size={18} />, onClick: () => setPinOpen(true) }]
      : []),
    { label: 'Log out', icon: <LogOut size={18} />, onClick: logout, danger: true },
  ];

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-semibold ${isActive ? 'border-brand-700 text-brand-800' : 'border-transparent text-neutral-500'}`;

  return (
    <div className="min-h-dvh bg-white">
      <AppHeader who={me.name} role={me.role === 'admin' ? 'Admin' : 'Billing'} menu={menu} />
      <nav className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-2xl">
          <NavLink to="/bill" end className={tab}>
            <ShoppingCart size={18} /> New bill
          </NavLink>
          <NavLink to="/bill/today" className={tab}>
            <ReceiptText size={18} /> My bills today
          </NavLink>
        </div>
      </nav>
      <Outlet />
      {me.role === 'employee' ? <ChangePinSheet me={me} open={pinOpen} onClose={() => setPinOpen(false)} /> : null}
    </div>
  );
}
