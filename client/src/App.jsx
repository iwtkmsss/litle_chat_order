import { useEffect, useState } from 'react';
import { api } from './api';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { CustomerPage } from './pages/CustomerPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ManagerPage } from './pages/ManagerPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicConnectionPage } from './pages/PublicConnectionPage';
import { StatusPage } from './pages/StatusPage';

const routes = new Map([
  ['/', { type: 'public', page: 'connection' }],
  ['/status', { type: 'public', page: 'status' }],
  ['/documents', { type: 'public', page: 'documents' }],
  ['/login', { type: 'auth' }],
  ['/account', { type: 'account' }],
  ['/customer', { type: 'protected', role: 'customer' }],
  ['/manager', { type: 'protected', role: 'manager' }],
  ['/admin', { type: 'protected', role: 'admin' }],
]);

function normalizePathname(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function getRoute() {
  const path = normalizePathname(window.location.pathname);
  const route = routes.get(path);

  return route ? { ...route, path } : { type: 'notFound', path };
}

function getCabinetPath(user) {
  if (user?.role === 'admin') {
    return '/admin';
  }

  if (user?.role === 'manager') {
    return '/manager';
  }

  return '/customer';
}

function canAccessProtectedRoute(user, routeRole) {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  return user.role === routeRole;
}

function LoadingShell() {
  return (
    <main className="app-shell splash-shell">
      <section className="surface-card splash-card">
        <h1>Завантаження</h1>
      </section>
    </main>
  );
}

function RedirectShell() {
  return (
    <main className="app-shell splash-shell">
      <section className="surface-card splash-card">
        <h1>Перенаправлення до кабінету</h1>
        <p className="muted-copy">
          Ця сторінка призначена для іншої ролі. Відкриваємо ваш робочий кабінет.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    function handlePopState() {
      setRoute(getRoute());
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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

        setUser(null);
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

  useEffect(() => {
    if (isBooting) {
      return;
    }

    if (!user) {
      if (route.type === 'protected') {
        navigate('/login', { replace: true });
      }

      return;
    }

    if (route.type === 'auth' || route.type === 'account') {
      navigate(getCabinetPath(user), { replace: true });
      return;
    }

    if (route.type === 'protected' && !canAccessProtectedRoute(user, route.role)) {
      navigate(getCabinetPath(user), { replace: true });
    }
  }, [isBooting, route.path, route.role, route.type, user]);

  async function handleLogin(credentials) {
    setIsLoggingIn(true);
    setLoginError('');
    setRegistrationError('');

    try {
      const response = await api.login(credentials);
      setUser(response.user);
      navigate(getCabinetPath(response.user), { replace: true });
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRegister(input) {
    setIsRegistering(true);
    setLoginError('');
    setRegistrationError('');

    try {
      const response = await api.registerCustomerApplication(input);
      setUser(response.user);
      navigate(getCabinetPath(response.user), { replace: true });
    } catch (error) {
      setRegistrationError(error.message);
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setLoginError('');
    setRegistrationError('');
    navigate('/login', { replace: true });
  }

  function navigate(path, { replace = false } = {}) {
    if (normalizePathname(window.location.pathname) !== path) {
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
    }

    setRoute(getRoute());
  }

  function renderAccountPage() {
    return (
      <AccountPage
        isLoggingIn={isLoggingIn}
        isRegistering={isRegistering}
        loginError={loginError}
        onLogin={handleLogin}
        onRegister={handleRegister}
        registrationError={registrationError}
      />
    );
  }

  if (route.type === 'public') {
    if (route.page === 'status') {
      return <StatusPage onNavigate={navigate} />;
    }

    if (route.page === 'documents') {
      return <DocumentsPage onNavigate={navigate} />;
    }

    return <PublicConnectionPage onNavigate={navigate} />;
  }

  if (isBooting) {
    return <LoadingShell />;
  }

  if (route.type === 'notFound') {
    return (
      <NotFoundPage
        cabinetPath={user ? getCabinetPath(user) : null}
        onNavigate={navigate}
        user={user}
      />
    );
  }

  if (!user) {
    return renderAccountPage();
  }

  if (route.type === 'auth' || route.type === 'account') {
    return <RedirectShell />;
  }

  if (route.type === 'protected' && !canAccessProtectedRoute(user, route.role)) {
    return <RedirectShell />;
  }

  if (user.role === 'admin') {
    return <AdminPage user={user} onLogout={handleLogout} />;
  }

  if (route.role === 'manager') {
    return <ManagerPage user={user} onLogout={handleLogout} />;
  }

  return <CustomerPage user={user} onLogout={handleLogout} />;
}
