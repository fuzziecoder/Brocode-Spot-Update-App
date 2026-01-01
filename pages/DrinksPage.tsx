import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { UserRole, Spot, Drink, PaymentStatus, Cigarette } from "../types";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Modal from "../components/common/Modal";
import Input from "../components/common/Input";
import { spotService, paymentService, drinkService, cigaretteService } from "../services/database";
import { supabase } from "../services/supabase";
import { Plus, ThumbsUp, Trash2, Loader2, Image as ImageIcon, X, Camera } from "lucide-react";

const DrinksPage: React.FC = () => {
  const { profile } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cigarettes, setCigarettes] = useState<Cigarette[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isDrinkModalOpen, setIsDrinkModalOpen] = useState(false);
  const [isCigaretteModalOpen, setIsCigaretteModalOpen] = useState(false);
  const [newDrinkName, setNewDrinkName] = useState("");
  const [newDrinkImage, setNewDrinkImage] = useState("");
  const [newDrinkImagePreview, setNewDrinkImagePreview] = useState<string | null>(null);
  const [newCigaretteImage, setNewCigaretteImage] = useState<string | null>(null);
  const [newCigaretteImagePreview, setNewCigaretteImagePreview] = useState<string | null>(null);
  const drinkImageInputRef = useRef<HTMLInputElement>(null);
  const cigaretteImageInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    
    try {
      const spotData = await spotService.getUpcomingSpot();
      setSpot(spotData);

      if (spotData) {
        // Check if user has paid
        const payments = await paymentService.getPayments(spotData.id);
        const userPayment = payments.find((p) => p.user_id === profile.id);
        setIsPaid(userPayment?.status === PaymentStatus.PAID);

        // Only fetch drinks and cigarettes if user is paid
        if (userPayment?.status === PaymentStatus.PAID) {
          const [drinksData, cigarettesData] = await Promise.all([
            drinkService.getDrinks(spotData.id),
            cigaretteService.getCigarettes(spotData.id),
          ]);
          setDrinks(drinksData);
          setCigarettes(cigarettesData);
        } else {
          setDrinks([]);
          setCigarettes([]);
        }
      } else {
        setDrinks([]);
        setIsPaid(false);
      }
    } catch (error) {
      console.error("Error loading drinks data:", error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchData();

    // Set up real-time subscription for drinks and cigarettes
    if (spot && isPaid) {
      const drinksChannel = supabase
        .channel(`drinks-${spot.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'drinks',
            filter: `spot_id=eq.${spot.id}`,
          },
          () => {
            fetchData();
          }
        )
        .subscribe();

      const cigarettesChannel = supabase
        .channel(`cigarettes-${spot.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cigarettes',
            filter: `spot_id=eq.${spot.id}`,
          },
          () => {
            fetchData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(drinksChannel);
        supabase.removeChannel(cigarettesChannel);
      };
    }
  }, [fetchData, spot?.id, isPaid]);

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
      // Final fallback: if we still can't create/find, throw a helpful error
      throw new Error(`User profile not found in database and could not be created. Please ensure you are logged in with a valid account. Error: ${createErr.message}`);
    }
  };

  const handleDrinkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setNewDrinkImagePreview(result);
        setNewDrinkImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCigaretteImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setNewCigaretteImagePreview(result);
        setNewCigaretteImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spot || !profile || !newDrinkName.trim()) return;

    try {
      const userId = await getUserIdAsUUID(profile.id);
      await drinkService.createDrink({
        spot_id: spot.id,
        name: newDrinkName.trim(),
        image_url: newDrinkImage || undefined,
        suggested_by: userId,
      });
      setNewDrinkName("");
      setNewDrinkImage("");
      setNewDrinkImagePreview(null);
      setIsDrinkModalOpen(false);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to add drink: ${error.message || 'Please try again.'}`);
    }
  };

  const handleAddCigarette = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spot || !profile || !newCigaretteImage) return;

    try {
      const userId = await getUserIdAsUUID(profile.id);
      await cigaretteService.createCigarette({
        spot_id: spot.id,
        image_url: newCigaretteImage,
        added_by: userId,
      });
      setNewCigaretteImage(null);
      setNewCigaretteImagePreview(null);
      setIsCigaretteModalOpen(false);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to add cigarette: ${error.message || 'Please try again.'}`);
    }
  };

  const handleDeleteCigarette = async (cigaretteId: string) => {
    if (!confirm("Are you sure you want to delete this cigarette?")) return;

    try {
      await cigaretteService.deleteCigarette(cigaretteId);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to delete cigarette: ${error.message || 'Please try again.'}`);
    }
  };

  const handleVote = async (drinkId: string) => {
    if (!profile) return;

    try {
      await drinkService.voteForDrink(drinkId, profile.id);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to vote: ${error.message || 'Please try again.'}`);
    }
  };

  const handleDeleteDrink = async (drinkId: string) => {
    if (!confirm("Are you sure you want to delete this drink?")) return;

    try {
      await drinkService.deleteDrink(drinkId);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to delete drink: ${error.message || 'Please try again.'}`);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="animate-spin mx-auto mb-4" size={32} />
        <p>Loading drinks...</p>
      </div>
    );
  }

  if (!spot) {
    return (
      <Card>
        <p className="text-center text-gray-400">
          No upcoming spot available.
        </p>
      </Card>
    );
  }

  if (!isPaid) {
    return (
      <div className="space-y-6 pb-20 max-w-6xl mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold">Drinks</h1>
        <Card className="p-8 text-center">
          <p className="text-gray-400 mb-4">
            You need to complete payment first to access the drinks section.
          </p>
          <Button onClick={() => window.location.href = '/dashboard/payment'}>
            Go to Payment
          </Button>
        </Card>
      </div>
    );
  }

  const hasUserVoted = (drink: Drink) => {
    return profile && drink.voted_by.includes(profile.id);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 max-w-6xl mx-auto px-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold">Drinks & Cigarettes</h1>
        <div className="flex gap-2">
          <Button onClick={() => setIsCigaretteModalOpen(true)} variant="secondary">
            <Camera size={16} className="mr-2" />
            Add Cigarette
          </Button>
          <Button onClick={() => setIsDrinkModalOpen(true)}>
            <Plus size={16} className="mr-2" />
            Add Drink
          </Button>
        </div>
      </div>

      {/* DRINKS SECTION */}
      <div>
        <h2 className="text-xl md:text-2xl font-semibold mb-4">Drinks</h2>

        {drinks.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400 mb-4">No drinks suggested yet.</p>
            <p className="text-sm text-gray-500">Be the first to suggest a drink!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {drinks.map((drink) => (
              <Card key={drink.id} className="p-4 md:p-6">
                <div className="relative group">
                  {drink.image_url ? (
                    <img
                      src={drink.image_url}
                      alt={drink.name}
                      className="w-full h-48 object-cover rounded-lg mb-4"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-48 bg-zinc-800 rounded-lg mb-4 flex items-center justify-center">
                      <span className="text-zinc-500 text-4xl">🍺</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleDeleteDrink(drink.id)}
                    className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <h3 className="text-lg font-semibold mb-2">{drink.name}</h3>
                
                {drink.profiles && (
                  <p className="text-sm text-zinc-400 mb-4">
                    Suggested by {drink.profiles.name}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleVote(drink.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      hasUserVoted(drink)
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <ThumbsUp size={16} />
                    <span>{drink.votes}</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* CIGARETTES SECTION */}
      <div>
        <h2 className="text-xl md:text-2xl font-semibold mb-4">Cigarettes</h2>
        {cigarettes.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400 mb-4">No cigarettes added yet.</p>
            <p className="text-sm text-gray-500">Add your cigarette pack!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {cigarettes.map((cigarette) => (
              <Card key={cigarette.id} className="p-4 relative group">
                <div className="relative">
                  <img
                    src={cigarette.image_url}
                    alt="Cigarette"
                    className="w-full h-48 object-cover rounded-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <button
                    onClick={() => handleDeleteCigarette(cigarette.id)}
                    className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {cigarette.profiles && (
                  <p className="text-xs text-zinc-400 mt-2 text-center">
                    Added by {cigarette.profiles.name}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ADD DRINK MODAL */}
      <Modal
        isOpen={isDrinkModalOpen}
        onClose={() => {
          setIsDrinkModalOpen(false);
          setNewDrinkName("");
          setNewDrinkImage("");
          setNewDrinkImagePreview(null);
        }}
        title="Add Drink"
      >
        <form onSubmit={handleAddDrink} className="space-y-4">
          <Input
            label="Drink Name"
            value={newDrinkName}
            onChange={(e) => setNewDrinkName(e.target.value)}
            placeholder="e.g., Kingfisher, Old Monk, etc."
            required
          />
          
          <div>
            <label className="block text-sm font-medium mb-2">Drink Image</label>
            {newDrinkImagePreview ? (
              <div className="relative">
                <img src={newDrinkImagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg mb-2" />
                <button
                  type="button"
                  onClick={() => {
                    setNewDrinkImagePreview(null);
                    setNewDrinkImage("");
                    if (drinkImageInputRef.current) drinkImageInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => drinkImageInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors"
              >
                <ImageIcon size={32} className="text-zinc-500 mb-2" />
                <p className="text-sm text-zinc-400">Click to upload image</p>
              </div>
            )}
            <input
              ref={drinkImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleDrinkImageUpload}
              className="hidden"
            />
            <Input
              label="Or Image URL (Optional)"
              value={newDrinkImage && !newDrinkImagePreview ? newDrinkImage : ''}
              onChange={(e) => setNewDrinkImage(e.target.value)}
              placeholder="https://example.com/drink-image.jpg"
              className="mt-2"
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Add Drink
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsDrinkModalOpen(false);
                setNewDrinkName("");
                setNewDrinkImage("");
                setNewDrinkImagePreview(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ADD CIGARETTE MODAL */}
      <Modal
        isOpen={isCigaretteModalOpen}
        onClose={() => {
          setIsCigaretteModalOpen(false);
          setNewCigaretteImage(null);
          setNewCigaretteImagePreview(null);
        }}
        title="Add Cigarette"
      >
        <form onSubmit={handleAddCigarette} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cigarette Image *</label>
            {newCigaretteImagePreview ? (
              <div className="relative">
                <img src={newCigaretteImagePreview} alt="Preview" className="w-full h-64 object-cover rounded-lg mb-2" />
                <button
                  type="button"
                  onClick={() => {
                    setNewCigaretteImagePreview(null);
                    setNewCigaretteImage(null);
                    if (cigaretteImageInputRef.current) cigaretteImageInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => cigaretteImageInputRef.current?.click()}
                className="w-full h-64 border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors"
              >
                <Camera size={48} className="text-zinc-500 mb-2" />
                <p className="text-sm text-zinc-400">Click to upload cigarette image</p>
                <p className="text-xs text-zinc-500 mt-1">Upload your cigarette pack photo</p>
              </div>
            )}
            <input
              ref={cigaretteImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleCigaretteImageUpload}
              className="hidden"
              required
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!newCigaretteImage}>
              Add Cigarette
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCigaretteModalOpen(false);
                setNewCigaretteImage(null);
                setNewCigaretteImagePreview(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DrinksPage;
