import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { UserRole, Spot, Drink, PaymentStatus, Cigarette, Food, DrinkBrand, UserDrinkSelection } from "../types";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Modal from "../components/common/Modal";
import Input from "../components/common/Input";
import { spotService, paymentService, drinkService, cigaretteService, foodService, drinkBrandService, userDrinkSelectionService } from "../services/database";
import { supabase } from "../services/supabase";
import { Plus, ThumbsUp, Trash2, Loader2, Image as ImageIcon, X, Camera, ShoppingCart, Minus, Check, Wine, Search, Menu, ArrowLeft, Star, Edit, Utensils } from "lucide-react";

const DrinksPage: React.FC = () => {
  const { profile } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cigarettes, setCigarettes] = useState<Cigarette[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [drinkBrands, setDrinkBrands] = useState<DrinkBrand[]>([]);
  const [userSelections, setUserSelections] = useState<UserDrinkSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  
  // UI State
  const [activeSection, setActiveSection] = useState<'browse' | 'checkout' | 'detail'>('browse');
  const [activeType, setActiveType] = useState<'drinks' | 'food' | 'cigarette'>('drinks');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<DrinkBrand | Drink | Cigarette | Food | null>(null);
  const [orderComment, setOrderComment] = useState("");
  
  // Modals
  const [isDrinkModalOpen, setIsDrinkModalOpen] = useState(false);
  const [isCigaretteModalOpen, setIsCigaretteModalOpen] = useState(false);
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Drink | Cigarette | Food | null>(null);
  const [newDrinkName, setNewDrinkName] = useState("");
  const [newDrinkImage, setNewDrinkImage] = useState("");
  const [newDrinkImagePreview, setNewDrinkImagePreview] = useState<string | null>(null);
  const [newCigaretteImage, setNewCigaretteImage] = useState<string | null>(null);
  const [newCigaretteImagePreview, setNewCigaretteImagePreview] = useState<string | null>(null);
  const [newCigaretteName, setNewCigaretteName] = useState("");
  const [newFoodName, setNewFoodName] = useState("");
  const [newFoodImage, setNewFoodImage] = useState<string | null>(null);
  const [newFoodImagePreview, setNewFoodImagePreview] = useState<string | null>(null);
  const [userVotedDrinks, setUserVotedDrinks] = useState<Set<string>>(new Set());
  const drinkImageInputRef = useRef<HTMLInputElement>(null);
  const cigaretteImageInputRef = useRef<HTMLInputElement>(null);
  const foodImageInputRef = useRef<HTMLInputElement>(null);
  
  // Admin price editing
  const [editingPriceItem, setEditingPriceItem] = useState<{ type: 'drink' | 'food' | 'cigarette'; id: string } | null>(null);
  const [priceInput, setPriceInput] = useState("");
  
  const isAdmin = profile?.role === UserRole.ADMIN;

  // Helper function to get UUID from profile ID
  const getUserIdAsUUID = useCallback(async (profileId: string): Promise<string> => {
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
    return profileId;
  }, [profile]);

  const fetchData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    
    try {
      setPageError(null);
      const spotData = await spotService.getUpcomingSpot();
      setSpot(spotData);

      if (spotData) {
        let userId: string;
        try {
          userId = await getUserIdAsUUID(profile.id);
        } catch (err) {
          console.error('Error getting user UUID:', err);
          userId = profile.id;
        }

        const payments = await paymentService.getPayments(spotData.id);
        const userPayment = payments.find((p) => p.user_id === userId);
        const paidStatus = userPayment?.status === PaymentStatus.PAID;
        setIsPaid(paidStatus);

        if (paidStatus) {
          try {
            const [drinksData, cigarettesData, brandsData, selectionsData] = await Promise.all([
              drinkService.getDrinks(spotData.id).catch((err) => {
                console.error('Error fetching drinks:', err);
                return [];
              }),
              cigaretteService.getCigarettes(spotData.id).catch((err) => {
                console.error('Error fetching cigarettes:', err);
                return [];
              }),
              drinkBrandService.getDrinkBrands().catch((err) => {
                console.error('Error fetching drink brands:', err);
                return [];
              }),
              userDrinkSelectionService.getUserSelections(spotData.id, userId).catch((err) => {
                console.error('Error fetching selections:', err);
                return [];
              }),
            ]);
            setDrinks(drinksData || []);
            setCigarettes(cigarettesData || []);
            setDrinkBrands(brandsData || []);
            setUserSelections(selectionsData || []);
          } catch (fetchError: any) {
            console.error('Error fetching data:', fetchError);
            setDrinks([]);
            setCigarettes([]);
            setFoods([]);
            setDrinkBrands([]);
            setUserSelections([]);
            setPageError(fetchError.message || 'Error loading drinks data. Please try again.');
          }
        } else {
          setDrinks([]);
          setCigarettes([]);
          setFoods([]);
          setDrinkBrands([]);
          setUserSelections([]);
        }
      } else {
        setDrinks([]);
        setIsPaid(false);
      }
    } catch (error: any) {
      console.error("Error loading drinks data:", error);
      setDrinks([]);
      setCigarettes([]);
      setFoods([]);
      setDrinkBrands([]);
      setUserSelections([]);
      setIsPaid(false);
      
      if (error.message?.includes('does not exist') || 
          error.message?.includes('relation') ||
          error.code === '42P01') {
        setPageError('Database tables not found. Please run migration SQL files in Supabase.');
      } else {
        setPageError(error.message || 'Something went wrong while loading drinks section.');
      }
    } finally {
      setLoading(false);
    }
  }, [profile, getUserIdAsUUID]);

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

  // Update voted drinks - MUST be before conditional returns
  useEffect(() => {
    const updateVotedDrinks = async () => {
      if (!profile || drinks.length === 0) {
        setUserVotedDrinks(new Set());
        return;
      }
      try {
        const userId = await getUserIdAsUUID(profile.id);
        const voted = new Set(
          drinks
            .filter(d => d && d.voted_by && Array.isArray(d.voted_by) && d.voted_by.includes(userId))
            .map(d => d.id)
        );
        setUserVotedDrinks(voted);
      } catch (err) {
        console.error('Error updating voted drinks:', err);
        setUserVotedDrinks(new Set());
      }
    };
    if (profile) {
      updateVotedDrinks();
    }
  }, [drinks, profile, getUserIdAsUUID]);

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

  const handleFoodImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setNewFoodImagePreview(result);
        setNewFoodImage(result);
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
      console.error('Error adding drink:', error);
      alert(`Failed to add drink: ${error.message || 'Please try again.'}`);
    }
  };

  const handleAddCigarette = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spot || !profile || !newCigaretteImage || !newCigaretteName.trim()) {
      alert('Please provide both cigarette name and image');
      return;
    }

    try {
      const userId = await getUserIdAsUUID(profile.id);
      await cigaretteService.createCigarette({
        spot_id: spot.id,
        name: newCigaretteName.trim(),
        image_url: newCigaretteImage,
        added_by: userId,
      });
      setNewCigaretteImage(null);
      setNewCigaretteImagePreview(null);
      setNewCigaretteName("");
      setIsCigaretteModalOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('Error adding cigarette:', error);
      alert(`Failed to add cigarette: ${error.message || 'Please try again.'}`);
    }
  };

  const handleAddFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spot || !profile || !newFoodImage || !newFoodName.trim()) return;

    try {
      const userId = await getUserIdAsUUID(profile.id);
      await foodService.createFood({
        spot_id: spot.id,
        name: newFoodName.trim(),
        image_url: newFoodImage,
        added_by: userId,
      });
      setNewFoodImage(null);
      setNewFoodImagePreview(null);
      setNewFoodName("");
      setIsFoodModalOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('Error adding food:', error);
      alert(`Failed to add food: ${error.message || 'Please try again.'}`);
    }
  };

  const handleDeleteFood = async (foodId: string) => {
    if (!foodId || !confirm("Are you sure you want to delete this food?")) return;

    try {
      await foodService.deleteFood(foodId);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting food:', error);
      alert(`Failed to delete food: ${error.message || 'Please try again.'}`);
    }
  };

  const handleEditItem = (item: Drink | Cigarette | Food) => {
    setEditingItem(item);
    if ('votes' in item) {
      // It's a Drink
      setNewDrinkName(item.name);
      setNewDrinkImage(item.image_url);
      setNewDrinkImagePreview(item.image_url || null);
    } else if ('name' in item && 'added_by' in item) {
      if ('spot_id' in item && !('suggested_by' in item)) {
        // It's Food
        setNewFoodName(item.name);
        setNewFoodImage(item.image_url);
        setNewFoodImagePreview(item.image_url);
      } else {
        // It's Cigarette
        setNewCigaretteName(item.name);
        setNewCigaretteImage(item.image_url);
        setNewCigaretteImagePreview(item.image_url);
      }
    }
    setIsEditModalOpen(true);
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !profile) return;

    try {
      if ('votes' in editingItem) {
        // Update Drink
        await drinkService.updateDrink(editingItem.id, {
          name: newDrinkName.trim(),
          image_url: newDrinkImage || undefined,
        });
      } else if ('name' in editingItem && 'added_by' in editingItem) {
        // Check if it's Food or Cigarette by checking if it has suggested_by (Drink) or not
        if ('suggested_by' in editingItem) {
          // This shouldn't happen, but handle it
        } else {
          // It's either Food or Cigarette - check by trying to update as Food first
          const item = editingItem as Food | Cigarette;
          if (newFoodName && newFoodImage) {
            // Update Food
            await foodService.updateFood(item.id, {
              name: newFoodName.trim(),
              image_url: newFoodImage || undefined,
            });
          } else if (newCigaretteName || newCigaretteImage) {
            // Update Cigarette
            await cigaretteService.updateCigarette(item.id, {
              name: newCigaretteName.trim(),
              image_url: newCigaretteImage || undefined,
            });
          }
        }
      }
      
      // Reset form
      setEditingItem(null);
      setIsEditModalOpen(false);
      setNewDrinkName("");
      setNewDrinkImage("");
      setNewDrinkImagePreview(null);
      setNewCigaretteImage(null);
      setNewCigaretteImagePreview(null);
      setNewCigaretteName("");
      setNewFoodName("");
      setNewFoodImage(null);
      setNewFoodImagePreview(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error updating item:', error);
      alert(`Failed to update: ${error.message || 'Please try again.'}`);
    }
  };

  const isUserOwner = (item: Drink | Cigarette | Food): boolean => {
    if (!profile) return false;
    const userId = profile.id;
    if ('suggested_by' in item) return item.suggested_by === userId;
    if ('added_by' in item) return item.added_by === userId;
    return false;
  };

  const handleDeleteCigarette = async (cigaretteId: string) => {
    if (!cigaretteId || !confirm("Are you sure you want to delete this cigarette?")) return;

    try {
      await cigaretteService.deleteCigarette(cigaretteId);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting cigarette:', error);
      alert(`Failed to delete cigarette: ${error.message || 'Please try again.'}`);
    }
  };

  const handleVote = async (drinkId: string) => {
    if (!profile || !drinkId) return;

    try {
      const userId = await getUserIdAsUUID(profile.id);
      await drinkService.voteForDrink(drinkId, userId);
      await fetchData();
    } catch (error: any) {
      console.error('Error voting:', error);
      alert(`Failed to vote: ${error.message || 'Please try again.'}`);
    }
  };

  const handleDeleteDrink = async (drinkId: string) => {
    if (!drinkId || !confirm("Are you sure you want to delete this drink?")) return;

    try {
      await drinkService.deleteDrink(drinkId);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting drink:', error);
      alert(`Failed to delete drink: ${error.message || 'Please try again.'}`);
    }
  };

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
      console.error('Error adding to cart:', error);
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
      console.error('Error removing selection:', error);
      alert(`Failed to remove: ${error.message || 'Please try again.'}`);
    }
  };

  const handleProductClick = (product: DrinkBrand | Drink | Cigarette) => {
    setSelectedProduct(product);
    setActiveSection('detail');
  };

  const handlePayNow = async () => {
    // Handle payment logic here
    alert('Payment functionality will be integrated here');
  };

  const handleUpdatePrice = async (itemId: string, type: 'drink' | 'food' | 'cigarette', price: number) => {
    if (!isAdmin) return;
    
    try {
      if (type === 'drink') {
        await drinkService.updateDrink(itemId, { price });
      } else if (type === 'food') {
        await foodService.updateFood(itemId, { price });
      } else if (type === 'cigarette') {
        await cigaretteService.updateCigarette(itemId, { price });
      }
      setEditingPriceItem(null);
      setPriceInput("");
      await fetchData();
    } catch (error: any) {
      console.error('Error updating price:', error);
      // Check if error is about missing column
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        alert('Price column not found. Please run the migration: supabase_migration_prices.sql in your Supabase SQL Editor.');
      } else {
        alert(`Failed to update price: ${error.message || 'Please try again.'}`);
      }
    }
  };

  const totalCartAmount = userSelections.reduce((sum, sel) => sum + sel.total_price, 0);
  const cartItemCount = userSelections.reduce((sum, sel) => sum + sel.quantity, 0);

  const categories = ['all', 'wine', 'beer', 'spirits'];
  const filteredBrands = selectedCategory === 'all' 
    ? drinkBrands.filter(b => activeType === 'drinks' && b.category !== 'soft_drink')
    : drinkBrands.filter(b => {
        if (activeType !== 'drinks') return false;
        const categoryMap: Record<string, string[]> = {
          'wine': ['wine'],
          'beer': ['beer'],
          'spirits': ['whiskey', 'vodka', 'rum', 'cocktail']
        };
        return categoryMap[selectedCategory]?.includes(b.category) || false;
      });

  // Filter by search query
  const searchFilteredBrands = filteredBrands.filter(brand => 
    brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brand.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasUserVoted = (drink: Drink) => {
    if (!drink || !drink.id) return false;
    return userVotedDrinks.has(drink.id);
  };

  // Safety check: don't render if profile is not available yet
  if (!profile) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="animate-spin mx-auto mb-4" size={32} />
        <p>Loading user data...</p>
      </div>
    );
  }

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

  if (pageError) {
    return (
      <div className="p-8 text-center">
        <Card className="p-8 max-w-2xl mx-auto">
          <div className="mb-4">
            <span className="text-6xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold mb-4 text-red-400">Drinks Section Error</h2>
          <p className="text-gray-300 mb-6 whitespace-pre-line">{pageError}</p>
          <div className="space-y-3">
            <Button onClick={() => {
              setPageError(null);
              fetchData();
            }}>
              Try Again
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => window.location.reload()}
              className="ml-2"
            >
              Refresh Page
            </Button>
          </div>
        </Card>
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

  // BROWSE / MENU SECTION
  if (activeSection === 'browse') {
    return (
      <div className="min-h-screen bg-black text-white pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-400">{spot.location}</span>
              <span className="text-zinc-600">•••</span>
              <span className="text-sm font-medium text-zinc-400">12 Bar</span>
            </div>
            <button className="p-2 hover:bg-zinc-900 rounded-lg">
              <Menu size={20} />
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-bold">What Would You Like?</h1>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Type Toggle Pills */}
          <div className="flex gap-2">
            {(['drinks', 'food', 'cigarette'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={`px-6 py-2 rounded-full font-medium transition-colors ${
                  activeType === type
                    ? 'bg-white text-black'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Category Tabs */}
          {activeType === 'drinks' && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Admin View - Grouped by Username */}
          {isAdmin && (
            <div className="space-y-6">
              {activeType === 'drinks' && (
                <div className="space-y-4">
                  {(() => {
                    // Group drinks by username
                    const groupedByUser: Record<string, Drink[]> = {};
                    drinks.forEach(drink => {
                      const username = drink.profiles?.name || 'Unknown';
                      if (!groupedByUser[username]) groupedByUser[username] = [];
                      groupedByUser[username].push(drink);
                    });
                    
                    return Object.entries(groupedByUser).map(([username, userDrinks]) => (
                      <div key={username} className="space-y-2">
                        <h3 className="text-lg font-semibold text-zinc-300">{username}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {userDrinks.map(drink => (
                            <Card key={drink.id} className="p-4 bg-zinc-900 border-zinc-800">
                              <div className="relative mb-3">
                                {drink.image_url ? (
                                  <img src={drink.image_url} alt={drink.name} className="w-full h-32 object-cover rounded-lg" />
                                ) : (
                                  <div className="w-full h-32 bg-zinc-800 rounded-lg flex items-center justify-center">
                                    <Wine size={32} className="text-zinc-500" />
                                  </div>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm mb-2">{drink.name}</h3>
                              {editingPriceItem?.id === drink.id && editingPriceItem?.type === 'drink' ? (
                                <div className="flex gap-2">
                                  <Input
                                    label=""
                                    type="number"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    placeholder="Price"
                                    className="text-sm"
                                  />
                                  <button
                                    onClick={() => handleUpdatePrice(drink.id, 'drink', parseFloat(priceInput))}
                                    className="px-3 py-1 bg-indigo-600 rounded text-sm"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">{drink.price ? `₹${drink.price}` : 'No price'}</span>
                                  <button
                                    onClick={() => {
                                      setEditingPriceItem({ type: 'drink', id: drink.id });
                                      setPriceInput(drink.price?.toString() || '');
                                    }}
                                    className="text-indigo-400 text-sm hover:text-indigo-300"
                                  >
                                    Set Price
                                  </button>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
              
              {activeType === 'food' && (
                <div className="space-y-4">
                  {(() => {
                    const groupedByUser: Record<string, Food[]> = {};
                    foods.forEach(food => {
                      const username = food.profiles?.name || 'Unknown';
                      if (!groupedByUser[username]) groupedByUser[username] = [];
                      groupedByUser[username].push(food);
                    });
                    
                    return Object.entries(groupedByUser).map(([username, userFoods]) => (
                      <div key={username} className="space-y-2">
                        <h3 className="text-lg font-semibold text-zinc-300">{username}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {userFoods.map(food => (
                            <Card key={food.id} className="p-4 bg-zinc-900 border-zinc-800">
                              <div className="relative mb-3">
                                {food.image_url ? (
                                  <img src={food.image_url} alt={food.name} className="w-full h-32 object-cover rounded-lg" />
                                ) : (
                                  <div className="w-full h-32 bg-zinc-800 rounded-lg flex items-center justify-center">
                                    <Utensils size={32} className="text-zinc-500" />
                                  </div>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm mb-2">
                                {food.image_url?.includes('/images/food/') 
                                  ? food.image_url.split('/').pop()?.replace(/\.[^/.]+$/, '') || food.name
                                  : food.name}
                              </h3>
                              {editingPriceItem?.id === food.id && editingPriceItem?.type === 'food' ? (
                                <div className="flex gap-2">
                                  <Input
                                    label=""
                                    type="number"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    placeholder="Price"
                                    className="text-sm"
                                  />
                                  <button
                                    onClick={() => handleUpdatePrice(food.id, 'food', parseFloat(priceInput))}
                                    className="px-3 py-1 bg-indigo-600 rounded text-sm"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">{food.price ? `₹${food.price}` : 'No price'}</span>
                                  <button
                                    onClick={() => {
                                      setEditingPriceItem({ type: 'food', id: food.id });
                                      setPriceInput(food.price?.toString() || '');
                                    }}
                                    className="text-indigo-400 text-sm hover:text-indigo-300"
                                  >
                                    Set Price
                                  </button>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
              
              {activeType === 'cigarette' && (
                <div className="space-y-4">
                  {(() => {
                    const groupedByUser: Record<string, Cigarette[]> = {};
                    cigarettes.forEach(cig => {
                      const username = cig.profiles?.name || 'Unknown';
                      if (!groupedByUser[username]) groupedByUser[username] = [];
                      groupedByUser[username].push(cig);
                    });
                    
                    return Object.entries(groupedByUser).map(([username, userCigs]) => (
                      <div key={username} className="space-y-2">
                        <h3 className="text-lg font-semibold text-zinc-300">{username}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {userCigs.map(cig => (
                            <Card key={cig.id} className="p-4 bg-zinc-900 border-zinc-800">
                              <div className="relative mb-3">
                                {cig.image_url ? (
                                  <img src={cig.image_url} alt={cig.name} className="w-full h-32 object-cover rounded-lg" />
                                ) : (
                                  <div className="w-full h-32 bg-zinc-800 rounded-lg flex items-center justify-center">
                                    <Camera size={32} className="text-zinc-500" />
                                  </div>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm mb-2">{cig.name || 'Cigarette Pack'}</h3>
                              {editingPriceItem?.id === cig.id && editingPriceItem?.type === 'cigarette' ? (
                                <div className="flex gap-2">
                                  <Input
                                    label=""
                                    type="number"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    placeholder="Price"
                                    className="text-sm"
                                  />
                                  <button
                                    onClick={() => handleUpdatePrice(cig.id, 'cigarette', parseFloat(priceInput))}
                                    className="px-3 py-1 bg-indigo-600 rounded text-sm"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">{cig.price ? `₹${cig.price}` : 'No price'}</span>
                                  <button
                                    onClick={() => {
                                      setEditingPriceItem({ type: 'cigarette', id: cig.id });
                                      setPriceInput(cig.price?.toString() || '');
                                    }}
                                    className="text-indigo-400 text-sm hover:text-indigo-300"
                                  >
                                    Set Price
                                  </button>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}

          {/* User View - Clean, No Prices by Default, Only Show Items with Prices */}
          {!isAdmin && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {activeType === 'drinks' && drinks.filter(d => d.price !== undefined && d.price !== null).map(drink => (
              <div
                key={drink.id}
                onClick={() => handleProductClick(drink)}
                className="cursor-pointer"
              >
                <Card className="p-4 bg-zinc-900 border-zinc-800 hover:border-indigo-500/50 transition-colors">
                  <div className="relative mb-3">
                    {drink.image_url ? (
                      <img src={drink.image_url} alt={drink.name} className="w-full h-32 object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-32 bg-zinc-800 rounded-lg flex items-center justify-center">
                        <Wine size={32} className="text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm mb-1 line-clamp-1">{drink.name}</h3>
                  <p className="text-sm text-indigo-400">₹{drink.price}</p>
                </Card>
              </div>
            ))}
            
            {activeType === 'drinks' && drinks.filter(d => d.price !== undefined && d.price !== null).length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-zinc-400">No drinks available. Add drinks to get started!</p>
              </div>
            )}

            {activeType === 'cigarette' && cigarettes.filter(c => c && c.id && c.image_url && (isAdmin || (c.price !== undefined && c.price !== null))).map((cigarette) => (
              <div
                key={cigarette.id}
                onClick={() => handleProductClick(cigarette)}
                className="cursor-pointer"
              >
                <Card 
                  className="p-4 bg-zinc-900 border-zinc-800 hover:border-indigo-500/50 transition-colors"
                >
                  <div className="relative mb-3">
                    <img
                      src={cigarette.image_url}
                      alt="Cigarette"
                      className="w-full h-32 object-cover rounded-lg"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  <h3 className="font-semibold text-sm mb-1 line-clamp-1">{cigarette.name || 'Cigarette Pack'}</h3>
                  {cigarette.price && <p className="text-sm text-indigo-400">₹{cigarette.price}</p>}
                </Card>
              </div>
            ))}

            {activeType === 'food' && foods.filter(f => f && f.id && f.image_url && (isAdmin || (f.price !== undefined && f.price !== null))).map((food) => (
              <div
                key={food.id}
                onClick={() => handleProductClick(food)}
                className="cursor-pointer"
              >
                <Card 
                  className="p-4 bg-zinc-900 border-zinc-800 hover:border-indigo-500/50 transition-colors"
                >
                  <div className="relative mb-3">
                    <img
                      src={food.image_url}
                      alt={food.name}
                      className="w-full h-32 object-cover rounded-lg"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                    {food.image_url?.includes('/images/food/') 
                      ? food.image_url.split('/').pop()?.replace(/\.[^/.]+$/, '') || food.name
                      : food.name}
                  </h3>
                  {food.price && <p className="text-sm text-indigo-400">₹{food.price}</p>}
                </Card>
              </div>
            ))}
            
            {activeType === 'cigarette' && cigarettes.filter(c => c && c.id && c.image_url && (isAdmin || (c.price !== undefined && c.price !== null))).length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-zinc-400">No cigarettes available. Add cigarettes to get started!</p>
              </div>
            )}
            
            {activeType === 'food' && foods.filter(f => f && f.id && f.image_url && (isAdmin || (f.price !== undefined && f.price !== null))).length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-zinc-400">No food available. Add food to get started!</p>
              </div>
            )}
          </div>
          )}

          {/* Bottom Action Button */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20">
            {activeType === 'drinks' && (
              <Button
                onClick={() => setIsDrinkModalOpen(true)}
                className="shadow-lg px-8 py-3"
              >
                <Plus size={20} className="mr-2" />
                Add Drinks
              </Button>
            )}
            {activeType === 'food' && (
              <Button
                onClick={() => setIsFoodModalOpen(true)}
                className="shadow-lg px-8 py-3"
              >
                <Utensils size={20} className="mr-2" />
                Add Food
              </Button>
            )}
            {activeType === 'cigarette' && (
              <Button
                onClick={() => setIsCigaretteModalOpen(true)}
                className="shadow-lg px-8 py-3"
              >
                <Camera size={20} className="mr-2" />
                Add Cigarette
              </Button>
            )}
          </div>
          
          {/* Cart Button */}
          {cartItemCount > 0 && (
            <div className="fixed bottom-4 right-4 z-20">
              <Button
                onClick={() => setActiveSection('checkout')}
                className="relative shadow-lg"
              >
                <ShoppingCart size={20} className="mr-2" />
                Cart
                <span className="ml-2 bg-white text-black px-2 py-0.5 rounded-full text-xs font-bold">
                  {cartItemCount}
                </span>
              </Button>
            </div>
          )}
        </div>

        {/* Modals */}
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
              
              {/* Default Drink Images */}
              <div className="mt-4">
                <p className="text-sm text-zinc-400 mb-2">Or select from default images:</p>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {['bacardihot.jfif', 'brocodebeer.jfif', 'budvisorbeer.jfif', 'junohot.jfif', 'kingfisherbeer.jfif', 'Mansionhousehot.jfif', 'omhot.jfif', 'simbabeer.jfif', 'tuborgbeer.jpg'].map((imgName) => (
                    <button
                      key={imgName}
                      type="button"
                      onClick={() => {
                        const imagePath = `/images/drinks/${imgName}`;
                        setNewDrinkImage(imagePath);
                        setNewDrinkImagePreview(imagePath);
                        // Set drink name from image name (remove extension and clean up)
                        const drinkName = imgName.replace(/\.[^/.]+$/, '').replace(/([A-Z])/g, ' $1').trim();
                        setNewDrinkName(drinkName);
                      }}
                      className="relative aspect-square border-2 border-zinc-700 rounded-lg overflow-hidden hover:border-indigo-500 transition-colors"
                    >
                      <img 
                        src={`/images/drinks/${imgName}`} 
                        alt={imgName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
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

        <Modal
          isOpen={isCigaretteModalOpen}
          onClose={() => {
            setIsCigaretteModalOpen(false);
            setNewCigaretteImage(null);
            setNewCigaretteImagePreview(null);
            setNewCigaretteName("");
          }}
          title="Add Cigarette"
        >
          <form onSubmit={handleAddCigarette} className="space-y-4">
            <Input
              label="Cigarette Name"
              value={newCigaretteName}
              onChange={(e) => setNewCigaretteName(e.target.value)}
              placeholder="e.g., Marlboro, Gold Flake, etc."
              required
            />
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
              
              {/* Default Cigarette Images */}
              <div className="mt-4">
                <p className="text-sm text-zinc-400 mb-2">Or select from default images:</p>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {['bdsoundar.jfif', 'classic.jfif', 'connect.jfif', 'lights.jfif', 'malboro.jpg', 'Small.jfif'].map((imgName) => (
                    <button
                      key={imgName}
                      type="button"
                      onClick={() => {
                        const imagePath = `/images/cigrette/${imgName}`;
                        setNewCigaretteImage(imagePath);
                        setNewCigaretteImagePreview(imagePath);
                        // Set cigarette name from image name (remove extension and clean up)
                        const cigName = imgName.replace(/\.[^/.]+$/, '').replace(/([A-Z])/g, ' $1').trim();
                        setNewCigaretteName(cigName);
                      }}
                      className="relative aspect-square border-2 border-zinc-700 rounded-lg overflow-hidden hover:border-indigo-500 transition-colors"
                    >
                      <img 
                        src={`/images/cigrette/${imgName}`} 
                        alt={imgName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={!newCigaretteImage || !newCigaretteName.trim()}>
                Add Cigarette
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsCigaretteModalOpen(false);
                  setNewCigaretteImage(null);
                  setNewCigaretteImagePreview(null);
                  setNewCigaretteName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isFoodModalOpen}
          onClose={() => {
            setIsFoodModalOpen(false);
            setNewFoodImage(null);
            setNewFoodImagePreview(null);
            setNewFoodName("");
          }}
          title="Add Food"
        >
          <form onSubmit={handleAddFood} className="space-y-4">
            <Input
              label="Food Name"
              value={newFoodName}
              onChange={(e) => setNewFoodName(e.target.value)}
              placeholder="e.g., Biryani, Parotta, etc."
              required
            />
            
            <div>
              <label className="block text-sm font-medium mb-2">Food Image</label>
              {newFoodImagePreview ? (
                <div className="relative">
                  <img src={newFoodImagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg mb-2" />
                  <button
                    type="button"
                    onClick={() => {
                      setNewFoodImagePreview(null);
                      setNewFoodImage(null);
                      if (foodImageInputRef.current) foodImageInputRef.current.value = '';
                    }}
                    className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => foodImageInputRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors"
                >
                  <ImageIcon size={32} className="text-zinc-500 mb-2" />
                  <p className="text-sm text-zinc-400">Click to upload image</p>
                </div>
              )}
              <input
                ref={foodImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleFoodImageUpload}
                className="hidden"
              />
              <Input
                label="Or Image URL (Optional)"
                value={newFoodImage && !newFoodImagePreview ? newFoodImage : ''}
                onChange={(e) => setNewFoodImage(e.target.value)}
                placeholder="https://example.com/food-image.jpg"
                className="mt-2"
              />
              
              {/* Default Food Images */}
              <div className="mt-4">
                <p className="text-sm text-zinc-400 mb-2">Or select from default images:</p>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {['Aachi Oorugai.jfif', 'Beef Biriyani.jfif', 'Chicken kabab.jfif', 'Lays.jfif', 'Parotta.jfif'].map((imgName) => (
                    <button
                      key={imgName}
                      type="button"
                      onClick={() => {
                        const imagePath = `/images/food/${imgName}`;
                        setNewFoodImage(imagePath);
                        setNewFoodImagePreview(imagePath);
                        // Set food name from image name (remove extension)
                        const dishName = imgName.replace(/\.[^/.]+$/, '');
                        setNewFoodName(dishName);
                      }}
                      className="relative aspect-square border-2 border-zinc-700 rounded-lg overflow-hidden hover:border-indigo-500 transition-colors"
                    >
                      <img 
                        src={`/images/food/${imgName}`} 
                        alt={imgName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={!newFoodImage || !newFoodName.trim()}>
                Add Food
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsFoodModalOpen(false);
                  setNewFoodImage(null);
                  setNewFoodImagePreview(null);
                  setNewFoodName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // CHECKOUT SECTION
  if (activeSection === 'checkout') {
    return (
      <div className="min-h-screen bg-black text-white pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <button 
              onClick={() => setActiveSection('browse')}
              className="p-2 hover:bg-zinc-900 rounded-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-400">{spot.location}</span>
              <span className="text-zinc-600">•••</span>
              <span className="text-sm font-medium text-zinc-400">12 Bar</span>
            </div>
            <button className="p-2 hover:bg-zinc-900 rounded-lg">
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-6">Checkout</h1>

          {/* Order List */}
          <div className="space-y-4 mb-6">
            {userSelections.map(selection => (
              <Card key={selection.id} className="p-4 bg-zinc-900 border-zinc-800">
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

          {/* Comment Field */}
          <div className="mb-6">
            <Input
              label="Comment on the order:"
              value={orderComment}
              onChange={(e) => setOrderComment(e.target.value)}
              placeholder="No Comment"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          {/* Total Price */}
          <div className="mb-6">
            <div className="flex justify-between items-center p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-lg font-semibold">Total price</span>
              <span className="text-2xl font-bold text-indigo-400">₹{totalCartAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Pay Now Button */}
          <Button
            onClick={handlePayNow}
            className="w-full py-4 text-lg font-bold bg-black text-white border-2 border-white hover:bg-white hover:text-black transition-colors"
          >
            <ShoppingCart size={20} className="mr-2" />
            Pay Now
          </Button>
        </div>

        {/* Modals */}
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
              
              {/* Default Drink Images */}
              <div className="mt-4">
                <p className="text-sm text-zinc-400 mb-2">Or select from default images:</p>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {['bacardihot.jfif', 'brocodebeer.jfif', 'budvisorbeer.jfif', 'junohot.jfif', 'kingfisherbeer.jfif', 'Mansionhousehot.jfif', 'omhot.jfif', 'simbabeer.jfif', 'tuborgbeer.jpg'].map((imgName) => (
                    <button
                      key={imgName}
                      type="button"
                      onClick={() => {
                        const imagePath = `/images/drinks/${imgName}`;
                        setNewDrinkImage(imagePath);
                        setNewDrinkImagePreview(imagePath);
                        // Set drink name from image name (remove extension and clean up)
                        const drinkName = imgName.replace(/\.[^/.]+$/, '').replace(/([A-Z])/g, ' $1').trim();
                        setNewDrinkName(drinkName);
                      }}
                      className="relative aspect-square border-2 border-zinc-700 rounded-lg overflow-hidden hover:border-indigo-500 transition-colors"
                    >
                      <img 
                        src={`/images/drinks/${imgName}`} 
                        alt={imgName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
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

        <Modal
          isOpen={isCigaretteModalOpen}
          onClose={() => {
            setIsCigaretteModalOpen(false);
            setNewCigaretteImage(null);
            setNewCigaretteImagePreview(null);
            setNewCigaretteName("");
          }}
          title="Add Cigarette"
        >
          <form onSubmit={handleAddCigarette} className="space-y-4">
            <Input
              label="Cigarette Name"
              value={newCigaretteName}
              onChange={(e) => setNewCigaretteName(e.target.value)}
              placeholder="e.g., Marlboro, Gold Flake, etc."
              required
            />
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
              <Button type="submit" className="flex-1" disabled={!newCigaretteImage || !newCigaretteName.trim()}>
                Add Cigarette
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsCigaretteModalOpen(false);
                  setNewCigaretteImage(null);
                  setNewCigaretteImagePreview(null);
                  setNewCigaretteName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // PRODUCT DETAIL SECTION
  if (activeSection === 'detail' && selectedProduct) {
    const isDrinkBrand = 'base_price' in selectedProduct;
    const isDrink = 'votes' in selectedProduct && !isDrinkBrand;
    const isFood = 'name' in selectedProduct && !isDrinkBrand && !isDrink && 'added_by' in selectedProduct;
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [detailQuantity, setDetailQuantity] = useState(1);

    const existingSelection = isDrinkBrand 
      ? userSelections.find(s => s.drink_brand_id === selectedProduct.id)
      : null;

    return (
      <div className="min-h-screen bg-black text-white pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <button 
              onClick={() => setActiveSection('browse')}
              className="p-2 hover:bg-zinc-900 rounded-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <button className="p-2 hover:bg-zinc-900 rounded-lg">
              <Menu size={20} />
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* Product Image */}
          <div className="flex justify-center">
            <div className="w-64 h-64 rounded-full bg-zinc-900 p-8 flex items-center justify-center">
              {isDrinkBrand && (selectedProduct as DrinkBrand).image_url ? (
                <img
                  src={(selectedProduct as DrinkBrand).image_url}
                  alt={(selectedProduct as DrinkBrand).name}
                  className="w-full h-full object-contain"
                />
              ) : isDrink && (selectedProduct as Drink).image_url ? (
                <img
                  src={(selectedProduct as Drink).image_url}
                  alt={(selectedProduct as Drink).name}
                  className="w-full h-full object-contain"
                />
              ) : isFood && (selectedProduct as Food).image_url ? (
                <img
                  src={(selectedProduct as Food).image_url}
                  alt={(selectedProduct as Food).name}
                  className="w-full h-full object-contain"
                />
              ) : (selectedProduct as Cigarette).image_url ? (
                <img
                  src={(selectedProduct as Cigarette).image_url}
                  alt="Cigarette"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Wine size={64} className="text-zinc-500" />
              )}
            </div>
          </div>

          {/* Product Name */}
          <h1 className="text-3xl font-bold text-center">
            {isDrinkBrand 
              ? (selectedProduct as DrinkBrand).name
              : isDrink
              ? (selectedProduct as Drink).name
              : isFood
              ? (selectedProduct as Food).name
              : (selectedProduct as Cigarette).name || 'Cigarette Pack'}
          </h1>

          {/* Price */}
          {isDrinkBrand && (
            <p className="text-2xl font-bold text-center text-indigo-400">
              ₹{(selectedProduct as DrinkBrand).base_price}
            </p>
          )}

          {/* Quantity Stepper */}
          {isDrinkBrand && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 border border-zinc-800"
              >
                <Minus size={20} />
              </button>
              <span className="text-2xl font-bold w-12 text-center">{detailQuantity}</span>
              <button
                onClick={() => setDetailQuantity(detailQuantity + 1)}
                className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 border border-zinc-800"
              >
                <Plus size={20} />
              </button>
            </div>
          )}

          {/* Description */}
          {isDrinkBrand && (selectedProduct as DrinkBrand).description && (
            <div className="space-y-2">
              <p className="text-zinc-400 leading-relaxed">
                {showFullDescription 
                  ? (selectedProduct as DrinkBrand).description
                  : (selectedProduct as DrinkBrand).description?.substring(0, 150)}
                {(selectedProduct as DrinkBrand).description && (selectedProduct as DrinkBrand).description!.length > 150 && !showFullDescription && '...'}
              </p>
              {(selectedProduct as DrinkBrand).description && (selectedProduct as DrinkBrand).description!.length > 150 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                >
                  {showFullDescription ? 'Read less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Ratings / Reviews */}
          <div className="flex items-center gap-2 justify-center">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} size={20} className="text-zinc-600 fill-zinc-600" />
              ))}
            </div>
            <span className="text-zinc-400 text-sm">28 reviews</span>
          </div>

          {/* Add to Cart Button */}
          {isDrinkBrand && (
            <Button
              onClick={() => {
                handleAddToCart(selectedProduct as DrinkBrand, detailQuantity);
                setActiveSection('browse');
              }}
              className="w-full py-4 text-lg font-bold"
            >
              <Plus size={20} className="mr-2" />
              Add to Cart
            </Button>
          )}
        </div>

        {/* Floating Action Buttons */}
        <div className="fixed bottom-4 right-4 z-20 flex gap-2">
          <Button
            onClick={() => setIsCigaretteModalOpen(true)}
            variant="secondary"
            className="shadow-lg"
          >
            <Camera size={16} className="mr-2" />
            Add Cigarette
          </Button>
          <Button
            onClick={() => setIsDrinkModalOpen(true)}
            className="shadow-lg"
          >
            <Plus size={16} className="mr-2" />
            Suggest Drink
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
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
    </>
  );
};

export default DrinksPage;
