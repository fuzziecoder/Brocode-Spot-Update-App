import {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../contexts/NotificationsContext";
import { ChatMessage } from "../types";
import { supabase } from "../services/supabase";

/* -------------------------------------------------------------------------- */
/* Types */
/* -------------------------------------------------------------------------- */

interface ChatContextType {
  messages: ChatMessage[];
  unreadCount: number;
  loading: boolean;
  sendMessage: (message: {
    content_text?: string | null;
    content_image_urls?: string[];
  }) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  setChatActive: (isActive: boolean) => void;
}

/* -------------------------------------------------------------------------- */
/* Context */
/* -------------------------------------------------------------------------- */

const ChatContext = createContext<ChatContextType | null>(null);

/* -------------------------------------------------------------------------- */
/* Storage key */
/* -------------------------------------------------------------------------- */

const CHAT_STORAGE_KEY = "brocode_chat_messages";

/* -------------------------------------------------------------------------- */
/* Provider */
/* -------------------------------------------------------------------------- */

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { notify } = useNotifications();

  /* ------------------------------------------------------------------------ */
  /* State */
  /* ------------------------------------------------------------------------ */

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatActive, setIsChatActive] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ------------------------------------------------------------------------ */
  /* Load messages */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('chat_messages')
          .select(`
            *,
            profiles:user_id (
              name,
              profile_pic_url
            )
          `)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const loadedMessages: ChatMessage[] = (data || []).map((msg: any) => ({
          id: msg.id,
          user_id: msg.user_id,
          content_text: msg.content_text,
          content_image_urls: msg.content_image_urls || [],
          created_at: msg.created_at,
          reactions: msg.reactions || {},
          profiles: {
            name: msg.profiles?.name || 'Unknown',
            profile_pic_url: msg.profiles?.profile_pic_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=default',
          },
        }));

        setMessages(loadedMessages);
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // Set up real-time subscription
    const channel = supabase
      .channel('chat-messages')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the new message with profile data
            const { data: newMsg } = await supabase
              .from('chat_messages')
              .select(`
                *,
                profiles:user_id (
                  name,
                  profile_pic_url
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (newMsg) {
              const chatMessage: ChatMessage = {
                id: newMsg.id,
                user_id: newMsg.user_id,
                content_text: newMsg.content_text,
                content_image_urls: newMsg.content_image_urls || [],
                created_at: newMsg.created_at,
                reactions: newMsg.reactions || {},
                profiles: {
                  name: newMsg.profiles?.name || 'Unknown',
                  profile_pic_url: newMsg.profiles?.profile_pic_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=default',
                },
              };
              setMessages((prev) => [...prev, chatMessage]);
            }
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Removed localStorage persistence - using Supabase now

  /* ------------------------------------------------------------------------ */
  /* Unread count logic */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!isChatActive && messages.length > 0) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [messages, isChatActive]);

  const setChatActive = (isActive: boolean) => {
    setIsChatActive(isActive);
    if (isActive) setUnreadCount(0);
  };

  /* ------------------------------------------------------------------------ */
  /* Helper function to get UUID from user ID */
  /* ------------------------------------------------------------------------ */

  const getUserIdAsUUID = async (profileId: string): Promise<string> => {
    if (!profile) {
      throw new Error('No user profile available');
    }

    // If it's already a UUID, return it
    if (profileId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return profileId;
    }

    // Otherwise, look it up in the database
    const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
    
    // Try to find user by phone, email, or username
    let dbProfile = null;
    
    if (cleanPhone) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', cleanPhone)
        .maybeSingle();
      if (!error && data) {
        dbProfile = data;
      }
    }
    
    if (!dbProfile && profile.email) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', profile.email)
        .maybeSingle();
      if (!error && data) {
        dbProfile = data;
      }
    }
    
    if (!dbProfile && profile.username) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', profile.username)
        .maybeSingle();
      if (!error && data) {
        dbProfile = data;
      }
    }

    // If found, return the UUID
    if (dbProfile) {
      return dbProfile.id;
    }

    // If not found, try to create the user profile in the database
    try {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          name: profile.name,
          username: profile.username,
          phone: cleanPhone || null,
          email: profile.email || null,
          password: profile.password || '',
          role: profile.role || 'user',
          profile_pic_url: profile.profile_pic_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=default',
          location: profile.location || 'Broville',
          is_verified: profile.isVerified || true,
        })
        .select('id')
        .single();

      if (createError) {
        // If creation fails (e.g., username already exists), try one more lookup
        const { data: finalLookup } = await supabase
          .from('profiles')
          .select('id')
          .or(`phone.eq.${cleanPhone},email.eq.${profile.email || ''},username.eq.${profile.username}`)
          .maybeSingle();
        
        if (finalLookup) {
          return finalLookup.id;
        }
        
        throw new Error(`Unable to create or find user profile: ${createError.message}`);
      }

      return newProfile.id;
    } catch (createErr: any) {
      throw new Error(`User profile not found in database and could not be created. Please ensure you are logged in with a valid account. Error: ${createErr.message}`);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Send message */
  /* ------------------------------------------------------------------------ */

  const sendMessage = async (messageData: {
    content_text?: string | null;
    content_image_urls?: string[];
  }) => {
    if (!user || !profile) throw new Error("User not found");

    try {
      // Get UUID for user ID
      const userId = await getUserIdAsUUID(user.id);

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: userId,
          content_text: messageData.content_text || null,
          content_image_urls: messageData.content_image_urls || null,
          reactions: {},
        })
        .select(`
          *,
          profiles:user_id (
            name,
            profile_pic_url
          )
        `)
        .single();

      if (error) throw error;

      // Message will be added via real-time subscription
      // But we can also add it immediately for better UX
      if (data) {
        const chatMessage: ChatMessage = {
          id: data.id,
          user_id: data.user_id,
          content_text: data.content_text,
          content_image_urls: data.content_image_urls || [],
          created_at: data.created_at,
          reactions: data.reactions || {},
          profiles: {
            name: data.profiles?.name || profile?.name || 'Unknown',
            profile_pic_url: data.profiles?.profile_pic_url || profile?.profile_pic_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=default',
          },
        };
        setMessages((prev) => [...prev, chatMessage]);
      }

      if (profile) {
        notify("New Message", `${profile.name} sent a message`);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Delete message */
  /* ------------------------------------------------------------------------ */

  const deleteMessage = async (messageId: string) => {
    if (!user || !profile) return;

    try {
      // Get UUID for user ID
      const userId = await getUserIdAsUUID(user.id);

      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', userId); // Only allow deleting own messages

      if (error) throw error;

      // Message will be removed via real-time subscription
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      if (profile) {
        notify("Message Deleted", `${profile.name} deleted a message`);
      }
    } catch (error) {
      console.error("Failed to delete message:", error);
      throw error;
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Add reaction */
  /* ------------------------------------------------------------------------ */

  const addReaction = async (messageId: string, emoji: string) => {
    if (!user || !profile) return;

    try {
      // Get UUID for user ID
      const userId = await getUserIdAsUUID(user.id);

      // Get current message to update reactions
      const currentMessage = messages.find(m => m.id === messageId);
      if (!currentMessage) return;

      const reactions = { ...(currentMessage.reactions || {}) };
      const users = reactions[emoji] ? [...reactions[emoji]] : [];

      const index = users.indexOf(userId);

      if (index > -1) {
        // Remove reaction
        users.splice(index, 1);
        users.length ? (reactions[emoji] = users) : delete reactions[emoji];
      } else {
        // Add reaction
        reactions[emoji] = [...users, userId];
      }

      // Update in database
      const { error } = await supabase
        .from('chat_messages')
        .update({ reactions })
        .eq('id', messageId);

      if (error) throw error;

      // Update local state
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          return { ...msg, reactions };
        })
      );

      if (profile) {
        notify("New Reaction", `${profile.name} reacted ${emoji}`);
      }
    } catch (error) {
      console.error("Failed to add reaction:", error);
      throw error;
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Value */
  /* ------------------------------------------------------------------------ */

  const value: ChatContextType = {
    messages,
    unreadCount,
    loading,
    sendMessage,
    addReaction,
    deleteMessage,
    setChatActive,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Hook */
/* -------------------------------------------------------------------------- */

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
