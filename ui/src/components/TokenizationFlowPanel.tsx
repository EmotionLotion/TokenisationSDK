/**
 * TokenizationFlowPanel
 *
 * Visual representation of the COMPLETE tokenization flow:
 * COMET App → Oracle → Blockchain → Rewards
 *
 * This makes the demo coherent and shows how all pieces connect.
 */

import { useState, useEffect } from 'react';
import {
  Truck, Radio, Cpu, Link2, Coins, CheckCircle2,
  AlertTriangle, ArrowRight, RefreshCw, Play, Zap,
  Shield, Award, TrendingUp, TrendingDown, Activity
} from 'lucide-react';
import { tokenizationFlow } from '../services/tokenizationFlow';
import { cometApi } from '../services/cometApi';

interface FlowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'idle' | 'processing' | 'success' | 'error';
  data?: Record<string, unknown>;
}

export function TokenizationFlowPanel() {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('DRV-001');
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [flowResult, setFlowResult] = useState<{
    oracleScore: number | null;
    ahoyMinted: number;
    txHash: string | null;
  } | null>(null);

  const [steps, setSteps] = useState<FlowStep[]>([
    {
      id: 'comet',
      name: 'COMET App',
      description: 'Driver completes delivery',
      icon: <Truck className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'oracle',
      name: 'Chainlink Oracle',
      description: 'Fetch & verify score',
      icon: <Radio className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'compute',
      name: 'DON Compute',
      description: 'Calculate safety score',
      icon: <Cpu className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'blockchain',
      name: 'On-Chain Update',
      description: 'Update ReputationSBT',
      icon: <Link2 className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'reward',
      name: 'AHOY Reward',
      description: 'Mint loyalty tokens',
      icon: <Coins className="w-5 h-5" />,
      status: 'idle',
    },
  ]);

  const [onChainState, setOnChainState] = useState(tokenizationFlow.getOnChainState(selectedDriver));
  const [recentEvents, setRecentEvents] = useState(tokenizationFlow.getFlowEvents());

  // Check connection on mount
  useEffect(() => {
    tokenizationFlow.checkConnection().then(setIsConnected);
  }, []);

  // Update on-chain state when driver changes
  useEffect(() => {
    setOnChainState(tokenizationFlow.getOnChainState(selectedDriver));
  }, [selectedDriver]);

  // Subscribe to flow events
  useEffect(() => {
    return tokenizationFlow.onFlowEvent((event) => {
      setRecentEvents(tokenizationFlow.getFlowEvents());

      // Update step status based on event
      setSteps(prev => prev.map(step => {
        if (event.type === 'DELIVERY_COMPLETE' && step.id === 'comet') {
          return { ...step, status: event.status === 'success' ? 'success' : 'processing' };
        }
        if (event.type === 'SCORE_UPDATE' && (step.id === 'oracle' || step.id === 'compute')) {
          return { ...step, status: event.status === 'success' ? 'success' : 'processing' };
        }
        if (event.type === 'SBT_UPDATE' && step.id === 'blockchain') {
          return { ...step, status: event.status === 'success' ? 'success' : 'processing' };
        }
        if (event.type === 'AHOY_MINT' && step.id === 'reward') {
          return { ...step, status: event.status === 'success' ? 'success' : 'processing' };
        }
        return step;
      }));
    });
  }, []);

  const resetSteps = () => {
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle' as const })));
    setCurrentStep(0);
    setFlowResult(null);
  };

  const runFullFlow = async () => {
    if (isRunning) return;

    setIsRunning(true);
    resetSteps();

    // Animate through steps
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'processing' as const } : s
      ));
      await new Promise(r => setTimeout(r, 600));
    }

    // Run actual flow
    const result = await tokenizationFlow.completeDeliveryWithTokenization(
      selectedDriver,
      {
        deliveryId: `DLV-${Date.now()}`,
        rating: 5,
        wasOnTime: true,
        distance: 8.5,
      }
    );

    if (result.success) {
      setFlowResult({
        oracleScore: result.steps.oracleScore,
        ahoyMinted: result.steps.ahoyMinted,
        txHash: result.txHash || null,
      });

      // Mark all success
      setSteps(prev => prev.map(s => ({ ...s, status: 'success' as const })));
    }

    setOnChainState(tokenizationFlow.getOnChainState(selectedDriver));
    setIsRunning(false);
  };

  const simulateSafetyEvent = async (eventType: string) => {
    setIsRunning(true);

    const result = await tokenizationFlow.recordSafetyEvent(selectedDriver, eventType);

    if (result.success) {
      setOnChainState(tokenizationFlow.getOnChainState(selectedDriver));
    }

    setIsRunning(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-900/20 via-cyan-900/20 to-green-900/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-purple-400" />
              Tokenization Flow Demo
            </h2>
            <p className="text-sm text-gray-400">
              Watch how COMET data flows through oracles to on-chain reputation
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
              isConnected
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {isConnected ? 'COMET Connected' : 'Local Mode'}
            </div>

            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm"
            >
              <option value="DRV-001" className="bg-gray-900">Ahmed (DRV-001)</option>
              <option value="DRV-002" className="bg-gray-900">Fatima (DRV-002)</option>
              <option value="DRV-003" className="bg-gray-900">Mohammed (DRV-003)</option>
            </select>
          </div>
        </div>

        {/* Flow Visualization */}
        <div className="flex items-center justify-between py-8 px-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  step.status === 'success' ? 'bg-green-500/20 border-2 border-green-500 shadow-lg shadow-green-500/20' :
                  step.status === 'processing' ? 'bg-purple-500/20 border-2 border-purple-500 animate-pulse' :
                  step.status === 'error' ? 'bg-red-500/20 border-2 border-red-500' :
                  'bg-white/5 border border-white/20'
                }`}>
                  {step.status === 'success' ? (
                    <CheckCircle2 className="w-6 h-6 text-green-400" />
                  ) : step.status === 'processing' ? (
                    <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                  ) : (
                    <div className={step.status === 'idle' ? 'text-gray-500' : 'text-white'}>
                      {step.icon}
                    </div>
                  )}
                </div>
                <p className={`mt-2 text-sm font-bold ${
                  step.status === 'success' ? 'text-green-400' :
                  step.status === 'processing' ? 'text-purple-400' :
                  'text-gray-400'
                }`}>
                  {step.name}
                </p>
                <p className="text-[10px] text-gray-500 text-center max-w-[80px]">
                  {step.description}
                </p>
              </div>

              {/* Arrow */}
              {index < steps.length - 1 && (
                <div className="mx-3">
                  <ArrowRight className={`w-5 h-5 transition-colors duration-300 ${
                    steps[index + 1].status !== 'idle' ? 'text-purple-400' : 'text-gray-600'
                  }`} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Run Button */}
        <div className="flex justify-center">
          <button
            onClick={runFullFlow}
            disabled={isRunning}
            className="flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Run Complete Delivery Flow
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Panel */}
      <div className="grid grid-cols-3 gap-4">
        {/* On-Chain State */}
        <div className="glass-card p-5 rounded-xl border border-cyan-500/20">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            On-Chain State (SBT)
          </h3>

          {onChainState ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Token ID</span>
                <span className="text-white font-mono">#{onChainState.sbtTokenId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Safety Score</span>
                <span className={`text-2xl font-bold ${
                  onChainState.sbtScore >= 90 ? 'text-green-400' :
                  onChainState.sbtScore >= 70 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {onChainState.sbtScore}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tier</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  onChainState.sbtTier === 'DIAMOND' ? 'bg-cyan-500/20 text-cyan-400' :
                  onChainState.sbtTier === 'PLATINUM' ? 'bg-purple-500/20 text-purple-400' :
                  onChainState.sbtTier === 'GOLD' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {onChainState.sbtTier}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">$AHOY Balance</span>
                <span className="text-amber-400 font-bold">{onChainState.ahoyBalance}</span>
              </div>
              {onChainState.sbtLastUpdate && (
                <p className="text-[10px] text-gray-500 pt-2 border-t border-white/10">
                  Last update: {new Date(onChainState.sbtLastUpdate).toLocaleTimeString()}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No SBT minted</p>
          )}
        </div>

        {/* Flow Result */}
        <div className="glass-card p-5 rounded-xl border border-green-500/20">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-400" />
            Last Flow Result
          </h3>

          {flowResult ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Oracle Score</span>
                <span className="text-green-400 font-bold text-xl">
                  {flowResult.oracleScore}/100
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">AHOY Earned</span>
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +{flowResult.ahoyMinted}
                </span>
              </div>
              {flowResult.txHash && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-[10px] text-gray-500">Transaction</p>
                  <p className="text-[10px] text-cyan-400 font-mono truncate">
                    {flowResult.txHash}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm">Run the flow to see results</p>
              <p className="text-[10px] text-gray-600 mt-1">
                Click "Run Complete Delivery Flow" above
              </p>
            </div>
          )}
        </div>

        {/* Safety Events */}
        <div className="glass-card p-5 rounded-xl border border-red-500/20">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Simulate Safety Event
          </h3>

          <div className="space-y-2">
            <button
              onClick={() => simulateSafetyEvent('SPEEDING')}
              disabled={isRunning}
              className="w-full flex items-center justify-between px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <span>Speeding Event</span>
              <span className="font-mono">-5 pts</span>
            </button>
            <button
              onClick={() => simulateSafetyEvent('HARD_BRAKE')}
              disabled={isRunning}
              className="w-full flex items-center justify-between px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-50"
            >
              <span>Hard Brake</span>
              <span className="font-mono">-2 pts</span>
            </button>
            <button
              onClick={() => simulateSafetyEvent('HARSH_CORNERING')}
              disabled={isRunning}
              className="w-full flex items-center justify-between px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg hover:bg-yellow-500/20 transition-all disabled:opacity-50"
            >
              <span>Harsh Cornering</span>
              <span className="font-mono">-2 pts</span>
            </button>
          </div>

          <p className="text-[10px] text-gray-500 mt-3">
            Events update the score via Chainlink oracle
          </p>
        </div>
      </div>

      {/* Recent Events Log */}
      {recentEvents.length > 0 && (
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <h3 className="font-bold text-white mb-3 text-sm">Recent Flow Events</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentEvents.slice(-5).reverse().map(event => (
              <div key={event.id} className="flex items-center gap-3 text-xs p-2 bg-white/5 rounded">
                <span className={`w-2 h-2 rounded-full ${
                  event.status === 'success' ? 'bg-green-400' :
                  event.status === 'processing' ? 'bg-purple-400 animate-pulse' :
                  event.status === 'failed' ? 'bg-red-400' :
                  'bg-gray-400'
                }`} />
                <span className="text-gray-400 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-white">{event.type.replace(/_/g, ' ')}</span>
                <span className="text-gray-500 ml-auto">
                  {JSON.stringify(event.data).slice(0, 30)}...
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenizationFlowPanel;
