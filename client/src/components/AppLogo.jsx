import logoUrl from '../assets/logo.svg';

export function AppLogo({
  className = '',
  compact = false,
  onClick,
}) {
  const logoClassName = ['app-logo', compact ? 'app-logo--compact' : '', className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <span className="app-logo__mark" aria-hidden="true">
      <img alt="" className="app-logo__image" src={logoUrl} />
    </span>
  );

  if (onClick) {
    return (
      <button
        aria-label="На головну"
        className={`${logoClassName} app-logo--button`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className={logoClassName}>{content}</div>;
}
