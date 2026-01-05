import { supabase } from './supabase';
import { Spot, Invitation, Payment, InvitationStatus, PaymentStatus, UserProfile, Drink, Attendance, Cigarette, Food, Notification, DrinkBrand, UserDrinkSelection } from '../types';

/* -------------------------------------------------------------------------- */
/* SPOTS */
/* -------------------------------------------------------------------------- */

export const spotService = {
  // Get upcoming spot (date >= today)
  async getUpcomingSpot(): Promise<Spot | null> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found - this is okay
        return null;
      }
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        throw new Error('Database tables not found. Please run the SQL migration in Supabase SQL Editor. See supabase_migration.sql file.');
      }
      console.error('Error fetching upcoming spot:', error);
      throw error;
    }

    return data || null;
  },

  // Get all upcoming spots
  async getUpcomingSpots(): Promise<Spot[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming spots:', error);
      throw error;
    }

    return data || [];
  },

  // Get past spots (date < today)
  async getPastSpots(): Promise<Spot[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .lt('date', today)
      .order('date', { ascending: false });

    if (error) {
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        throw new Error('Database tables not found. Please run the SQL migration in Supabase SQL Editor. See supabase_migration.sql file.');
      }
      console.error('Error fetching past spots:', error);
      throw error;
    }

    return data || [];
  },

  // Create a new spot
  async createSpot(spotData: Omit<Spot, 'id' | 'members'>): Promise<Spot> {
    // Convert date to ISO string if it's not already
    let dateValue = spotData.date;
    if (typeof dateValue === 'string' && !dateValue.includes('T')) {
      // If it's just a date (YYYY-MM-DD), add time
      dateValue = `${dateValue}T${spotData.timing}:00`;
    }
    
    const { data, error } = await supabase
      .from('spots')
      .insert({
        date: dateValue,
        day: spotData.day,
        timing: spotData.timing,
        budget: spotData.budget,
        location: spotData.location,
        created_by: spotData.created_by,
        description: spotData.description || '',
        feedback: spotData.feedback || '',
        latitude: spotData.latitude,
        longitude: spotData.longitude,
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        throw new Error('Database tables not found. Please run the SQL migration in Supabase SQL Editor. See supabase_migration.sql file.');
      }
      if (error.message?.includes('foreign key') || error.message?.includes('created_by')) {
        throw new Error('Invalid user ID. Please make sure you are logged in with a valid user account.');
      }
      console.error('Error creating spot:', error);
      throw new Error(`Failed to create spot: ${error.message}`);
    }

    return data;
  },

  // Update a spot (admin only)
  async updateSpot(spotId: string, updates: Partial<Spot>): Promise<Spot> {
    const { data, error } = await supabase
      .from('spots')
      .update(updates)
      .eq('id', spotId)
      .select()
      .single();

    if (error) {
      console.error('Error updating spot:', error);
      throw error;
    }

    return data;
  },

  // Delete a spot (admin only)
  async deleteSpot(spotId: string): Promise<void> {
    const { error } = await supabase
      .from('spots')
      .delete()
      .eq('id', spotId);

    if (error) {
      console.error('Error deleting spot:', error);
      throw error;
    }
  },

  // Subscribe to real-time spot updates
  subscribeToSpots(callback: (payload: any) => void) {
    return supabase
      .channel('spots-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'spots' },
        callback
      )
      .subscribe();
  },
};

/* -------------------------------------------------------------------------- */
/* INVITATIONS */
/* -------------------------------------------------------------------------- */

