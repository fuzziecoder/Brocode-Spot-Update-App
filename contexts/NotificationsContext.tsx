import {
  createContext,
  useState,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import { Notification } from "../types";
import { notificationService } from "../services/database";
import { supabase } from "../services/supabase";
import { useAuth } from "../hooks/useAuth";

/* -------------------------------------------------------------------------- */
/* Types */
/* -------------------------------------------------------------------------- */

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  notify: (title: string, message: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

/* -------------------------------------------------------------------------- */
/* Context */
/* -------------------------------------------------------------------------- */

const NotificationsContext =
  createContext<NotificationsContextType | null>(null);

/* -------------------------------------------------------------------------- */
/* Storage key */
/* -------------------------------------------------------------------------- */

const NOTIFICATIONS_STORAGE_KEY = "brocode_notifications";

/* -------------------------------------------------------------------------- */
/* Provider */
/* -------------------------------------------------------------------------- */

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  /* ------------------------------------------------------------------------ */
  /* Fetch notifications from database */
  /* ------------------------------------------------------------------------ */

  const fetchNotifications = useCallback(async () => {
    if (!user || !profile) {
      setLoading(false);
      return;
    }

    try {
      // Get UUID for user
      let userId = user.id;
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${profile.email || ''},phone.eq.${cleanPhone},username.eq.${profile.username || ''}`)
          .maybeSingle();
        if (dbProfile) {
          userId = dbProfile.id;
        }
      }

      const dbNotifications = await notificationService.getNotifications(userId);
      setNotifications(dbNotifications);
      
      // Also sync to localStorage for offline access
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(dbNotifications));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      // Fallback to localStorage if database fails
      const saved = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (saved) {
        setNotifications(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  /* ------------------------------------------------------------------------ */
  /* Set up real-time subscription */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!user || !profile) return;

    let channel: any = null;

    const setupSubscription = async () => {
      let userId = user.id;
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // Try to get UUID
        const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${profile.email || ''},phone.eq.${cleanPhone},username.eq.${profile.username || ''}`)
          .maybeSingle();
        if (dbProfile) {
          userId = dbProfile.id;
        } else {
          return; // Can't subscribe without UUID
        }
      }

      channel = notificationService.subscribeToNotifications(userId, () => {
        fetchNotifications();
      });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, profile, fetchNotifications]);

  /* ------------------------------------------------------------------------ */
  /* Create notification (for current user only - use notificationService.createNotificationForAllUsers for all users) */
  /* ------------------------------------------------------------------------ */

  const notify = async (title: string, message: string) => {
    if (!user || !profile) {
      // Fallback to localStorage if no user
      const newNotification: Notification = {
        id: crypto.randomUUID(),
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
      return;
    }

    try {
      // Get UUID for user
      let userId = user.id;
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${profile.email || ''},phone.eq.${cleanPhone},username.eq.${profile.username || ''}`)
          .maybeSingle();
        if (dbProfile) {
          userId = dbProfile.id;
        }
      }

      const newNotification = await notificationService.createNotification({
        user_id: userId,
        title,
        message,
      });

      setNotifications((prev) => [newNotification, ...prev]);
    } catch (error) {
      console.error('Error creating notification:', error);
      // Fallback to localStorage
      const newNotification: Notification = {
        id: crypto.randomUUID(),
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Fallback to local update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    if (!user || !profile) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return;
    }

    try {
      let userId = user.id;
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('id')
          .or(`email.eq.${profile.email || ''},phone.eq.${cleanPhone},username.eq.${profile.username || ''}`)
          .maybeSingle();
        if (dbProfile) {
          userId = dbProfile.id;
        }
      }

      await notificationService.markAllAsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value: NotificationsContextType = {
    notifications,
    unreadCount,
    notify,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook */
/* -------------------------------------------------------------------------- */

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider"
    );
  }
  return context;
}
