import { Navigate, Route, Routes } from 'react-router-dom';
import { errorText } from './api/client';
import { useMe, useSessionWatcher } from './lib/auth';
import { Logo } from './components/Logo';
import { Button, Spinner } from './components/ui';
import { LoginPage } from './features/login/LoginPage';
import { AdminLoginPage } from './features/login/AdminLoginPage';
import { StaffLayout } from './features/billing/StaffLayout';
import { BillingPage } from './features/billing/BillingPage';
import { MyBillsPage } from './features/billing/MyBillsPage';
import { AdminLayout } from './features/admin/AdminLayout';
import { TodayPage } from './features/admin/TodayPage';
import { BillsPage } from './features/admin/BillsPage';
import { ReportsPage } from './features/admin/ReportsPage';
import { ItemsPage } from './features/admin/ItemsPage';
import { EmployeesPage } from './features/admin/EmployeesPage';
import { SettingsPage } from './features/admin/SettingsPage';

export function App() {
  useSessionWatcher();
  const me = useMe();

  if (me.isLoading)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 text-brand-700">
        <Logo size={48} />
        <Spinner />
      </div>
    );

  if (me.error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo size={44} />
        <p className="text-neutral-700">{errorText(me.error)}</p>
        <Button onClick={() => me.refetch()}>Try again</Button>
      </div>
    );

  const user = me.data;
  if (!user)
    return (
      <Routes>
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );

  return (
    <Routes>
      <Route path="/bill" element={<StaffLayout me={user} />}>
        <Route index element={<BillingPage />} />
        <Route path="today" element={<MyBillsPage />} />
      </Route>
      {user.role === 'admin' ? (
        <Route path="/admin" element={<AdminLayout me={user} />}>
          <Route index element={<TodayPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      ) : null}
      <Route path="*" element={<Navigate to={user.role === 'admin' ? '/admin' : '/bill'} replace />} />
    </Routes>
  );
}
