import { useState } from 'react';
import { Zap, UserCheck, TrendingUp, Coins, RotateCcw, Truck, CloudLightning, ShieldX, Ban } from 'lucide-react';
import { sdkStore } from '../../store';
import { LifecycleState } from '@tokenisation/sdk';
import { isKycVerified } from '../../types';

export function ManualOverridePanel() {
  const [status, setStatus] = useState<string>('');

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  };

  const forceLifecycleTransition = async () => {
    const assets = sdkStore.getAssets();
    if (assets.length === 0) {
      showStatus('No assets available');
      return;
    }
    const asset = assets[0];
    const parties = sdkStore.getParties();
    const actor = parties[0]?.id || 'system';

    // Determine next state
    const stateOrder = [
      LifecycleState.DRAFT,
      LifecycleState.PENDING_VERIFICATION,
      LifecycleState.VERIFIED,
      LifecycleState.ACTIVE,
    ];
    const currentIdx = stateOrder.indexOf(asset.state as LifecycleState);
    if (currentIdx >= stateOrder.length - 1) {
      showStatus(`Asset "${asset.name}" is already ACTIVE`);
      return;
    }
    const nextState = stateOrder[currentIdx + 1];
    sdkStore.logSdkCall('assets.transition', { assetId: asset.id, state: nextState, actorId: actor });
    const result = await sdkStore.transition(asset.id, nextState, actor);
    showStatus(result.success ? `Transitioned to ${nextState}` : `Failed: ${result.error}`);
  };

  const forceKycApproval = () => {
    const parties = sdkStore.getParties();
    const unverified = parties.filter(p => !isKycVerified(p));
    if (unverified.length === 0) {
      showStatus('All parties already verified');
      return;
    }
    unverified.forEach(p => {
      sdkStore.logSdkCall('parties.setKyc', { partyId: p.id, verified: true });
      sdkStore.verifyKyc(p.id);
    });
    showStatus(`Verified ${unverified.length} parties`);
  };

  const forceOracleUpdate = () => {
    const assets = sdkStore.getAssets();
    if (assets.length === 0) {
      showStatus('No assets available');
      return;
    }
    const asset = assets[0];
    const newValue = Math.round(Math.random() * 5000000 + 1000000);
    sdkStore.logSdkCall('assets.updateValuation', { assetId: asset.id, newValue });
    sdkStore.updateAssetValuation(asset.id, newValue);
    showStatus(`Updated valuation to $${newValue.toLocaleString()}`);
  };

  const forceMintTokens = async () => {
    const assets = sdkStore.getAssets();
    const parties = sdkStore.getParties();
    if (assets.length === 0 || parties.length === 0) {
      showStatus('Need at least one asset and one party');
      return;
    }
    sdkStore.logSdkCall('tokens.mint', { assetId: assets[0].id, toPartyId: parties[0].id, amount: '100' });
    const result = await sdkStore.mint(assets[0].id, parties[0].id, '100');
    showStatus(result.success ? 'Minted 100 tokens' : `Failed: ${result.error}`);
  };

  const forceCreateDelivery = () => {
    sdkStore.logSdkCall('comet.createDelivery', { type: 'random' });
    sdkStore.generateRandomDelivery();
    showStatus('Created random delivery');
  };

  const forceReset = () => {
    sdkStore.clearSnapshots();
    showStatus('Snapshots cleared');
  };

  // ---- Oracle Simulation Buttons (new) ----

  const triggerOracleDelay = () => {
    const assets = sdkStore.getAssets();
    if (assets.length === 0) {
      showStatus('No assets available');
      return;
    }
    const asset = assets[0];
    sdkStore.setAssetMetadata(asset.id, 'flightStatus', 'DELAYED');
    sdkStore.setAssetMetadata(asset.id, 'delayMinutes', 180);
    sdkStore.logSdkCall('oracle.flightStatusUpdate', { assetId: asset.id, status: 'DELAYED', delayMinutes: 180 });
    showStatus(`Oracle: Flight DELAYED (180 min) for "${asset.name}"`);
  };

  const forceKycFailure = () => {
    const parties = sdkStore.getParties();
    const verified = parties.filter(p => isKycVerified(p));
    if (verified.length === 0) {
      showStatus('No verified parties to fail');
      return;
    }
    // Fail the last verified party
    const target = verified[verified.length - 1];
    sdkStore.sdk.parties_.setKyc(target.id, false);
    sdkStore.logSdkCall('parties.setKyc', { partyId: target.id, verified: false });
    showStatus(`KYC FAILED for "${target.name}"`);
  };

  const forceComplianceBlock = () => {
    const assets = sdkStore.getAssets();
    if (assets.length === 0) {
      showStatus('No assets available');
      return;
    }
    const asset = assets[0];
    sdkStore.setAssetMetadata(asset.id, 'blockedJurisdiction', 'KP');
    sdkStore.logSdkCall('compliance.blockJurisdiction', { assetId: asset.id, jurisdiction: 'KP' });
    showStatus(`Compliance: Blocked jurisdiction "KP" on "${asset.name}"`);
  };

  const buttons = [
    { label: 'Lifecycle Transition', icon: Zap, action: forceLifecycleTransition, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },
    { label: 'KYC Approve All', icon: UserCheck, action: forceKycApproval, color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20' },
    { label: 'Oracle Update', icon: TrendingUp, action: forceOracleUpdate, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' },
    { label: 'Mint Tokens', icon: Coins, action: forceMintTokens, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20' },
    { label: 'Create Delivery', icon: Truck, action: forceCreateDelivery, color: 'text-sky-400 border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20' },
    { label: 'Oracle Delay', icon: CloudLightning, action: triggerOracleDelay, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20' },
    { label: 'Force KYC Fail', icon: ShieldX, action: forceKycFailure, color: 'text-pink-400 border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20' },
    { label: 'Block Jurisdiction', icon: Ban, action: forceComplianceBlock, color: 'text-rose-400 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20' },
    { label: 'Clear Snapshots', icon: RotateCcw, action: forceReset, color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' },
  ];

  return (
    <div className="space-y-4 p-2">
      <p className="text-xs text-gray-500">
        Force state changes to test the debugger. Each button triggers a real SDK action.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {buttons.map(({ label, icon: Icon, action, color }) => (
          <button
            key={label}
            onClick={action}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${color}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
      {status && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 font-mono">
          {status}
        </div>
      )}
    </div>
  );
}
