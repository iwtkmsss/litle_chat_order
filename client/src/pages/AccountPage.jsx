import { LoginScreen } from '../components/LoginScreen';

export function AccountPage({
  loginError,
  registrationError,
  isLoggingIn,
  isRegistering,
  onLogin,
  onRegister,
}) {
  return (
    <LoginScreen
      error={loginError}
      isRegistering={isRegistering}
      isSubmitting={isLoggingIn}
      onRegister={onRegister}
      onSubmit={onLogin}
      registrationError={registrationError}
    />
  );
}
