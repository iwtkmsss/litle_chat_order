import { ConnectionPortal } from '../components/ConnectionPortal';

export function StatusPage({ onNavigate, onPendingAccessChange, pendingAccess, user }) {
  return (
    <ConnectionPortal
      activePage="status"
      onNavigate={onNavigate}
      onPendingAccessChange={onPendingAccessChange}
      pendingAccess={pendingAccess}
      user={user}
    />
  );
}
