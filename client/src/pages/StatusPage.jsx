import { ConnectionPortal } from '../components/ConnectionPortal';

export function StatusPage({ onNavigate, pendingAccess, user }) {
  return <ConnectionPortal activePage="status" onNavigate={onNavigate} pendingAccess={pendingAccess} user={user} />;
}
