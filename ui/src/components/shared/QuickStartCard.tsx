import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Play, CheckCircle2, ChevronRight, Box, ShieldCheck, Coins, ExternalLink } from 'lucide-react';
import { sdkStore } from '../../store';
import { LifecycleState, PartyType, PartyRole, RightType } from '@tokenisation/sdk';

interface StepResult {
    method: string;
    output: string;
}

type StepStatus = 'idle' | 'running' | 'done' | 'error';

export function QuickStartCard() {
    const navigate = useNavigate();
    const [stepStatus, setStepStatus] = useState<[StepStatus, StepStatus, StepStatus]>(['idle', 'idle', 'idle']);
    const [results, setResults] = useState<(StepResult | null)[]>([null, null, null]);
    const [assetId, setAssetId] = useState<string | null>(null);
    const [issuerId, setIssuerId] = useState<string | null>(null);

    const updateStep = (idx: number, status: StepStatus, result?: StepResult) => {
        setStepStatus(prev => {
            const next = [...prev] as [StepStatus, StepStatus, StepStatus];
            next[idx] = status;
            return next;
        });
        if (result) {
            setResults(prev => {
                const next = [...prev];
                next[idx] = result;
                return next;
            });
        }
    };

    const runStep1 = async () => {
        updateStep(0, 'running');
        try {
            const issuer = sdkStore.sdk.parties_.create({
                name: 'Quick Start Issuer',
                type: PartyType.ORGANIZATION,
                roles: [PartyRole.ISSUER],
                jurisdiction: 'AE',
            });
            sdkStore.sdk.parties_.setKyc(issuer.id, true);
            setIssuerId(issuer.id);

            const asset = await sdkStore.createAsset({
                name: 'Quick Start Token',
                rightType: RightType.OWNERSHIP,
                jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
                issuerId: issuer.id,
            });
            setAssetId(asset.id);
            updateStep(0, 'done', {
                method: 'sdk.assets.create()',
                output: `Asset "${asset.name}" created\nID: ${asset.id}\nState: DRAFT`,
            });
        } catch (e: any) {
            updateStep(0, 'error', { method: 'sdk.assets.create()', output: e.message || 'Failed' });
        }
    };

    const runStep2 = async () => {
        if (!assetId || !issuerId) return;
        updateStep(1, 'running');
        try {
            await sdkStore.transition(assetId, LifecycleState.PENDING_VERIFICATION, issuerId);
            await sdkStore.transition(assetId, LifecycleState.VERIFIED, issuerId);
            await sdkStore.transition(assetId, LifecycleState.ACTIVE, issuerId);
            updateStep(1, 'done', {
                method: 'sdk.assets.transition()',
                output: `DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE`,
            });
        } catch (e: any) {
            updateStep(1, 'error', { method: 'sdk.assets.transition()', output: e.message || 'Failed' });
        }
    };

    const runStep3 = async () => {
        if (!assetId || !issuerId) return;
        updateStep(2, 'running');
        try {
            const result = await sdkStore.mint(assetId, issuerId, '1000');
            if (result.success) {
                updateStep(2, 'done', {
                    method: 'sdk.tokens.mint()',
                    output: `Minted 1,000 tokens to issuer\nAsset is now live with supply`,
                });
            } else {
                updateStep(2, 'error', { method: 'sdk.tokens.mint()', output: result.error || 'Mint failed' });
            }
        } catch (e: any) {
            updateStep(2, 'error', { method: 'sdk.tokens.mint()', output: e.message || 'Failed' });
        }
    };

    const steps = [
        { label: 'Create Asset', description: 'Register a new tokenized asset', icon: Box, run: runStep1 },
        { label: 'Verify & Activate', description: 'Transition through lifecycle states', icon: ShieldCheck, run: runStep2 },
        { label: 'Mint Tokens', description: 'Issue 1,000 tokens to the asset', icon: Coins, run: runStep3 },
    ];

    const allDone = stepStatus.every(s => s === 'done');

    return (
        <div className="rounded-2xl border border-[#F8B032]/20 bg-gradient-to-br from-[#F8B032]/5 via-transparent to-transparent p-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F8B032]/10 flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-[#F8B032]" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Quick Start</h3>
                        <p className="text-xs text-gray-500">Create your first tokenized asset in 3 steps</p>
                    </div>
                </div>
                {allDone && (
                    <button
                        onClick={() => navigate('/assets')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8B032]/10 border border-[#F8B032]/20 rounded-lg text-[#F8B032] text-xs font-medium hover:bg-[#F8B032]/20 transition-colors"
                    >
                        View Assets <ExternalLink className="w-3 h-3" />
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {steps.map((step, idx) => {
                    const status = stepStatus[idx];
                    const result = results[idx];
                    const Icon = step.icon;
                    const canRun = idx === 0 ? status === 'idle' : stepStatus[idx - 1] === 'done' && status === 'idle';

                    return (
                        <div
                            key={idx}
                            className={`rounded-xl border p-4 transition-all ${
                                status === 'done'
                                    ? 'border-green-500/20 bg-green-500/5'
                                    : status === 'running'
                                    ? 'border-[#F8B032]/30 bg-[#F8B032]/5'
                                    : status === 'error'
                                    ? 'border-red-500/20 bg-red-500/5'
                                    : 'border-white/5 bg-white/[0.02]'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                                        status === 'done'
                                            ? 'bg-green-500/20 text-green-400'
                                            : status === 'running'
                                            ? 'bg-[#F8B032]/20 text-[#F8B032]'
                                            : 'bg-white/5 text-gray-500'
                                    }`}>
                                        {status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-medium ${status === 'done' ? 'text-green-400' : 'text-white'}`}>
                                            {step.label}
                                        </p>
                                        <p className="text-xs text-gray-500">{step.description}</p>
                                    </div>
                                </div>

                                {canRun && (
                                    <button
                                        onClick={step.run}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8B032] text-black rounded-lg text-xs font-bold hover:bg-[#E5A02E] transition-colors"
                                    >
                                        <Play className="w-3 h-3" /> Run
                                    </button>
                                )}
                                {status === 'running' && (
                                    <div className="w-5 h-5 border-2 border-[#F8B032] border-t-transparent rounded-full animate-spin" />
                                )}
                            </div>

                            {result && (
                                <div className="mt-3 bg-black/40 rounded-lg p-3 border border-white/5">
                                    <p className="text-[10px] text-[#F8B032] font-mono font-bold mb-1">{result.method}</p>
                                    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{result.output}</pre>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
