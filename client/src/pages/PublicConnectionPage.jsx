import { ConnectionPortal } from '../components/ConnectionPortal';

export function PublicConnectionPage({ onNavigate }) {
  return <ConnectionPortal activePage="connection" onNavigate={onNavigate} />;
}