export const invitationService = {
  // Get invitations for a spot
  async getInvitations(spotId: string): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          phone,
          email,
          role,
          profile_pic_url,
          location
        )
      `)
      .eq('spot_id', spotId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching invitations:', error);
      throw error;
    }

    // Transform the data to match Invitation type
    return data.map((inv: any) => ({
      id: inv.id,
      spot_id: inv.spot_id,
      user_id: inv.user_id,
      profiles: inv.profiles,
      status: inv.status as InvitationStatus,
    }));
  },

  // Create or update invitation
  async upsertInvitation(invitationData: {
    spot_id: string;
    user_id: string;
    status: InvitationStatus;
  }): Promise<Invitation> {
    const { data, error } = await supabase
      .from('invitations')
      .upsert({
        spot_id: invitationData.spot_id,
        user_id: invitationData.user_id,
        status: invitationData.status,
      }, {
        onConflict: 'spot_id,user_id'
      })
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          phone,
          email,
          role,
          profile_pic_url,
          location
        )
      `)
      .single();

    if (error) {
      console.error('Error upserting invitation:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      user_id: data.user_id,
      profiles: data.profiles,
      status: data.status as InvitationStatus,
    };
  },

  // Update invitation status
  async updateInvitationStatus(
    invitationId: string,
    status: InvitationStatus
  ): Promise<void> {
    const { error } = await supabase
      .from('invitations')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);

    if (error) {
      console.error('Error updating invitation status:', error);
      throw new Error(`Failed to update RSVP: ${error.message}`);
    }
  },

  // Subscribe to real-time invitation updates
  subscribeToInvitations(spotId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`invitations-${spotId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitations',
          filter: `spot_id=eq.${spotId}`,
        },
        callback
      )
      .subscribe();
  },
};

/* -------------------------------------------------------------------------- */
/* PAYMENTS */
/* -------------------------------------------------------------------------- */

export const paymentService = {
  // Get payments for a spot
  async getPayments(spotId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          phone,
          email,
          role,
          profile_pic_url,
          location
        )
      `)
      .eq('spot_id', spotId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }

    return data.map((pay: any) => ({
      id: pay.id,
      spot_id: pay.spot_id,
      user_id: pay.user_id,
      profiles: pay.profiles,
      status: pay.status as PaymentStatus,
    }));
  },

  // Create or update payment
  async upsertPayment(paymentData: {
    spot_id: string;
    user_id: string;
    status: PaymentStatus;
  }): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .upsert({
        spot_id: paymentData.spot_id,
        user_id: paymentData.user_id,
        status: paymentData.status,
      }, {
        onConflict: 'spot_id,user_id'
      })
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          phone,
          email,
          role,
          profile_pic_url,
          location
        )
      `)
      .single();

    if (error) {
      console.error('Error upserting payment:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      user_id: data.user_id,
      profiles: data.profiles,
      status: data.status as PaymentStatus,
    };
  },

  // Update payment status
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus
  ): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ status })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  },

  // Subscribe to real-time payment updates
  subscribeToPayments(spotId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`payments-${spotId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `spot_id=eq.${spotId}`,
        },
        callback
      )
      .subscribe();
  },
};

/* -------------------------------------------------------------------------- */
/* PROFILES */
/* -------------------------------------------------------------------------- */

export const profileService = {
  // Check if username is unique
  async isUsernameUnique(username: string, excludeUserId?: string): Promise<boolean> {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('username', username);

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking username uniqueness:', error);
      throw error;
    }

    return !data || data.length === 0;
  },

  // Get profile by ID
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
      throw error;
    }

    return data || null;
  },

  // Update profile
  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }

    return data;
  },

  // Create new profile
  async createProfile(profileData: {
    name: string;
    username: string;
    phone: string;
    email?: string;
    password: string;
    profile_pic_url?: string;
    role?: string;
  }): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        name: profileData.name,
        username: profileData.username,
        phone: profileData.phone,
        email: profileData.email,
        password: profileData.password,
        profile_pic_url: profileData.profile_pic_url || 'https://api.dicebear.com/7.x/thumbs/svg?seed=default',
        role: profileData.role || 'user',
        location: 'Broville',
        is_verified: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      throw error;
    }

    return data;
  },
};

/* -------------------------------------------------------------------------- */
/* DRINKS */
/* -------------------------------------------------------------------------- */

