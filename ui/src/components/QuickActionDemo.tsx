import { useState, useEffect } from 'react';
import {
  Truck, Plane, Droplets, Cpu, X, CheckCircle, ArrowRight,
  Coins, Star, Shield, Clock, MapPin, User, Package, Zap,
  Play, RotateCcw, ChevronRight, Sparkles, Gift, CreditCard
} from 'lucide-react';
import { sdkStore } from '../store';

interface DemoStep {
  title: string;
  description: string;
  icon: React.ElementType;
  highlight?: string;
  delay: number;
}

type AhoySource = 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'TROUVE' | 'CONNECT';

interface DemoScenario {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  tagline: string;
  realWorldExample: string;
  earnAmount: number;
  steps: DemoStep[];
  benefits: string[];
  action: string;
  source: AhoySource;
}

const scenarios: DemoScenario[] = [
  {
    id: 'delivery',
    name: 'Safe Delivery Completion',
    icon: Truck,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500',
    tagline: 'Earn rewards for safe, on-time deliveries',
    realWorldExample: 'Ahmed is a delivery driver who just completed 10 deliveries this week with perfect safety scores and on-time arrivals.',
    earnAmount: 100,
    action: 'PERFECT_DELIVERY_WEEK',
    source: 'COMET',
    steps: [
      { title: 'Delivery Assigned', description: 'New delivery request received via COMET app', icon: Package, delay: 0 },
      { title: 'Route Optimized', description: 'AI calculates safest and fastest route', icon: MapPin, delay: 800 },
      { title: 'Safe Driving', description: 'Telematics monitors speed, braking, and safety', icon: Shield, highlight: 'Safety Score: 98%', delay: 1600 },
      { title: 'On-Time Delivery', description: 'Package delivered within estimated window', icon: Clock, highlight: '15 min early!', delay: 2400 },
      { title: 'Customer Rating', description: 'Customer rates 5 stars for excellent service', icon: Star, highlight: '⭐⭐⭐⭐⭐', delay: 3200 },
      { title: '$AHOY Earned!', description: 'Tokens automatically credited to your wallet', icon: Coins, highlight: '+100 $AHOY', delay: 4000 },
    ],
    benefits: [
      'Build permanent reputation (Soulbound)',
      'Unlock higher-paying delivery routes',
      'Earn tier multipliers (up to 2x)',
      'Redeem for fuel discounts',
    ],
  },
  {
    id: 'flight',
    name: 'Book Premium Flight',
    icon: Plane,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    tagline: 'Travel smarter, earn while you fly',
    realWorldExample: 'Sarah books a business class flight from Dubai to London using her Fly+ membership, earning bonus AHOY for choosing premium.',
    earnAmount: 50,
    action: 'FLIGHT_BOOKING',
    source: 'FLYPLUS',
    steps: [
      { title: 'Search Flights', description: 'Looking for Dubai → London flights', icon: Plane, delay: 0 },
      { title: 'Fly+ Pass Detected', description: 'Your Gold tier membership is active', icon: CreditCard, highlight: 'GOLD MEMBER', delay: 800 },
      { title: 'Premium Perks Applied', description: 'Priority boarding + Lounge access added', icon: Gift, delay: 1600 },
      { title: 'Booking Confirmed', description: 'Flight EK003 booked successfully', icon: CheckCircle, highlight: 'Seat 4A', delay: 2400 },
      { title: 'Door-to-Door Service', description: 'Luggage pickup scheduled for departure day', icon: Package, delay: 3200 },
      { title: '$AHOY Earned!', description: 'Booking rewards + tier bonus applied', icon: Coins, highlight: '+50 $AHOY', delay: 4000 },
    ],
    benefits: [
      'Access exclusive lounges worldwide',
      'Priority boarding on all flights',
      'Door-to-door luggage service',
      'Use $AHOY for seat upgrades',
    ],
  },
  {
    id: 'utility',
    name: 'Pay Utility Bill',
    icon: Droplets,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500',
    tagline: 'Save water, earn tokens, track impact',
    realWorldExample: 'The Martinez family pays their monthly water bill through H2O, getting rewarded for staying below their conservation target.',
    earnAmount: 25,
    action: 'UTILITY_PAYMENT',
    source: 'H2O',
    steps: [
      { title: 'Smart Meter Reading', description: 'IoT device reports monthly water usage', icon: Droplets, delay: 0 },
      { title: 'Usage Analysis', description: 'AI compares to household average', icon: Cpu, highlight: '15% below avg!', delay: 800 },
      { title: 'Conservation Verified', description: 'Blockchain confirms savings are real', icon: Shield, delay: 1600 },
      { title: 'Carbon Credits Issued', description: 'Environmental impact tokenized', icon: Sparkles, highlight: '2.5 kg CO₂ saved', delay: 2400 },
      { title: 'Bill Paid', description: 'Payment processed with $AHOY discount', icon: CreditCard, highlight: '10% off!', delay: 3200 },
      { title: '$AHOY Earned!', description: 'Conservation rewards credited', icon: Coins, highlight: '+25 $AHOY', delay: 4000 },
    ],
    benefits: [
      'Track environmental impact',
      'Earn for conservation efforts',
      'Get discounts on utility bills',
      'Trade carbon credits on marketplace',
    ],
  },
  {
    id: 'ml',
    name: 'Contribute ML Data',
    icon: Cpu,
    color: 'text-green-400',
    bgColor: 'bg-green-500',
    tagline: 'Power AI models, get paid for data',
    realWorldExample: 'DataCorp contributes anonymized traffic patterns to help train city-wide congestion prediction models via Trouve Labs.',
    earnAmount: 75,
    action: 'ML_TRAINING_CONTRIBUTION',
    source: 'TROUVE',
    steps: [
      { title: 'Data Prepared', description: 'Anonymized dataset ready for contribution', icon: Package, delay: 0 },
      { title: 'Privacy Check', description: 'ZK-proof confirms no PII present', icon: Shield, highlight: 'Privacy Verified ✓', delay: 800 },
      { title: 'Federated Training', description: 'Model trains on your data locally', icon: Cpu, delay: 1600 },
      { title: 'Quality Scored', description: 'AI rates data contribution quality', icon: Star, highlight: 'Quality: 94%', delay: 2400 },
      { title: 'IP Rights Minted', description: 'Your contribution recorded as Algorithm NFT', icon: Sparkles, delay: 3200 },
      { title: '$AHOY Earned!', description: 'Computation credits + royalty rights', icon: Coins, highlight: '+75 $AHOY', delay: 4000 },
    ],
    benefits: [
      'Earn passive royalties from AI models',
      'Maintain data privacy with ZK-proofs',
      'Build portfolio of Algorithm NFTs',
      'Access exclusive compute resources',
    ],
  },
];

