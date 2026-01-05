
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import { Spot, Moment, UserProfile } from '../types';
import { ArrowLeft, MoreHorizontal, Gift, Plus, Image as ImageIcon, X, Trash2, Camera, MapPin } from 'lucide-react';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate, useParams } = ReactRouterDOM;
import { differenceInYears, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from '../components/common/GlowButton';
import { mockApi, getPlaceholderImage } from '../services/mockApi';
import Textarea from '../components/common/Textarea';
import AvatarPicker from '../components/common/AvatarPicker';
import { profileService, momentService, spotService } from '../services/database';
import { supabase } from '../services/supabase';

type ProfileFormData = {
    name: string;
    username: string;
    phone: string;
    location: string;
    profile_pic_url: string;
};

const ProfileForm: React.FC<{ onSave: () => void }> = ({ onSave }) => {
    const { profile, updateProfile, user } = useAuth();
    const [formData, setFormData] = useState<ProfileFormData>({
        name: profile?.name || '',
        username: profile?.username || '',
        phone: profile?.phone || '',
        location: profile?.location || '',
        profile_pic_url: profile?.profile_pic_url || getPlaceholderImage(profile?.username || 'default'),
    });

    // Update form data when profile changes
    useEffect(() => {
        if (profile) {
            setFormData({
                name: profile.name || '',
                username: profile.username || '',
                phone: profile.phone || '',
                location: profile.location || '',
                profile_pic_url: profile.profile_pic_url || getPlaceholderImage(profile.username || 'default'),
            });
        }
    }, [profile]);
    const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormData, string>>>({});
    const [loading, setLoading] = useState(false);
    const [checkingUsername, setCheckingUsername] = useState(false);

    const validateField = (name: keyof Omit<ProfileFormData, 'profile_pic_url'>, value: string): string => {
        let error = '';
        // Location is optional, skip validation for it
        if (name === 'location') {
            return error;
        }
        if (!value.trim()) {
            error = `${name.charAt(0).toUpperCase() + name.slice(1)} is required.`;
        }
        if (name === 'username' && value.trim()) {
            // Username validation: alphanumeric and underscore only
            if (!/^[a-zA-Z0-9_]+$/.test(value.trim())) {
                error = 'Username can only contain letters, numbers, and underscores.';
            }
        }
        return error;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target as { name: keyof ProfileFormData, value: string };
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear error for this field when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: undefined }));
        }
    };

    const handleUsernameBlur = async () => {
        if (!formData.username.trim() || formData.username === profile?.username) {
            return; // Don't check if empty or unchanged
        }

        setCheckingUsername(true);
        try {
            const isUnique = await profileService.isUsernameUnique(
                formData.username.trim(),
                user?.id
            );
            if (!isUnique) {
                setErrors(prev => ({
                    ...prev,
                    username: 'Username is already taken. Please choose another one.'
                }));
            } else {
                setErrors(prev => ({ ...prev, username: undefined }));
            }
        } catch (error) {
            console.error('Error checking username:', error);
            setErrors(prev => ({
                ...prev,
                username: 'Error checking username availability. Please try again.'
            }));
        } finally {
            setCheckingUsername(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate all fields
        const newErrors: Partial<Record<keyof ProfileFormData, string>> = {};
        (Object.keys(formData) as Array<keyof Omit<ProfileFormData, 'profile_pic_url'>>).forEach((key) => {
            const error = validateField(key, formData[key]);
            if (error) newErrors[key] = error;
        });

        // Check username uniqueness if changed
        if (formData.username.trim() !== profile?.username) {
            try {
                const isUnique = await profileService.isUsernameUnique(
                    formData.username.trim(),
                    user?.id
                );
                if (!isUnique) {
                    newErrors.username = 'Username is already taken. Please choose another one.';
                }
            } catch (error) {
                newErrors.username = 'Error checking username availability. Please try again.';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);
        try {
            await updateProfile(formData);
            onSave();
        } catch (err: any) {
            console.error(err);
            alert(err?.message || 'Failed to update profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <AvatarPicker label="BRO-DENTITY" initialValue={formData.profile_pic_url} onChange={(url) => setFormData(p => ({...p, profile_pic_url: url}))} />
            <div>
                <Input 
                    label="Username" 
                    name="username" 
                    value={formData.username} 
                    onChange={handleChange}
                    onBlur={handleUsernameBlur}
                    icon={<Plus size={16}/>}
                />
                {errors.username && (
                    <p className="text-red-400 text-xs mt-1">{errors.username}</p>
                )}
                {checkingUsername && (
                    <p className="text-zinc-400 text-xs mt-1">Checking availability...</p>
                )}
            </div>
            <Input label="Name" name="name" value={formData.name} onChange={handleChange} icon={<Plus size={16}/>} />
            {errors.name && (
                <p className="text-red-400 text-xs -mt-4">{errors.name}</p>
            )}
            <Input label="Handle" name="location" value={formData.location} onChange={handleChange} icon={<MapPin size={16}/>} />
            {errors.location && (
                <p className="text-red-400 text-xs -mt-4">{errors.location}</p>
            )}
            <Button type="submit" disabled={loading || checkingUsername} className="w-full py-4 font-black uppercase tracking-widest">Update Profile</Button>
        </form>
    );
};

const MomentForm: React.FC<{ onSave: () => void }> = ({ onSave }) => {
    const { user, profile } = useAuth();
    const [caption, setCaption] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Helper function to get UUID from profile ID
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

        throw new Error('User profile not found in database');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imagePreview || !user) return;
        setLoading(true);
        try {
            const userId = await getUserIdAsUUID(user.id);
            await momentService.createMoment({ user_id: userId, image_url: imagePreview, caption });
            onSave();
        } catch (error: any) {
            console.error('Error creating moment:', error);
            alert(`Failed to create moment: ${error.message || 'Please try again.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
                {imagePreview ? (
                    <div className="relative w-full aspect-square rounded-3xl overflow-hidden border-2 border-indigo-500/30">
                        <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                        <button onClick={() => setImagePreview(null)} className="absolute top-4 right-4 bg-black/50 p-2 rounded-full"><X size={20}/></button>
                    </div>
                ) : (
                    <label className="w-full aspect-square rounded-3xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800 transition-colors">
                        <Camera size={48} className="text-zinc-500 mb-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Capture the Moment</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                )}
            </div>
            <Textarea label="CAPTION" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What went down?" />
            <Button type="submit" disabled={loading || !imagePreview} className="w-full py-4">SHARE WITH SQUAD</Button>
        </form>
    );
};

const ProfilePage: React.FC = () => {
    const { profile: currentProfile, user } = useAuth();
    const navigate = useNavigate();
    const { userId: viewUserId } = useParams<{ userId?: string }>();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [activeTab, setActiveTab] = useState<'Details' | 'Moments'>('Moments');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isMomentModalOpen, setIsMomentModalOpen] = useState(false);
    const [trips, setTrips] = useState<Spot[]>([]);
    const [moments, setMoments] = useState<Moment[]>([]);
    const [loading, setLoading] = useState(true);
    const isViewingOwnProfile = !viewUserId || viewUserId === currentProfile?.id;

    // Helper function to get UUID from profile ID
    const getUserIdAsUUID = useCallback(async (profileId: string, profileToUse?: UserProfile): Promise<string> => {
        const profileRef = profileToUse || currentProfile;
        if (!profileRef) {
            throw new Error('No user profile available');
        }

        // If it's already a UUID, return it
        if (profileId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return profileId;
        }

        // Otherwise, look it up in the database
        const cleanPhone = profileRef.phone ? profileRef.phone.replace(/\D/g, '') : '';
        
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
        
        if (!dbProfile && profileRef.email) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', profileRef.email)
                .maybeSingle();
            if (!error && data) {
                dbProfile = data;
            }
        }
        
        if (!dbProfile && profileRef.username) {
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', profileRef.username)
                .maybeSingle();
            if (!error && data) {
                dbProfile = data;
            }
        }

        // If found, return the UUID
        if (dbProfile) {
            return dbProfile.id;
        }

        throw new Error('User profile not found in database');
    }, [currentProfile]);

    // Fetch profile data
    useEffect(() => {
        const fetchProfileData = async () => {
            if (!currentProfile) {
                setLoading(false);
                return;
            }
            
            setLoading(true);
            try {
                let targetUserId: string;
                let targetProfile: UserProfile | null = null;

                if (viewUserId) {
                    // Viewing another user's profile
                    targetUserId = viewUserId;
                    targetProfile = await profileService.getProfile(viewUserId);
                    if (!targetProfile) {
                        alert('User not found');
                        navigate('/dashboard/profile');
                        setLoading(false);
                        return;
                    }
                } else {
                    // Viewing own profile - use currentProfile directly
                    try {
                        targetUserId = await getUserIdAsUUID(currentProfile.id, currentProfile);
                    } catch (err) {
                        // If UUID lookup fails, try to use currentProfile.id directly
                        targetUserId = currentProfile.id;
                    }
                    targetProfile = currentProfile;
                }

                setProfile(targetProfile);

                // Fetch spots and moments for the target user
                try {
                    const [spotsData, momentsData] = await Promise.all([
                        spotService.getPastSpots().then(spots => spots.filter(s => s.created_by === targetUserId)),
                        momentService.getMoments(targetUserId),
                    ]);
                    setTrips(spotsData || []);
                    setMoments(momentsData || []);
                } catch (fetchError) {
                    console.error('Error fetching spots/moments:', fetchError);
                    setTrips([]);
                    setMoments([]);
                }
            } catch (error) {
                console.error('Error fetching profile data:', error);
                setTrips([]);
                setMoments([]);
                // Don't set profile to null if viewing own profile
                if (!viewUserId && currentProfile) {
                    setProfile(currentProfile);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchProfileData();
    }, [viewUserId, currentProfile?.id, navigate]);

    const fetchData = useCallback(async () => {
        if (!profile) return;
        setLoading(true);
        try {
            const userId = await getUserIdAsUUID(profile.id);
            const [spotsData, momentsData] = await Promise.all([
                spotService.getPastSpots().then(spots => spots.filter(s => s.created_by === userId)),
                momentService.getMoments(userId),
            ]);
            setTrips(spotsData || []);
            setMoments(momentsData || []);
        } catch (error) {
            console.error('Error fetching profile data:', error);
            setTrips([]);
            setMoments([]);
        } finally {
            setLoading(false);
        }
    }, [profile, getUserIdAsUUID]);

    if (!profile) {
        return (
            <div className="max-w-4xl mx-auto pb-32 flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-zinc-400">Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-32">
            <header className="flex flex-col items-center pt-8 pb-12 relative">
                {isViewingOwnProfile && (
                    <div className="absolute top-0 right-0">
                        <button onClick={() => setIsEditModalOpen(true)} className="p-3 bg-zinc-900 rounded-2xl border border-white/5 text-zinc-400">
                            <MoreHorizontal size={20} />
                        </button>
                    </div>
                )}
                {!isViewingOwnProfile && (
                    <div className="absolute top-0 left-0">
                        <button onClick={() => navigate('/dashboard/profile')} className="p-3 bg-zinc-900 rounded-2xl border border-white/5 text-zinc-400">
                            <ArrowLeft size={20} />
                        </button>
                    </div>
                )}
                
                <div className="relative mb-6">
                    <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-full blur-2xl opacity-20" />
                    <img 
                        src={profile.profile_pic_url || getPlaceholderImage(profile.username)} 
                        className="w-32 h-32 rounded-full border-4 border-[#111] shadow-2xl object-cover relative z-10" 
                        alt={profile.name}
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = getPlaceholderImage(profile.username);
                        }}
                    />
                </div>
                
                <h1 className="text-4xl font-black text-white tracking-tighter">@{profile.username}</h1>
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-2">{profile.name} • {profile.location}</p>
            </header>

            <div className="flex bg-[#111] p-1.5 rounded-2xl mb-10 border border-white/5">
                {(['Moments', 'Details'] as const).map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${activeTab === tab ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <main>
                <AnimatePresence mode="wait">
                    {activeTab === 'Moments' ? (
                        <motion.div key="moments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {isViewingOwnProfile && (
                                <button 
                                    onClick={() => setIsMomentModalOpen(true)}
                                    className="aspect-square bg-zinc-900 rounded-3xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-600 hover:text-indigo-400 hover:border-indigo-500/30 transition-all group"
                                >
                                    <Plus size={32} className="group-hover:scale-110 transition-transform"/>
                                    <span className="text-[9px] font-black uppercase tracking-widest mt-2">Add Intel</span>
                                </button>
                            )}
                            {moments.map(moment => (
                                <div key={moment.id} className="relative aspect-square rounded-3xl overflow-hidden group border border-white/5">
                                    <img src={moment.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Moment" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                        <p className="text-xs font-bold line-clamp-2">{moment.intel || moment.caption}</p>
                                        <span className="text-[8px] font-black uppercase tracking-widest mt-1 text-zinc-400">{format(new Date(moment.created_at), 'MMM dd')}</span>
                                    </div>
                                    {isViewingOwnProfile && (
                                        <button onClick={() => momentService.deleteMoment(moment.id).then(fetchData).catch(err => alert(`Failed to delete: ${err.message}`))} className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div key="details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="bg-[#111] p-8 rounded-[2.5rem] border border-white/5">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-6">Personal Intel</h3>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center py-4 border-b border-white/5">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">Squad Status</span>
                                        <span className="px-3 py-1 bg-green-500/10 text-green-400 text-[10px] font-black rounded-full uppercase border border-green-500/20 tracking-widest">Active Operative</span>
                                    </div>
                                    <div className="flex justify-between items-center py-4 border-b border-white/5">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">Deployment Base</span>
                                        <span className="text-sm font-bold text-white uppercase">{profile.location}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-4">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">Mission Count</span>
                                        <span className="text-sm font-bold text-white">{profile.mission_count || 0} Successful Ops</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="MODIFY OPERATIVE">
                <ProfileForm onSave={() => { setIsEditModalOpen(false); fetchData(); }} />
            </Modal>
            {isViewingOwnProfile && (
                <>
                </>
            )}
        </div>
    );
};

export default ProfilePage;
