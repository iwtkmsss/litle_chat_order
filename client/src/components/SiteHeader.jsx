import { useState } from 'react';
import { AppLogo } from './AppLogo';

function getCabinetPath(user) {
  if (user?.role === 'admin') {
    return '/admin';
  }

  if (user?.role === 'manager') {
    return '/manager';
  }

  return '/customer';
}

function getAccessAction(user, pendingAccess) {
  if (user) {
    return {
      id: 'cabinet',
      label: 'Особистий кабінет',
      path: getCabinetPath(user),
    };
  }

  if (pendingAccess) {
    return {
      id: 'pending',
      label: 'Моя заява',
      path: pendingAccess.path || '/application-access/session',
    };
  }

  return {
    id: 'login',
    label: 'Вхід',
    path: '/login',
  };
}

const baseNavItems = [
  { id: 'home', label: 'Головна', path: '/' },
  { id: 'apply', label: 'Подати заяву', path: '/apply' },
  { id: 'status', label: 'Перевірити заяву', path: '/status' },
  { id: 'documents', label: 'Документи', path: '/documents' },
];

export function SiteHeader({
  activePath = '/',
  className = '',
  onNavigate,
  pendingAccess,
  user,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accessAction = getAccessAction(user, pendingAccess);
  const navItems = [...baseNavItems, accessAction];

  function navigate(path) {
    setIsMenuOpen(false);
    onNavigate?.(path);
  }

  return (
    <header className={['site-header', className].filter(Boolean).join(' ')}>
      <div className="site-header__inner">
        <AppLogo onClick={() => navigate('/')} />

        <nav className="site-header__nav" aria-label="Основна навігація">
          {baseNavItems.map((item) => (
            <button
              className={activePath === item.path ? 'site-header__link is-active' : 'site-header__link'}
              key={item.id}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className={user ? 'site-header__access site-header__access--cabinet' : 'site-header__access'}
          onClick={() => navigate(accessAction.path)}
          type="button"
        >
          {accessAction.label}
        </button>

        <button
          aria-expanded={isMenuOpen}
          aria-label="Відкрити меню"
          className="site-header__burger"
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {isMenuOpen ? (
        <nav className="site-header__mobile-menu" aria-label="Мобільна навігація">
          {navItems.map((item) => (
            <button
              className={activePath === item.path ? 'site-header__mobile-link is-active' : 'site-header__mobile-link'}
              key={item.id}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
