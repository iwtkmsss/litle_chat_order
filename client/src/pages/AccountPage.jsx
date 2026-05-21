import { LoginScreen } from '../components/LoginScreen';

export function AccountPage({
  loginError,
  isLoggingIn,
  onLogin,
  onNavigate,
  pendingAccess,
  user,
}) {
  return (
    <LoginScreen
      error={loginError}
      isSubmitting={isLoggingIn}
      onNavigate={onNavigate}
      pendingAccess={pendingAccess}
      onSubmit={onLogin}
      user={user}
    />
  );
}
