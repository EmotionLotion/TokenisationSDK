/**
 * UnifiedMarketplace - Global Exchange
 *
 * A single board showing all tradable assets across verticals:
 * - Tickets (Fly+)
 * - Data Streams (AMS)
 * - Carbon Credits (H2O)
 */

import { useState } from 'react';
import {
  Search, Filter, TrendingUp, TrendingDown, ArrowUpRight, Clock,
  Plane, Droplets, Database, Truck, Zap, Tag, Grid, List,
  ChevronDown, Star, ShoppingCart, Eye
} from 'lucide-react';
import { AhoyTokenSymbol } from './AhoyLogo';

// ============================================================================
// TYPES
// ============================================================================

interface MarketListing {
  id: string;
  name: string;
  description: string;
  category: 'TICKETS' | 'DATA' | 'CREDITS' | 'REPUTATION' | 'PASSES';
  vertical: 'FLYPLUS' | 'AMS' | 'H2O' | 'COMET';
  price: string;
  priceChange: number;
  currency: 'AHOY' | 'USDC' | 'ETH';
  seller: string;
  sellerRating: number;
  quantity: number;
  expiresAt?: string;
  image?: string;
  attributes: Record<string, string>;
  featured?: boolean;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'price-low' | 'price-high' | 'recent' | 'popular';

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_LISTINGS: MarketListing[] = [
  {
    id: 'listing-1',
    name: 'Dubai → London Business Lounge Pass',
    description: 'One-time access to Emirates Business Lounge at DXB T3',
    category: 'PASSES',
    vertical: 'FLYPLUS',
    price: '250',
    priceChange: 5.2,
    currency: 'AHOY',
    seller: 'Fly+ Official',
    sellerRating: 5.0,
    quantity: 15,
    expiresAt: '2024-12-31',
    attributes: {
      'Valid At': 'DXB Terminal 3',
      'Duration': '4 hours',
      'Includes': 'Food, WiFi, Shower',
    },
    featured: true,
  },
  {
    id: 'listing-2',
    name: 'Premium Traffic Prediction API - 30 Days',
    description: 'Real-time traffic predictions for Dubai metropolitan area',
    category: 'DATA',
    vertical: 'AMS',
    price: '1,500',
    priceChange: -2.1,
    currency: 'AHOY',
    seller: 'GTS Analytics',
    sellerRating: 4.8,
    quantity: 999,
    attributes: {
      'Coverage': 'Dubai Metro',
      'Update Freq': '5 minutes',
      'Accuracy': '94.2%',
    },
  },
  {
    id: 'listing-3',
    name: 'Verified Water Savings Credit (10 kL)',
    description: 'IoT-verified water conservation credit from Dubai municipality',
    category: 'CREDITS',
    vertical: 'H2O',
    price: '45',
    priceChange: 12.5,
    currency: 'AHOY',
    seller: 'H2OTO Verified',
    sellerRating: 5.0,
    quantity: 500,
    attributes: {
      'Volume': '10,000 Liters',
      'Source': 'Municipal Conservation',
      'Verified By': 'DEWA Oracle',
    },
    featured: true,
  },
  {
    id: 'listing-4',
    name: 'Priority Delivery Queue Access',
    description: 'Skip-the-line access for COMET delivery drivers',
    category: 'PASSES',
    vertical: 'COMET',
    price: '100',
    priceChange: 0,
    currency: 'AHOY',
    seller: 'COMET Fleet',
    sellerRating: 4.5,
    quantity: 50,
    attributes: {
      'Valid For': '24 hours',
      'Queue Priority': 'Top 10%',
    },
  },
  {
    id: 'listing-5',
    name: 'First Class Upgrade Voucher',
    description: 'Upgrade any Fly+ booking to First Class',
    category: 'TICKETS',
    vertical: 'FLYPLUS',
    price: '2,000',
    priceChange: 8.3,
    currency: 'AHOY',
    seller: 'Fly+ Premium',
    sellerRating: 5.0,
    quantity: 3,
    expiresAt: '2024-06-30',
    attributes: {
      'Class': 'First Class',
      'Routes': 'All Emirates',
      'Transferable': 'Yes',
    },
  },
  {
    id: 'listing-6',
    name: 'ML Model: Demand Forecasting v2.3',
    description: 'Pre-trained model for logistics demand prediction',
    category: 'DATA',
    vertical: 'AMS',
    price: '5,000',
    priceChange: 15.0,
    currency: 'AHOY',
    seller: 'Trouve Labs',
    sellerRating: 4.9,
    quantity: 1,
    attributes: {
      'Accuracy': '96.8%',
      'Training Data': '2M samples',
      'License': 'Commercial',
    },
    featured: true,
  },
  {
    id: 'listing-7',
    name: 'Carbon Offset Bundle (1 Ton CO2)',
    description: 'Verified carbon offset from renewable energy projects',
    category: 'CREDITS',
    vertical: 'H2O',
    price: '120',
    priceChange: 3.2,
    currency: 'AHOY',
    seller: 'GreenFuture DAO',
    sellerRating: 4.7,
    quantity: 1000,
    attributes: {
      'Offset': '1 Ton CO2',
      'Project': 'Solar Farm UAE',
      'Standard': 'VCS Certified',
    },
  },
  {
    id: 'listing-8',
    name: 'Driver Reputation Boost (Temporary)',
    description: '24-hour reputation score multiplier for drivers',
    category: 'REPUTATION',
    vertical: 'COMET',
    price: '75',
    priceChange: -5.0,
    currency: 'AHOY',
    seller: 'COMET Rewards',
    sellerRating: 4.2,
    quantity: 100,
    attributes: {
      'Duration': '24 hours',
      'Multiplier': '1.5x',
      'Stackable': 'No',
    },
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Grid },
  { id: 'TICKETS', label: 'Tickets', icon: Plane },
  { id: 'PASSES', label: 'Passes', icon: Tag },
  { id: 'DATA', label: 'Data', icon: Database },
  { id: 'CREDITS', label: 'Credits', icon: Droplets },
  { id: 'REPUTATION', label: 'Reputation', icon: Star },
];

const VERTICALS = [
  { id: 'all', label: 'All Verticals', color: 'text-gray-400' },
  { id: 'FLYPLUS', label: 'Fly+', color: 'text-blue-400' },
  { id: 'AMS', label: 'AMS/GTS', color: 'text-purple-400' },
  { id: 'H2O', label: 'H2O2TO', color: 'text-cyan-400' },
  { id: 'COMET', label: 'COMET', color: 'text-orange-400' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function UnifiedMarketplace() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedVertical, setSelectedVertical] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort listings
  const filteredListings = MOCK_LISTINGS.filter((listing) => {
    const matchesSearch = listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || listing.category === selectedCategory;
    const matchesVertical = selectedVertical === 'all' || listing.vertical === selectedVertical;
    return matchesSearch && matchesCategory && matchesVertical;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return parseFloat(a.price.replace(',', '')) - parseFloat(b.price.replace(',', ''));
      case 'price-high':
        return parseFloat(b.price.replace(',', '')) - parseFloat(a.price.replace(',', ''));
      case 'recent':
        return 0; // Would sort by listing date
      case 'popular':
      default:
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    }
  });

