import { ManagerDashboard } from '../components/ManagerDashboard';

export function AdminPage({ user, onLogout }) {
  return <ManagerDashboard mode="admin" user={user} onLogout={onLogout} />;
}
