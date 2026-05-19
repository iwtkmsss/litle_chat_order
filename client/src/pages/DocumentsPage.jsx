import { ConnectionPortal } from '../components/ConnectionPortal';

export function DocumentsPage({ onNavigate }) {
  return <ConnectionPortal activePage="documents" onNavigate={onNavigate} />;
}
