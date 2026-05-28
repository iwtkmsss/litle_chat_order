import { ManagerDashboard } from '../components/ManagerDashboard';

export function AdminPage({ user, onLogout, onNavigate }) {
  return <ManagerDashboard mode="admin" user={user} onLogout={onLogout} onNavigate={onNavigate} />;
}
