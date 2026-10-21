import { ShellNavIcon } from './shellIcons.jsx'

/**
 * Shared page banner: accessible page title (h1), tagline, description, nav icon, optional toolbar.
 * @param {'hero' | 'standard'} variant — hero: Dashboard & Analytics; standard: form-oriented pages
 */
function PageHeader({
  title,
  tagline,
  description,
  icon,
  variant = 'standard',
  titleId = 'section-title',
  children,
}) {
  return (
    <header className={`page-banner page-banner--${variant}`}>
      <div className="page-banner__row">
        <div className="page-banner__lead">
          <span className="page-banner__icon" aria-hidden="true">
            <ShellNavIcon name={icon} />
          </span>
          <div className="page-banner__copy">
            <h1 id={titleId} className="page-banner__title">
              {title}
            </h1>
            <p className="page-banner__tagline">{tagline}</p>
            {description ? <p className="page-banner__desc">{description}</p> : null}
          </div>
        </div>
        {children ? <div className="page-banner__aside">{children}</div> : null}
      </div>
    </header>
  )
}

export default PageHeader