interface QuickActionDemoProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioId?: string;
}

export function QuickActionDemo({ isOpen, onClose, scenarioId }: QuickActionDemoProps) {
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (scenarioId) {
      const scenario = scenarios.find(s => s.id === scenarioId);
      if (scenario) {
        setSelectedScenario(scenario);
      }
    }
  }, [scenarioId]);

  useEffect(() => {
    if (!isPlaying || !selectedScenario) return;

    const totalSteps = selectedScenario.steps.length;

    if (currentStep < totalSteps - 1) {
      const nextDelay = selectedScenario.steps[currentStep + 1]?.delay - (selectedScenario.steps[currentStep]?.delay || 0);
      const timer = setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, currentStep === -1 ? 500 : nextDelay || 800);

      return () => clearTimeout(timer);
    } else if (currentStep === totalSteps - 1) {
      const timer = setTimeout(() => {
        setIsPlaying(false);
        setIsComplete(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentStep, selectedScenario]);

  const startDemo = () => {
    setCurrentStep(-1);
    setIsComplete(false);
    setIsPlaying(true);
  };

  const resetDemo = () => {
    setCurrentStep(-1);
    setIsComplete(false);
    setIsPlaying(false);
  };

  const completeAndEarn = () => {
    if (selectedScenario) {
      sdkStore.simulateAhoyAction(selectedScenario.action, selectedScenario.source);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0f172a] rounded-2xl border border-white/10 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {!selectedScenario ? (
          /* Scenario Selection */
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
                <Zap className="w-8 h-8 text-yellow-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Live AHOY Token Demos</h2>
              <p className="text-gray-400 max-w-md mx-auto">
                See exactly how you earn and use $AHOY tokens in real-world scenarios.
                Choose a demo to understand the token utility.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario)}
                  className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 ${scenario.bgColor}/10 rounded-xl flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform`}>
                      <scenario.icon className={`w-6 h-6 ${scenario.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white group-hover:text-primary transition-colors">
                        {scenario.name}
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">{scenario.tagline}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
                          +{scenario.earnAmount} $AHOY
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Demo Player */
          <div className="p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => {
                  setSelectedScenario(null);
                  resetDemo();
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-400 rotate-180" />
              </button>
              <div className={`w-12 h-12 ${selectedScenario.bgColor}/10 rounded-xl flex items-center justify-center border border-white/10`}>
                <selectedScenario.icon className={`w-6 h-6 ${selectedScenario.color}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{selectedScenario.name}</h2>
                <p className="text-sm text-gray-400">{selectedScenario.tagline}</p>
              </div>
            </div>

            {/* Real World Example */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Real-World Example</p>
                  <p className="text-sm text-gray-300">{selectedScenario.realWorldExample}</p>
                </div>
              </div>
            </div>

            {/* Demo Steps */}
            <div className="space-y-3 mb-6">
              {selectedScenario.steps.map((step, idx) => {
                const isActive = idx === currentStep;
                const isCompleted = idx < currentStep;
                const isPending = idx > currentStep;

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${isActive
                      ? 'bg-primary/10 border-primary/30 scale-[1.02]'
                      : isCompleted
                        ? 'bg-green-500/5 border-green-500/20'
                        : 'bg-white/5 border-white/5 opacity-50'
                      }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${isActive
                      ? `${selectedScenario.bgColor}/20 border-${selectedScenario.color}/30`
                      : isCompleted
                        ? 'bg-green-500/20 border-green-500/30'
                        : 'bg-white/5 border-white/10'
                      }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : isActive ? (
                        <step.icon className={`w-5 h-5 ${selectedScenario.color} animate-pulse`} />
                      ) : (
                        <step.icon className="w-5 h-5 text-gray-500" />
                      )}
                    </div>

                    <div className="flex-1">
                      <p className={`font-medium ${isActive || isCompleted ? 'text-white' : 'text-gray-500'}`}>
                        {step.title}
                      </p>
                      <p className={`text-sm ${isActive || isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                        {step.description}
                      </p>
                    </div>

                    {step.highlight && (isActive || isCompleted) && (
                      <div className={`px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${idx === selectedScenario.steps.length - 1
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : `${selectedScenario.bgColor}/20 ${selectedScenario.color}`
                        }`}>
                        {step.highlight}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 mb-6">
              {!isPlaying && !isComplete && (
                <button
                  onClick={startDemo}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all hover:scale-[1.02]"
                >
                  <Play className="w-5 h-5" />
                  Start Demo
                </button>
              )}

              {isPlaying && (
                <div className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/10 text-white rounded-xl font-bold">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running Demo...
                </div>
              )}

              {isComplete && (
                <>
                  <button
                    onClick={resetDemo}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Replay
                  </button>
                  <button
                    onClick={completeAndEarn}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold transition-all hover:scale-[1.02]"
                  >
                    <Coins className="w-5 h-5" />
                    Claim +{selectedScenario.earnAmount} $AHOY
                  </button>
                </>
              )}
            </div>

            {/* Benefits */}
            <div className="bg-gradient-to-br from-white/5 to-white/0 border border-white/10 rounded-xl p-5">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Why This Matters
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {selectedScenario.benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle className={`w-4 h-4 ${selectedScenario.color} mt-0.5 flex-shrink-0`} />
                    <span className="text-sm text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Inline Demo Card - For embedding in Quick Actions */
interface InlineDemoProps {
  scenario: DemoScenario;
  onOpenFullDemo: () => void;
}

export function InlineDemoCard({ scenario, onOpenFullDemo }: InlineDemoProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative p-4 ${scenario.bgColor}/10 border border-white/10 rounded-xl transition-all cursor-pointer group overflow-hidden`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onOpenFullDemo}
    >
      {/* Animated Background */}
      <div className={`absolute inset-0 ${scenario.bgColor}/5 transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <scenario.icon className={`w-5 h-5 ${scenario.color} group-hover:scale-110 transition-transform`} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded">
            Live Demo
          </span>
        </div>

        <p className="text-sm font-bold text-gray-200 mb-1 group-hover:text-white transition-colors">
          {scenario.name}
        </p>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{scenario.tagline}</p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
            +{scenario.earnAmount} $AHOY
          </span>
          <div className="flex items-center gap-1 text-xs text-gray-500 group-hover:text-primary transition-colors">
            <Play className="w-3 h-3" />
            Try it
          </div>
        </div>
      </div>
    </div>
  );
}

export { scenarios };
