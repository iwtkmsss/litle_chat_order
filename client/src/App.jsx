import { useEffect, useState } from 'react';
import { api } from './api';
import { LoginScreen } from './components/LoginScreen';
import { ManagerDashboard } from './components/ManagerDashboard';
import { UserWorkspace } from './components/UserWorkspace';

export default function App() {
  const [user, setUser] = useState(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await api.getCurrentUser();

        if (!active) {
          return;
        }

        setUser(response.user);
      } catch (error) {
        if (!active) {
          return;
        }

        setLoginError(error.message);
      } finally {
        if (active) {
          setIsBooting(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(credentials) {
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await api.login(credentials);
      setUser(response.user);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setLoginError('');
  }

  if (isBooting) {
    return (
      <main className="app-shell splash-shell">
        <section className="surface-card splash-card">
          <h1>Завантаження</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        error={loginError}
        isSubmitting={isLoggingIn}
        onSubmit={handleLogin}
      />
    );
  }

  if (user.role === 'manager') {
    return <ManagerDashboard user={user} onLogout={handleLogout} />;
  }

  return <UserWorkspace user={user} onLogout={handleLogout} />;
}
