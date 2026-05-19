import { ManagerDashboard } from '../components/ManagerDashboard';

export function ManagerPage({ user, onLogout }) {
  return <ManagerDashboard mode="manager" user={user} onLogout={onLogout} />;
}
