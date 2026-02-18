import { Link } from 'react-router-dom';
import {
  Building2, Plane, Car, Hotel, Music, ArrowRight, Code2, Zap, Shield, Globe,
  CheckCircle, Play, BookOpen
} from 'lucide-react';

interface SDKUseCasesHomeProps {
  onSelectUseCase?: (id: string) => void;
}

const useCases = [
  {
    id: 'real-estate',
    name: 'Real Estate Tokenisation',
    description: 'Fractional property ownership with compliance, dividend distributions, and secondary market trading',
    icon: Building2,
    color: 'emerald',
    steps: 12,
    features: ['Fractional Ownership', 'Dividend Distribution', 'Property Management', 'Secondary Market', 'Compliance Rules'],
    href: '/real-estate',
  },
  {
    id: 'airline',
    name: 'Airline Ticket Tokenisation',
    description: 'Tokenized flight tickets with insurance integration, disruption handling, and peer-to-peer transfers',
    icon: Plane,
    color: 'sky',
    steps: 15,
    features: ['Flight Booking', 'Insurance Integration', 'Refund Automation', 'Ticket Transfer', 'Flight Oracle'],
    href: '/airline',
  },
  {
    id: 'car-rental',
    name: 'Car Rental Tokenisation',
    description: 'Digital car rental vouchers with flexible booking modifications and transfer capabilities',
    icon: Car,
    color: 'orange',
    steps: 10,
    features: ['Booking Vouchers', 'Fleet Management', 'Dynamic Pricing', 'Rental Extensions', 'Damage Deposits'],
    href: '/car-rental',
  },
  {
    id: 'hotel',
    name: 'Hotel Reservation Tokenisation',
    description: 'Tokenized hotel bookings with loyalty programs, flexible reservations, and resale markets',
    icon: Hotel,
    color: 'purple',
    steps: 11,
    features: ['Room Bookings', 'Loyalty Tokens', 'Cancellation Protection', 'Resale Market', 'VIP Upgrades'],
    href: '/hotel',
  },
  {
    id: 'concert',
    name: 'Concert Ticket Tokenisation',
    description: 'NFT-based event tickets with anti-scalping measures and post-event collectible value',
    icon: Music,
    color: 'pink',
    steps: 13,
    features: ['Event Tickets', 'Anti-Scalping', 'VIP Access', 'Collectible NFTs', 'Artist Royalties'],
    href: '/concert',
  },
];

const colorClasses: Record<string, { bg: string; text: string; border: string; light: string; gradient: string }> = {
  emerald: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    light: 'bg-emerald-500/10',
    gradient: 'from-emerald-500/20 to-emerald-900/5'
  },
  sky: {
    bg: 'bg-sky-500',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    light: 'bg-sky-500/10',
    gradient: 'from-sky-500/20 to-sky-900/5'
  },
  orange: {
    bg: 'bg-orange-500',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    light: 'bg-orange-500/10',
    gradient: 'from-orange-500/20 to-orange-900/5'
  },
  purple: {
    bg: 'bg-purple-500',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    light: 'bg-purple-500/10',
    gradient: 'from-purple-500/20 to-purple-900/5'
  },
  pink: {
    bg: 'bg-pink-500',
    text: 'text-pink-400',
    border: 'border-pink-500/30',
    light: 'bg-pink-500/10',
    gradient: 'from-pink-500/20 to-pink-900/5'
  },
};