export const drinkService = {
  // Get drinks for a spot
  async getDrinks(spotId: string): Promise<Drink[]> {
    try {
      const { data, error } = await supabase
        .from('drinks')
        .select(`
          *,
          profiles:suggested_by (
            name
          )
        `)
        .eq('spot_id', spotId)
        .order('votes', { ascending: false });

      if (error) {
        console.error('Error fetching drinks:', error);
        // If table doesn't exist, return empty array instead of throwing
        if (error.message?.includes('does not exist') || 
            error.message?.includes('relation') ||
            error.code === '42P01') {
          return [];
        }
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((drink: any) => ({
        id: drink.id,
        spot_id: drink.spot_id,
        name: drink.name,
        image_url: drink.image_url || '',
        votes: drink.votes || 0,
        suggested_by: drink.suggested_by,
        voted_by: drink.voted_by || [],
        price: drink.price || undefined,
        profiles: drink.profiles || null,
      }));
    } catch (err: any) {
      console.error('Error in getDrinks:', err);
      // If it's a table not found error, return empty array
      if (err.message?.includes('does not exist') || 
          err.message?.includes('relation') ||
          err.code === '42P01') {
        return [];
      }
      throw err;
    }
  },

  // Create a drink
  async createDrink(drinkData: {
    spot_id: string;
    name: string;
    image_url?: string;
    suggested_by: string;
  }): Promise<Drink> {
    const { data, error } = await supabase
      .from('drinks')
      .insert({
        spot_id: drinkData.spot_id,
        name: drinkData.name,
        image_url: drinkData.image_url || '',
        suggested_by: drinkData.suggested_by,
        votes: 0,
        voted_by: [],
      })
      .select(`
        *,
        profiles:suggested_by (
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error creating drink:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url || '',
      votes: data.votes || 0,
      suggested_by: data.suggested_by,
      voted_by: data.voted_by || [],
      profiles: data.profiles,
    };
  },

  // Update a drink
  async updateDrink(drinkId: string, drinkData: {
    name?: string;
    image_url?: string;
    price?: number;
  }): Promise<Drink> {
    const { data, error } = await supabase
      .from('drinks')
      .update(drinkData)
      .eq('id', drinkId)
      .select(`
        *,
        profiles:suggested_by (
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating drink:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url || '',
      votes: data.votes || 0,
      suggested_by: data.suggested_by,
      voted_by: data.voted_by || [],
      price: data.price || undefined,
      profiles: data.profiles,
    };
  },

  // Vote for a drink
  async voteForDrink(drinkId: string, userId: string): Promise<Drink> {
    // First get the drink to check if user already voted
    const { data: drink, error: fetchError } = await supabase
      .from('drinks')
      .select('*')
      .eq('id', drinkId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const votedBy = drink.voted_by || [];
    const hasVoted = votedBy.includes(userId);

    let updatedVotedBy: string[];
    let votes: number;

    if (hasVoted) {
      // Remove vote
      updatedVotedBy = votedBy.filter((id: string) => id !== userId);
      votes = Math.max(0, (drink.votes || 0) - 1);
    } else {
      // Add vote
      updatedVotedBy = [...votedBy, userId];
      votes = (drink.votes || 0) + 1;
    }

    const { data, error } = await supabase
      .from('drinks')
      .update({
        votes,
        voted_by: updatedVotedBy,
      })
      .eq('id', drinkId)
      .select(`
        *,
        profiles:suggested_by (
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error voting for drink:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url || '',
      votes: data.votes || 0,
      suggested_by: data.suggested_by,
      voted_by: data.voted_by || [],
      profiles: data.profiles,
    };
  },

  // Delete a drink
  async deleteDrink(drinkId: string): Promise<void> {
    const { error } = await supabase
      .from('drinks')
      .delete()
      .eq('id', drinkId);

    if (error) {
      console.error('Error deleting drink:', error);
      throw error;
    }
  },
};

/* -------------------------------------------------------------------------- */
/* CIGARETTES */
/* -------------------------------------------------------------------------- */

export const cigaretteService = {
  // Get cigarettes for a spot
  async getCigarettes(spotId: string): Promise<Cigarette[]> {
    try {
      const { data, error } = await supabase
        .from('cigarettes')
        .select(`
          *,
          profiles:added_by (
            name,
            profile_pic_url
          )
        `)
        .eq('spot_id', spotId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching cigarettes:', error);
        // If table doesn't exist, return empty array instead of throwing
        if (error.message?.includes('does not exist') || 
            error.message?.includes('relation') ||
            error.code === '42P01') {
          return [];
        }
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((cig: any) => ({
        id: cig.id,
        spot_id: cig.spot_id,
        name: cig.name || 'Cigarette Pack',
        image_url: cig.image_url,
        added_by: cig.added_by,
        price: cig.price || undefined,
        created_at: cig.created_at,
        profiles: cig.profiles || null,
      }));
    } catch (err: any) {
      console.error('Error in getCigarettes:', err);
      // If it's a table not found error, return empty array
      if (err.message?.includes('does not exist') || 
          err.message?.includes('relation') ||
          err.code === '42P01') {
        return [];
      }
      throw err;
    }
  },

  // Update a cigarette
  async updateCigarette(cigaretteId: string, cigaretteData: {
    name?: string;
    image_url?: string;
    price?: number;
  }): Promise<Cigarette> {
    const { data, error } = await supabase
      .from('cigarettes')
      .update(cigaretteData)
      .eq('id', cigaretteId)
      .select(`
        *,
        profiles:added_by (
          name,
          profile_pic_url
        )
      `)
      .single();

    if (error) {
      console.error('Error updating cigarette:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url,
      added_by: data.added_by,
      created_at: data.created_at,
      profiles: data.profiles,
    };
  },

  // Create a cigarette
  async createCigarette(cigaretteData: {
    spot_id: string;
    name: string;
    image_url: string;
    added_by: string;
  }): Promise<Cigarette> {
    const { data, error } = await supabase
      .from('cigarettes')
      .insert({
        spot_id: cigaretteData.spot_id,
        name: cigaretteData.name,
        image_url: cigaretteData.image_url,
        added_by: cigaretteData.added_by,
      })
      .select(`
        *,
        profiles:added_by (
          name,
          profile_pic_url
        )
      `)
      .single();

    if (error) {
      console.error('Error creating cigarette:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name || 'Cigarette Pack',
      image_url: data.image_url,
      added_by: data.added_by,
      created_at: data.created_at,
      profiles: data.profiles,
    };
  },

  // Delete a cigarette
  async deleteCigarette(cigaretteId: string): Promise<void> {
    const { error } = await supabase
      .from('cigarettes')
      .delete()
      .eq('id', cigaretteId);

    if (error) {
      console.error('Error deleting cigarette:', error);
      throw error;
    }
  },
};

/* -------------------------------------------------------------------------- */
/* FOOD */
/* -------------------------------------------------------------------------- */

export const foodService = {
  // Get foods for a spot
  async getFoods(spotId: string): Promise<Food[]> {
    try {
      const { data, error } = await supabase
        .from('foods')
        .select(`
          *,
          profiles:added_by (
            name,
            profile_pic_url
          )
        `)
        .eq('spot_id', spotId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching foods:', error);
        // If table doesn't exist, return empty array instead of throwing
        if (error.message?.includes('does not exist') || 
            error.message?.includes('relation') ||
            error.code === '42P01') {
          return [];
        }
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map((food: any) => ({
        id: food.id,
        spot_id: food.spot_id,
        name: food.name,
        image_url: food.image_url,
        added_by: food.added_by,
        price: food.price || undefined,
        created_at: food.created_at,
        profiles: food.profiles || null,
      }));
    } catch (err: any) {
      console.error('Error in getFoods:', err);
      // If it's a table not found error, return empty array
      if (err.message?.includes('does not exist') || 
          err.message?.includes('relation') ||
          err.code === '42P01') {
        return [];
      }
      throw err;
    }
  },

  // Create a food
  async createFood(foodData: {
    spot_id: string;
    name: string;
    image_url: string;
    added_by: string;
  }): Promise<Food> {
    const { data, error } = await supabase
      .from('foods')
      .insert({
        spot_id: foodData.spot_id,
        name: foodData.name,
        image_url: foodData.image_url,
        added_by: foodData.added_by,
      })
      .select(`
        *,
        profiles:added_by (
          name,
          profile_pic_url
        )
      `)
      .single();

    if (error) {
      console.error('Error creating food:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url,
      added_by: data.added_by,
      created_at: data.created_at,
      profiles: data.profiles,
    };
  },

  // Update a food
  async updateFood(foodId: string, foodData: {
    name?: string;
    image_url?: string;
    price?: number;
  }): Promise<Food> {
    const { data, error } = await supabase
      .from('foods')
      .update(foodData)
      .eq('id', foodId)
      .select(`
        *,
        profiles:added_by (
          name,
          profile_pic_url
        )
      `)
      .single();

    if (error) {
      console.error('Error updating food:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      name: data.name,
      image_url: data.image_url,
      added_by: data.added_by,
      price: data.price || undefined,
      created_at: data.created_at,
      profiles: data.profiles,
    };
  },

  // Delete a food
  async deleteFood(foodId: string): Promise<void> {
    const { error } = await supabase
      .from('foods')
      .delete()
      .eq('id', foodId);

    if (error) {
      console.error('Error deleting food:', error);
      throw error;
    }
  },
};

/* -------------------------------------------------------------------------- */
/* NOTIFICATIONS */
/* -------------------------------------------------------------------------- */

export const notificationService = {
  // Get notifications for a user
  async getNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }

    return data.map((notif: any) => ({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      timestamp: notif.created_at,
      read: notif.read,
    }));
  },

  // Create notification for a user
  async createNotification(notificationData: {
    user_id: string;
    title: string;
    message: string;
  }): Promise<Notification> {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: notificationData.user_id,
        title: notificationData.title,
        message: notificationData.message,
        read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      message: data.message,
      timestamp: data.created_at,
      read: data.read,
    };
  },

  // Create notifications for all users
  async createNotificationForAllUsers(title: string, message: string): Promise<void> {
    try {
      // Get all users
      const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id');

      if (usersError || !allUsers || allUsers.length === 0) {
        console.error('Error fetching users for notifications:', usersError);
        return;
      }

      // Create notifications for all users
      const notifications = allUsers.map((user) => ({
        user_id: user.id,
        title,
        message,
        read: false,
      }));

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Error creating notifications for all users:', insertError);
      }
    } catch (error) {
      console.error('Error in createNotificationForAllUsers:', error);
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },

  // Subscribe to real-time notification updates
  subscribeToNotifications(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        callback
      )
      .subscribe();
  },
};

/* -------------------------------------------------------------------------- */
/* MOMENTS */
/* -------------------------------------------------------------------------- */

export const momentService = {
  // Get moments for a user
  async getMoments(userId: string): Promise<Moment[]> {
    const { data, error } = await supabase
      .from('moments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching moments:', error);
      throw error;
    }

    return data.map((moment: any) => ({
      id: moment.id,
      user_id: moment.user_id,
      image_url: moment.image_url,
      caption: moment.caption || '',
      intel: moment.intel || moment.caption || '',
      created_at: moment.created_at,
    }));
  },

  // Get all moments (for viewing all users' moments)
  async getAllMoments(): Promise<Moment[]> {
    const { data, error } = await supabase
      .from('moments')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          profile_pic_url
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all moments:', error);
      throw error;
    }

    return data.map((moment: any) => ({
      id: moment.id,
      user_id: moment.user_id,
      image_url: moment.image_url,
      caption: moment.caption || '',
      intel: moment.intel || moment.caption || '',
      created_at: moment.created_at,
      profiles: moment.profiles,
    }));
  },

  // Create a moment
  async createMoment(momentData: {
    user_id: string;
    image_url: string;
    caption?: string;
    intel?: string;
  }): Promise<Moment> {
    const { data, error } = await supabase
      .from('moments')
      .insert({
        user_id: momentData.user_id,
        image_url: momentData.image_url,
        caption: momentData.caption || '',
        intel: momentData.intel || momentData.caption || '',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating moment:', error);
      throw error;
    }

    return {
      id: data.id,
      user_id: data.user_id,
      image_url: data.image_url,
      caption: data.caption || '',
      intel: data.intel || data.caption || '',
      created_at: data.created_at,
    };
  },

  // Delete a moment
  async deleteMoment(momentId: string): Promise<void> {
    const { error } = await supabase
      .from('moments')
      .delete()
      .eq('id', momentId);

    if (error) {
      console.error('Error deleting moment:', error);
      throw error;
    }
  },
};

/* -------------------------------------------------------------------------- */
/* DRINK BRANDS */
/* -------------------------------------------------------------------------- */

export const drinkBrandService = {
  // Get all drink brands
  async getDrinkBrands(category?: string): Promise<DrinkBrand[]> {
    let query = supabase
      .from('drink_brands')
      .select('*')
      .eq('is_available', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching drink brands:', error);
      throw error;
    }

    return data.map((brand: any) => ({
      id: brand.id,
      name: brand.name,
      category: brand.category,
      image_url: brand.image_url || '',
      base_price: brand.base_price,
      description: brand.description || '',
      is_available: brand.is_available,
      created_at: brand.created_at,
      updated_at: brand.updated_at,
    }));
  },

  // Get drink brand by ID
  async getDrinkBrand(brandId: string): Promise<DrinkBrand | null> {
    const { data, error } = await supabase
      .from('drink_brands')
      .select('*')
      .eq('id', brandId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching drink brand:', error);
      throw error;
    }

    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      category: data.category,
      image_url: data.image_url || '',
      base_price: data.base_price,
      description: data.description || '',
      is_available: data.is_available,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* USER DRINK SELECTIONS */
/* -------------------------------------------------------------------------- */

export const userDrinkSelectionService = {
  // Get user's drink selections for a spot
  async getUserSelections(spotId: string, userId: string): Promise<UserDrinkSelection[]> {
    const { data, error } = await supabase
      .from('user_drink_selections')
      .select(`
        *,
        drink_brand:drink_brand_id (
          id,
          name,
          category,
          image_url,
          base_price,
          description
        )
      `)
      .eq('spot_id', spotId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user drink selections:', error);
      throw error;
    }

    return data.map((selection: any) => ({
      id: selection.id,
      spot_id: selection.spot_id,
      user_id: selection.user_id,
      drink_brand_id: selection.drink_brand_id,
      quantity: selection.quantity,
      unit_price: selection.unit_price,
      total_price: selection.total_price,
      created_at: selection.created_at,
      updated_at: selection.updated_at,
      drink_brand: selection.drink_brand,
    }));
  },

  // Get all selections for a spot (for admin view)
  async getAllSelections(spotId: string): Promise<UserDrinkSelection[]> {
    const { data, error } = await supabase
      .from('user_drink_selections')
      .select(`
        *,
        drink_brand:drink_brand_id (
          id,
          name,
          category,
          image_url,
          base_price,
          description
        ),
        profiles:user_id (
          id,
          name,
          username,
          profile_pic_url
        )
      `)
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all drink selections:', error);
      throw error;
    }

    return data.map((selection: any) => ({
      id: selection.id,
      spot_id: selection.spot_id,
      user_id: selection.user_id,
      drink_brand_id: selection.drink_brand_id,
      quantity: selection.quantity,
      unit_price: selection.unit_price,
      total_price: selection.total_price,
      created_at: selection.created_at,
      updated_at: selection.updated_at,
      drink_brand: selection.drink_brand,
      profiles: selection.profiles,
    }));
  },

  // Add or update drink selection
  async upsertSelection(selectionData: {
    spot_id: string;
    user_id: string;
    drink_brand_id: string;
    quantity: number;
    unit_price: number;
  }): Promise<UserDrinkSelection> {
    const total_price = selectionData.quantity * selectionData.unit_price;

    const { data, error } = await supabase
      .from('user_drink_selections')
      .upsert({
        spot_id: selectionData.spot_id,
        user_id: selectionData.user_id,
        drink_brand_id: selectionData.drink_brand_id,
        quantity: selectionData.quantity,
        unit_price: selectionData.unit_price,
        total_price: total_price,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'spot_id,user_id,drink_brand_id'
      })
      .select(`
        *,
        drink_brand:drink_brand_id (
          id,
          name,
          category,
          image_url,
          base_price,
          description
        )
      `)
      .single();

    if (error) {
      console.error('Error upserting drink selection:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      user_id: data.user_id,
      drink_brand_id: data.drink_brand_id,
      quantity: data.quantity,
      unit_price: data.unit_price,
      total_price: data.total_price,
      created_at: data.created_at,
      updated_at: data.updated_at,
      drink_brand: data.drink_brand,
    };
  },

  // Delete drink selection
  async deleteSelection(selectionId: string): Promise<void> {
    const { error } = await supabase
      .from('user_drink_selections')
      .delete()
      .eq('id', selectionId);

    if (error) {
      console.error('Error deleting drink selection:', error);
      throw error;
    }
  },

  // Delete all selections for a user in a spot
  async deleteAllUserSelections(spotId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_drink_selections')
      .delete()
      .eq('spot_id', spotId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting all user selections:', error);
      throw error;
    }
  },
};

/* -------------------------------------------------------------------------- */
/* ATTENDANCE */
/* -------------------------------------------------------------------------- */

export const attendanceService = {
  // Get attendance for a spot
  async getAttendance(spotId: string): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          username,
          phone,
          email,
          role,
          profile_pic_url,
          location,
          mission_count
        )
      `)
      .eq('spot_id', spotId);

    if (error) {
      console.error('Error fetching attendance:', error);
      throw error;
    }

    return data.map((att: any) => ({
      id: att.id,
      spot_id: att.spot_id,
      user_id: att.user_id,
      attended: att.attended,
      created_at: att.created_at,
      updated_at: att.updated_at,
      profiles: att.profiles,
    }));
  },

  // Get user's attendance for a spot
  async getUserAttendance(spotId: string, userId: string): Promise<Attendance | null> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('spot_id', spotId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user attendance:', error);
      throw error;
    }

    return data || null;
  },

  // Create or update attendance
  async upsertAttendance(attendanceData: {
    spot_id: string;
    user_id: string;
    attended: boolean;
  }): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({
        spot_id: attendanceData.spot_id,
        user_id: attendanceData.user_id,
        attended: attendanceData.attended,
      }, {
        onConflict: 'spot_id,user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting attendance:', error);
      throw error;
    }

    return {
      id: data.id,
      spot_id: data.spot_id,
      user_id: data.user_id,
      attended: data.attended,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },
};
