import { ConnectionPortal } from '../components/ConnectionPortal';

export function DocumentsPage({ onNavigate, pendingAccess, user }) {
  return <ConnectionPortal activePage="documents" onNavigate={onNavigate} pendingAccess={pendingAccess} user={user} />;
}
