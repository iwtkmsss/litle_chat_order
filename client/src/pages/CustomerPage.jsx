import { UserWorkspace } from '../components/UserWorkspace';

export function CustomerPage({ user, onLogout }) {
  return <UserWorkspace user={user} onLogout={onLogout} />;
}
