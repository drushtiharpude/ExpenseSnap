import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  dismissNotification,
  markNotificationRead,
  readNotificationStore,
  saveNotificationStore,
  unreadCount,
  visibleNotifications,
} from './notificationStore.js'
import { syncNotificationsFromFinanceData } from './notificationSync.js'

export function useNotificationCentre(dataRevision) {
  const [items, setItems] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)

  const refresh = useCallback(() => {
    const synced = syncNotificationsFromFinanceData()
    if (synced.items) {
      setItems(synced.items)
    } else {
      const stored = readNotificationStore()
      setItems(stored.ok ? stored.items : [])
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, dataRevision])

  const visible = useMemo(() => visibleNotifications(items), [items])
  const unread = useMemo(() => unreadCount(items), [items])

  const markRead = useCallback((id) => {
    setItems((current) => {
      const next = markNotificationRead(current, id)
      saveNotificationStore(next)
      return next
    })
  }, [])

  const dismiss = useCallback((id) => {
    setItems((current) => {
      const next = dismissNotification(current, id)
      saveNotificationStore(next)
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setItems((current) => {
      const now = new Date().toISOString()
      const next = current.map((item) =>
        !item.dismissedAt && !item.readAt ? { ...item, readAt: now } : item,
      )
      saveNotificationStore(next)
      return next
    })
  }, [])

  return {
    items: visible,
    unreadCount: unread,
    panelOpen,
    setPanelOpen,
    markRead,
    dismiss,
    markAllRead,
    refresh,
  }
}
