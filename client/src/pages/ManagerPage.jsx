import { ManagerDashboard } from '../components/ManagerDashboard';

export function ManagerPage({ user, onLogout, onNavigate }) {
  return <ManagerDashboard mode="manager" user={user} onLogout={onLogout} onNavigate={onNavigate} />;
}
