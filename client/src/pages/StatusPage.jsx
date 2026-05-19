import { ConnectionPortal } from '../components/ConnectionPortal';

export function StatusPage({ onNavigate }) {
  return <ConnectionPortal activePage="status" onNavigate={onNavigate} />;
}