  const featuredListings = MOCK_LISTINGS.filter(l => l.featured);

  const getVerticalColor = (vertical: string) => {
    return VERTICALS.find(v => v.id === vertical)?.color || 'text-gray-400';
  };

  const getVerticalIcon = (vertical: string) => {
    switch (vertical) {
      case 'FLYPLUS': return Plane;
      case 'AMS': return Database;
      case 'H2O': return Droplets;
      case 'COMET': return Truck;
      default: return Zap;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Unified Marketplace</h1>
          <p className="text-gray-400 mt-1">Trade assets across all Ahoy verticals</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-[#F8B032]/20 text-[#F8B032]' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[#F8B032]/20 text-[#F8B032]' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Featured Section */}
      {featuredListings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#F8B032]" />
            Featured Listings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredListings.map((listing) => {
              const VerticalIcon = getVerticalIcon(listing.vertical);
              return (
                <div
                  key={listing.id}
                  className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#F8B032]/10 to-transparent border border-[#F8B032]/20 p-4 hover:border-[#F8B032]/40 transition-all cursor-pointer group"
                >
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-0.5 bg-[#F8B032] text-black text-xs font-bold rounded">
                      Featured
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center`}>
                      <VerticalIcon className={`w-6 h-6 ${getVerticalColor(listing.vertical)}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate group-hover:text-[#F8B032] transition-colors">
                        {listing.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{listing.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <AhoyTokenSymbol size={16} />
                      <span className="font-bold text-white">{listing.price}</span>
                      <span className={`text-xs ml-1 ${listing.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {listing.priceChange >= 0 ? '+' : ''}{listing.priceChange}%
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{listing.quantity} available</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search listings..."
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/20 transition-colors flex items-center gap-2"
        >
          <Filter className="w-5 h-5" />
          Filters
          <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#F8B032]/50"
        >
          <option value="popular" className="bg-[#0F172A]">Most Popular</option>
          <option value="recent" className="bg-[#0F172A]">Most Recent</option>
          <option value="price-low" className="bg-[#0F172A]">Price: Low to High</option>
          <option value="price-high" className="bg-[#0F172A]">Price: High to Low</option>
        </select>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
          {/* Categories */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-[#F8B032] text-black font-medium'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  <cat.icon className="w-4 h-4" />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Verticals */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Vertical</p>
            <div className="flex flex-wrap gap-2">
              {VERTICALS.map((vert) => (
                <button
                  key={vert.id}
                  onClick={() => setSelectedVertical(vert.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedVertical === vert.id
                      ? 'bg-[#F8B032] text-black font-medium'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {vert.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{filteredListings.length} listings found</span>
      </div>

      {/* Listings Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredListings.map((listing) => {
            const VerticalIcon = getVerticalIcon(listing.vertical);
            return (
              <div
                key={listing.id}
                className="glass-card rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all cursor-pointer group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center`}>
                    <VerticalIcon className={`w-5 h-5 ${getVerticalColor(listing.vertical)}`} />
                  </div>
                  <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-xs rounded">
                    {listing.category}
                  </span>
                </div>

                {/* Content */}
                <h3 className="font-bold text-white text-sm group-hover:text-[#F8B032] transition-colors line-clamp-2">
                  {listing.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{listing.description}</p>

                {/* Seller */}
                <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                  <span>{listing.seller}</span>
                  <div className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-[#F8B032] fill-[#F8B032]" />
                    <span>{listing.sellerRating}</span>
                  </div>
                </div>

                {/* Price */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <AhoyTokenSymbol size={14} />
                    <span className="font-bold text-white">{listing.price}</span>
                    {listing.priceChange !== 0 && (
                      <span className={`text-xs flex items-center ${listing.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {listing.priceChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(listing.priceChange)}%
                      </span>
                    )}
                  </div>
                  <button className="p-2 bg-[#F8B032]/10 text-[#F8B032] rounded-lg hover:bg-[#F8B032]/20 transition-colors">
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map((listing) => {
            const VerticalIcon = getVerticalIcon(listing.vertical);
            return (
              <div
                key={listing.id}
                className="glass-card rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all cursor-pointer group flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0`}>
                  <VerticalIcon className={`w-6 h-6 ${getVerticalColor(listing.vertical)}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white group-hover:text-[#F8B032] transition-colors truncate">
                      {listing.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-xs rounded flex-shrink-0">
                      {listing.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{listing.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{listing.seller}</span>
                    <div className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-[#F8B032] fill-[#F8B032]" />
                      <span>{listing.sellerRating}</span>
                    </div>
                    <span>{listing.quantity} available</span>
                    {listing.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires {listing.expiresAt}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <AhoyTokenSymbol size={14} />
                      <span className="font-bold text-white">{listing.price}</span>
                    </div>
                    {listing.priceChange !== 0 && (
                      <span className={`text-xs flex items-center justify-end ${listing.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {listing.priceChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(listing.priceChange)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-2 bg-[#F8B032]/10 text-[#F8B032] rounded-lg hover:bg-[#F8B032]/20 transition-colors">
                      <ShoppingCart className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredListings.length === 0 && (
        <div className="text-center py-12">
          <Database className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No listings found</h3>
          <p className="text-sm text-gray-600 mt-1">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
