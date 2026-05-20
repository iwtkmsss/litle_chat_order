import { ConnectionPortal } from '../components/ConnectionPortal';

export function PublicConnectionPage({ onNavigate, pendingAccess, user }) {
  return <ConnectionPortal activePage="connection" onNavigate={onNavigate} pendingAccess={pendingAccess} user={user} />;
}
