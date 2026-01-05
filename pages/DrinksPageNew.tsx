import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { UserRole, Spot, Drink, PaymentStatus, Cigarette, DrinkBrand, UserDrinkSelection } from "../types";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Modal from "../components/common/Modal";
import Input from "../components/common/Input";
import { spotService, paymentService, drinkService, cigaretteService, drinkBrandService, userDrinkSelectionService } from "../services/database";
import { supabase } from "../services/supabase";
import { Plus, ThumbsUp, Trash2, Loader2, X, Camera, ShoppingCart, Minus, Check, Wine, Beer, Coffee } from "lucide-react";

const DrinksPage: React.FC = () => {
  const { profile } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cigarettes, setCigarettes] = useState<Cigarette[]>([]);
  const [drinkBrands, setDrinkBrands] = useState<DrinkBrand[]>([]);
  const [userSelections, setUserSelections] = useState<UserDrinkSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'suggestions' | 'cigarettes' | 'cart'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDrinkModalOpen, setIsDrinkModalOpen] = useState(false);
  const [isCigaretteModalOpen, setIsCigaretteModalOpen] = useState(false);
  const [newDrinkName, setNewDrinkName] = useState("");
  const [newDrinkImage, setNewDrinkImage] = useState("");
  const [newDrinkImagePreview, setNewDrinkImagePreview] = useState<string | null>(null);
  const [newCigaretteImage, setNewCigaretteImage] = useState<string | null>(null);
  const [newCigaretteImagePreview, setNewCigaretteImagePreview] = useState<string | null>(null);
  const [userVotedDrinks, setUserVotedDrinks] = useState<Set<string>>(new Set());
  const drinkImageInputRef = useRef<HTMLInputElement>(null);
  const cigaretteImageInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get UUID from profile ID
  const getUserIdAsUUID = async (profileId: string): Promise<string> => {
    if (!profile) {
      throw new Error('No user profile available');
    }

    if (profileId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return profileId;
    }

    const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
    let dbProfile = null;
    
    if (cleanPhone) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', cleanPhone)
        .maybeSingle();
      if (!error && data) dbProfile = data;
    }
    
    if (!dbProfile && profile.email) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', profile.email)
        .maybeSingle();
      if (!error && data) dbProfile = data;
    }
    
    if (!dbProfile && profile.username) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', profile.username)
        .maybeSingle();
      if (!error && data) dbProfile = data;
    }

    if (dbProfile) return dbProfile.id;
    throw new Error('User profile not found in database');
  };

  const fetchData = useCallback(async () => {
    if (!profile) return;
    
    try {
      const spotData = await spotService.getUpcomingSpot();
      setSpot(spotData);

      if (spotData) {
        const userId = await getUserIdAsUUID(profile.id);
        const payments = await paymentService.getPayments(spotData.id);
        const userPayment = payments.find((p) => p.user_id === userId);
        const paidStatus = userPayment?.status === PaymentStatus.PAID;
        setIsPaid(paidStatus);

        if (paidStatus) {
          const [drinksData, cigarettesData, brandsData, selectionsData] = await Promise.all([
            drinkService.getDrinks(spotData.id),
            cigaretteService.getCigarettes(spotData.id),
            drinkBrandService.getDrinkBrands(),
            userDrinkSelectionService.getUserSelections(spotData.id, userId),
          ]);
          setDrinks(drinksData);
          setCigarettes(cigarettesData);
          setDrinkBrands(brandsData);
          setUserSelections(selectionsData);
        } else {
          setDrinks([]);
          setCigarettes([]);
          setDrinkBrands([]);
          setUserSelections([]);
        }
      } else {
        setDrinks([]);
        setIsPaid(false);
      }
    } catch (error: any) {
      console.error("Error loading drinks data:", error);
      setLoading(false);
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        alert('Database tables not found. Please run the migration: supabase_migration_drink_selection.sql');
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchData();

    if (spot && isPaid) {
      const drinksChannel = supabase
        .channel(`drinks-${spot.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks', filter: `spot_id=eq.${spot.id}` }, () => fetchData())
        .subscribe();

      const selectionsChannel = supabase
        .channel(`selections-${spot.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_drink_selections', filter: `spot_id=eq.${spot.id}` }, () => fetchData())
        .subscribe();

      return () => {
        supabase.removeChannel(drinksChannel);
        supabase.removeChannel(selectionsChannel);
      };
    }
  }, [fetchData, spot?.id, isPaid]);

  // Update voted drinks
  useEffect(() => {
    const updateVotedDrinks = async () => {
      if (!profile || drinks.length === 0) {
        setUserVotedDrinks(new Set());
        return;
      }
      try {
        const userId = await getUserIdAsUUID(profile.id);
        const voted = new Set(drinks.filter(d => d.voted_by.includes(userId)).map(d => d.id));
        setUserVotedDrinks(voted);
      } catch {
        setUserVotedDrinks(new Set());
      }
    };
    updateVotedDrinks();
  }, [drinks, profile]);

  const handleAddToCart = async (brand: DrinkBrand, quantity: number = 1) => {
    if (!spot || !profile) return;
    try {
      const userId = await getUserIdAsUUID(profile.id);
      await userDrinkSelectionService.upsertSelection({
        spot_id: spot.id,
        user_id: userId,
        drink_brand_id: brand.id,
        quantity: quantity,
        unit_price: brand.base_price,
      });
      await fetchData();
    } catch (error: any) {
      alert(`Failed to add drink: ${error.message || 'Please try again.'}`);
    }
  };

  const handleUpdateQuantity = async (selection: UserDrinkSelection, newQuantity: number) => {
    if (newQuantity <= 0) {
      await userDrinkSelectionService.deleteSelection(selection.id);
    } else {
      await userDrinkSelectionService.upsertSelection({
        spot_id: selection.spot_id,
        user_id: selection.user_id,
        drink_brand_id: selection.drink_brand_id,
        quantity: newQuantity,
        unit_price: selection.unit_price,
      });
    }
    await fetchData();
  };

  const handleRemoveSelection = async (selectionId: string) => {
    if (!confirm("Remove this drink from your order?")) return;
    try {
      await userDrinkSelectionService.deleteSelection(selectionId);
      await fetchData();
    } catch (error: any) {
      alert(`Failed to remove: ${error.message || 'Please try again.'}`);
    }
  };

  const totalCartAmount = userSelections.reduce((sum, sel) => sum + sel.total_price, 0);
  const cartItemCount = userSelections.reduce((sum, sel) => sum + sel.quantity, 0);

  const categories = ['all', 'beer', 'whiskey', 'vodka', 'rum', 'wine', 'cocktail', 'soft_drink'];
  const filteredBrands = selectedCategory === 'all' 
    ? drinkBrands 
    : drinkBrands.filter(b => b.category === selectedCategory);

  if (loading) {
    return (
      <div className="p-8 text-center min-h-screen flex items-center justify-center">
        <div>
          <Loader2 className="animate-spin mx-auto mb-4" size={32} />
          <p>Loading bar menu...</p>
        </div>
      </div>
    );
  }

  if (!spot) {
    return (
      <Card>
        <p className="text-center text-gray-400">No upcoming spot available.</p>
      </Card>
    );
  }

  if (!isPaid) {
    return (
      <div className="space-y-6 pb-20 max-w-6xl mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold">Bar Menu</h1>
        <Card className="p-8 text-center">
          <p className="text-gray-400 mb-4">You need to complete payment first to access the bar.</p>
          <Button onClick={() => window.location.href = '/dashboard/payment'}>Go to Payment</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-24 max-w-7xl mx-auto px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">🍺 Bar Menu</h1>
          <p className="text-sm text-zinc-400 mt-1">Choose your drinks and build your order</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setActiveTab('cart')} 
            variant="secondary"
            className="relative"
          >
            <ShoppingCart size={16} className="mr-2" />
            Cart
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </Button>
          <Button onClick={() => setIsCigaretteModalOpen(true)} variant="secondary">
            <Camera size={16} className="mr-2" />
            Add Cigarette
          </Button>
          <Button onClick={() => setIsDrinkModalOpen(true)}>
            <Plus size={16} className="mr-2" />
            Suggest Drink
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: 'catalog', label: '📋 Catalog', icon: Wine },
          { id: 'suggestions', label: '💡 Suggestions', icon: ThumbsUp },
          { id: 'cigarettes', label: '🚬 Cigarettes', icon: Camera },
          { id: 'cart', label: '🛒 My Order', icon: ShoppingCart },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <tab.icon size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Catalog Tab */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Drink Brands Grid */}
          {filteredBrands.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-400">No drinks available in this category.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredBrands.map(brand => {
                const existingSelection = userSelections.find(s => s.drink_brand_id === brand.id);
                const quantity = existingSelection?.quantity || 0;

                return (
                  <Card key={brand.id} className="p-4 hover:border-indigo-500/50 transition-colors">
                    <div className="relative mb-3">
                      {brand.image_url ? (
                        <img
                          src={brand.image_url}
                          alt={brand.name}
                          className="w-full h-32 object-cover rounded-lg"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-32 bg-zinc-800 rounded-lg flex items-center justify-center">
                          <Wine size={32} className="text-zinc-500" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mb-1 line-clamp-1">{brand.name}</h3>
                    <p className="text-xs text-zinc-400 mb-2 line-clamp-1">{brand.description}</p>
                    <p className="text-lg font-bold text-indigo-400 mb-3">₹{brand.base_price}</p>
                    
                    {quantity > 0 ? (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleUpdateQuantity(existingSelection!, quantity - 1)}
                          className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-bold text-sm">{quantity}</span>
                        <button
                          onClick={() => handleUpdateQuantity(existingSelection!, quantity + 1)}
                          className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleAddToCart(brand, 1)}
                        className="w-full text-xs py-2"
                        size="sm"
                      >
                        <Plus size={12} className="mr-1" />
                        Add
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <div>
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
                      onClick={() => drinkService.deleteDrink(drink.id).then(() => fetchData())}
                      className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{drink.name}</h3>
                  {drink.profiles && (
                    <p className="text-sm text-zinc-400 mb-4">Suggested by {drink.profiles.name}</p>
                  )}
                  <button
                    onClick={() => {
                      const userId = getUserIdAsUUID(profile!.id);
                      drinkService.voteForDrink(drink.id, userId as any).then(() => fetchData());
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      userVotedDrinks.has(drink.id)
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <ThumbsUp size={16} />
                    <span>{drink.votes}</span>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cigarettes Tab */}
      {activeTab === 'cigarettes' && (
        <div>
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
                      onClick={() => cigaretteService.deleteCigarette(cigarette.id).then(() => fetchData())}
                      className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {cigarette.profiles && (
                    <p className="text-xs text-zinc-400 mt-2 text-center">Added by {cigarette.profiles.name}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cart Tab */}
      {activeTab === 'cart' && (
        <div className="space-y-4">
          {userSelections.length === 0 ? (
            <Card className="p-8 text-center">
              <ShoppingCart size={48} className="mx-auto mb-4 text-zinc-500" />
              <p className="text-gray-400 mb-2">Your cart is empty</p>
              <p className="text-sm text-gray-500">Browse the catalog and add drinks to your order!</p>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {userSelections.map(selection => (
                  <Card key={selection.id} className="p-4">
                    <div className="flex items-center gap-4">
                      {selection.drink_brand?.image_url ? (
                        <img
                          src={selection.drink_brand.image_url}
                          alt={selection.drink_brand.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                          <Wine size={24} className="text-zinc-500" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold">{selection.drink_brand?.name}</h3>
                        <p className="text-sm text-zinc-400">₹{selection.unit_price} each</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleUpdateQuantity(selection, selection.quantity - 1)}
                          className="p-2 bg-zinc-800 rounded hover:bg-zinc-700"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="font-bold w-8 text-center">{selection.quantity}</span>
                        <button
                          onClick={() => handleUpdateQuantity(selection, selection.quantity + 1)}
                          className="p-2 bg-zinc-800 rounded hover:bg-zinc-700"
                        >
                          <Plus size={16} />
                        </button>
                        <span className="font-bold text-lg w-20 text-right">₹{selection.total_price}</span>
                        <button
                          onClick={() => handleRemoveSelection(selection.id)}
                          className="p-2 text-red-400 hover:bg-red-400/10 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <Card className="p-6 bg-gradient-to-r from-indigo-600 to-purple-600">
                <div className="flex justify-between items-center text-white">
                  <div>
                    <p className="text-sm opacity-90">Total Amount</p>
                    <p className="text-3xl font-bold">₹{totalCartAmount.toFixed(2)}</p>
                    <p className="text-xs opacity-75 mt-1">{cartItemCount} item(s)</p>
                  </div>
                  <Check size={32} className="opacity-80" />
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modals remain the same as before */}
      {/* ... (keeping existing modal code) ... */}
    </div>
  );
};

export default DrinksPage;
