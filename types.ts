

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export enum InvitationStatus {
  CONFIRMED = 'confirmed',
  PENDING = 'pending',
  DECLINED = 'declined',
}

export enum PaymentStatus {
  PAID = 'paid',
  NOT_PAID = 'not_paid',
}

export interface UserProfile {
  id: string; // UUID
  name: string;
  username: string;
  email?: string; // Made optional for mobile-only signup
  phone: string;
  role: UserRole;
  profile_pic_url?: string;
  location: string;
  date_of_birth?: string;
  password?: string;
  mission_count?: number; // Number of spots attended
  // Fields for mock OTP flow
  isVerified?: boolean;
  otp?: string;
  otpExpiry?: string;
  latitude?: number;
  longitude?: number;
}

export interface Spot {
  id: string; // UUID
  date: string; // ISO String
  day: string;
  timing: string;
  budget: number;
  location:string;
  created_by: string; // User ID
  feedback?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  members?: UserProfile[];
}

export interface Drink {
  id: string; // UUID
  spot_id: string; // UUID
  name: string;
  image_url: string;
  votes: number;
  suggested_by: string; // User's ID
  voted_by: string[]; // Array of User IDs
  price?: number; // Price set by admin
  profiles?: { name: string }; // Joined data for suggester's name
}

export interface Cigarette {
  id: string; // UUID
  spot_id: string; // UUID
  name: string;
  image_url: string;
  added_by: string; // User's ID
  price?: number; // Price set by admin
  created_at: string; // ISO String
  profiles?: { name: string; profile_pic_url?: string }; // Joined data for adder's name
}

export interface Food {
  id: string; // UUID
  spot_id: string; // UUID
  name: string;
  image_url: string;
  added_by: string; // User's ID
  price?: number; // Price set by admin
  created_at: string; // ISO String
  profiles?: { name: string; profile_pic_url?: string }; // Joined data for adder's name
}

export interface Invitation {
  id: string; // UUID
  spot_id: string; // UUID
  user_id: string; // UUID
  profiles: UserProfile; // Joined data from profiles table
  status: InvitationStatus;
}

export interface Payment {
  id: string; // UUID
  spot_id: string; // UUID
  user_id: string; // UUID
  profiles: UserProfile; // Joined data from profiles table
  status: PaymentStatus;
  drink_total_amount?: number; // Total amount for selected drinks
}

export interface DrinkBrand {
  id: string; // UUID
  name: string;
  category: 'beer' | 'whiskey' | 'vodka' | 'rum' | 'wine' | 'cocktail' | 'soft_drink' | 'other';
  image_url?: string;
  base_price: number;
  description?: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserDrinkSelection {
  id: string; // UUID
  spot_id: string; // UUID
  user_id: string; // UUID
  drink_brand_id: string; // UUID
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
  drink_brand?: DrinkBrand; // Joined data
  profiles?: UserProfile; // Joined data
}

export interface Notification {
  id: string; // UUID
  title: string;
  message: string;
  timestamp: string; // ISO String
  read: boolean;
}

export interface Moment {
  id: string; // UUID
  user_id: string; // UUID
  image_url: string;
  caption?: string;
  intel?: string; // Intel information (can be same as caption or separate)
  created_at: string; // ISO String
}

export interface ChatMessage {
  id: string; // UUID
  user_id: string; // UUID
  content_text?: string;
  content_image_urls?: string[];
  created_at: string; // ISO String
  profiles: Pick<UserProfile, 'name' | 'profile_pic_url'>; // Joined data
  reactions?: Record<string, string[]>; // e.g. { '👍': ['user_id_1', 'user_id_2'] }
}

export interface Attendance {
  id: string; // UUID
  spot_id: string; // UUID
  user_id: string; // UUID
  attended: boolean;
  created_at: string; // ISO String
  updated_at: string; // ISO String
  profiles?: UserProfile; // Joined data from profiles table
}

// FIX: Add Supabase User type definition to resolve import errors
// in other files, as it seems to be missing from the project's dependency.
export interface User {
  id: string;
  email?: string;
  app_metadata: { [key: string]: any };
  user_metadata: { [key: string]: any };
  aud: string;
  created_at: string;
}