export function SDKUseCasesHome({ onSelectUseCase }: SDKUseCasesHomeProps) {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Section */}
      <div className="glass-card rounded-2xl p-8 border border-white/5 bg-gradient-to-br from-[#0F172A]/50 to-transparent">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-[#F8B032] to-[#D69A31] rounded-xl">
                <Code2 className="h-8 w-8 text-black" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Tokenisation SDK</h1>
                <p className="text-gray-400">Interactive Use Case Demonstrations</p>
              </div>
            </div>
            <p className="text-gray-500 max-w-2xl mb-6">
              Explore real-world tokenisation scenarios across 5 industry verticals. Each demo walks you through
              the complete lifecycle from asset creation to trading, with live code examples and SDK calls.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-400 font-medium">SDK Ready</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                <span className="text-xs text-gray-400">v2.0.0</span>
              </div>
              <Link
                to="/showcase"
                className="flex items-center gap-2 px-3 py-1.5 bg-[#F8B032]/10 border border-[#F8B032]/30 rounded-full hover:bg-[#F8B032]/20 transition-colors"
              >
                <Play className="w-3 h-3 text-[#F8B032]" />
                <span className="text-xs text-[#F8B032] font-medium">Guided Showcases</span>
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <Code2 className="h-32 w-32 text-[#F8B032]/10" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Globe className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-2xl font-bold text-white">5</span>
          </div>
          <p className="text-xs text-gray-500">Industry Verticals</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-2xl font-bold text-white">61</span>
          </div>
          <p className="text-xs text-gray-500">Interactive Steps</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-2xl font-bold text-white">100%</span>
          </div>
          <p className="text-xs text-gray-500">Compliance Ready</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <BookOpen className="h-5 w-5 text-orange-400" />
            </div>
            <span className="text-2xl font-bold text-white">TypeScript</span>
          </div>
          <p className="text-xs text-gray-500">Full Type Support</p>
        </div>
      </div>

      {/* Use Cases Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-6">SDK Use Cases</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {useCases.map((useCase) => {
            const colors = colorClasses[useCase.color];
            return (
              <Link
                key={useCase.id}
                to={useCase.href}
                className={`group glass-card rounded-2xl p-6 border ${colors.border} hover:border-[#F8B032]/30
                  bg-gradient-to-br ${colors.gradient} transition-all duration-300 text-left hover:-translate-y-1 block`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 ${colors.light} rounded-xl`}>
                    <useCase.icon className={`h-7 w-7 ${colors.text}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{useCase.steps} steps</span>
                    <div className="p-2 rounded-lg bg-white/5 group-hover:bg-[#F8B032]/20 transition-colors">
                      <Play className="h-4 w-4 text-gray-400 group-hover:text-[#F8B032]" />
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-[#F8B032] transition-colors">
                  {useCase.name}
                </h3>
                <p className="text-sm text-gray-400 mb-4">{useCase.description}</p>

                <div className="flex flex-wrap gap-2">
                  {useCase.features.slice(0, 4).map((feature) => (
                    <span
                      key={feature}
                      className={`flex items-center gap-1 px-2 py-1 ${colors.light} ${colors.text} text-xs font-medium rounded-full`}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {feature}
                    </span>
                  ))}
                  {useCase.features.length > 4 && (
                    <span className="px-2 py-1 bg-white/5 text-gray-400 text-xs font-medium rounded-full">
                      +{useCase.features.length - 4} more
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Click to explore</span>
                  <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-[#F8B032] group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/dev/getting-started"
          className="glass-card rounded-xl p-4 border border-white/5 hover:border-[#F8B032]/30 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[#F8B032]">Getting Started</h3>
              <p className="text-xs text-gray-500">Quick setup guide</p>
            </div>
          </div>
        </Link>
        <Link
          to="/dev/api"
          className="glass-card rounded-xl p-4 border border-white/5 hover:border-[#F8B032]/30 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Code2 className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[#F8B032]">API Reference</h3>
              <p className="text-xs text-gray-500">Full SDK documentation</p>
            </div>
          </div>
        </Link>
        <Link
          to="/integrate"
          className="glass-card rounded-xl p-4 border border-white/5 hover:border-[#F8B032]/30 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[#F8B032]">Integration</h3>
              <p className="text-xs text-gray-500">Connect your app</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Start Code Block */}
      <div className="glass-card rounded-2xl p-6 border border-white/5">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Start</h3>
        <div className="bg-black/40 rounded-xl p-4 font-mono text-sm overflow-x-auto">
          <div className="text-gray-500"># Install the SDK</div>
          <div className="text-green-400">npm install @tokenisation/sdk</div>
          <div className="text-gray-500 mt-4"># Import and initialize</div>
          <div className="text-blue-400">import {'{ TokenisationClient }'} from '@tokenisation/sdk';</div>
          <div className="text-white mt-2">const client = new TokenisationClient({'{'}</div>
          <div className="text-white pl-4">apiKey: process.env.TOKENISATION_API_KEY,</div>
          <div className="text-white pl-4">network: 'mainnet'</div>
          <div className="text-white">{'}'});</div>
        </div>
      </div>
    </div>
  );
}
