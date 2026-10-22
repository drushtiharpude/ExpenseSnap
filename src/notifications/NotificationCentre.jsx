import { useEffect, useId, useRef } from 'react'
import { ShellNavIcon } from '../ui/shellIcons.jsx'
import './notificationCentre.css'

function formatNotificationDate(iso) {
  if (typeof iso !== 'string') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function NotificationCentre({
  items,
  unreadCount,
  panelOpen,
  onTogglePanel,
  onClosePanel,
  onMarkRead,
  onDismiss,
  onMarkAllRead,
}) {
  const panelId = useId()
  const buttonRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!panelOpen) return undefined
    function onPointerDown(event) {
      const panel = panelRef.current
      const button = buttonRef.current
      if (!panel || !button) return
      if (panel.contains(event.target) || button.contains(event.target)) return
      onClosePanel()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') onClosePanel()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [panelOpen, onClosePanel])

  return (
    <div className="notification-centre">
      <button
        ref={buttonRef}
        type="button"
        className="notification-centre__bell"
        aria-expanded={panelOpen}
        aria-controls={panelId}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications, no unread'
        }
        onClick={onTogglePanel}
      >
        <ShellNavIcon name="bell" />
        {unreadCount > 0 ? (
          <span className="notification-centre__badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {panelOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          className="notification-centre__panel"
          role="region"
          aria-label="Notifications"
        >
          <header className="notification-centre__head">
            <h2 className="notification-centre__title">Notifications</h2>
            {unreadCount > 0 ? (
              <button type="button" className="notification-centre__mark-all" onClick={onMarkAllRead}>
                Mark all read
              </button>
            ) : null}
          </header>

          {items.length === 0 ? (
            <p className="notification-centre__empty" role="status">
              You are all caught up. Bill reminders and budget alerts will appear here.
            </p>
          ) : (
            <ul className="notification-centre__list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`notification-centre__item${item.readAt ? '' : ' notification-centre__item--unread'}`}
                >
                  <div className="notification-centre__item-body">
                    <p className="notification-centre__item-title">{item.title}</p>
                    <p className="notification-centre__item-message">{item.message}</p>
                    <p className="notification-centre__item-date">{formatNotificationDate(item.createdAt)}</p>
                  </div>
                  <div className="notification-centre__item-actions">
                    {!item.readAt ? (
                      <button
                        type="button"
                        className="notification-centre__action"
                        onClick={() => onMarkRead(item.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="notification-centre__action"
                      onClick={() => onDismiss(item.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
