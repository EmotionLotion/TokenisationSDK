import { useState, useEffect, useCallback } from 'react';
import {
    Settings, Globe, Link2, Shield, Lock, Bell,
    ToggleLeft, ToggleRight, Check, RotateCcw,
} from 'lucide-react';
import { Breadcrumb } from '../components/shared/Breadcrumb';
import { sdkStore, type SDKSettings } from '../store';

type SettingsTab = 'general' | 'chains' | 'compliance' | 'custody' | 'notifications';

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'chains', label: 'Chains', icon: Link2 },
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'custody', label: 'Custody', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
];

const CHAINS = [
    { name: 'Polygon Amoy', chainId: 80002 },
    { name: 'Ethereum Sepolia', chainId: 11155111 },
    { name: 'Avalanche Fuji', chainId: 43113 },
    { name: 'Arbitrum Sepolia', chainId: 421614 },
    { name: 'Base Sepolia', chainId: 84532 },
    { name: 'Polygon Mainnet', chainId: 137 },
    { name: 'Ethereum Mainnet', chainId: 1 },
];

const WEBHOOK_EVENTS = [
    'asset.created', 'asset.transferred', 'asset.burned',
    'identity.verified', 'identity.revoked',
    'compliance.check.passed', 'compliance.check.failed',
    'cashflow.distributed', 'escrow.released',
    'governance.vote.cast', 'governance.proposal.executed',
];

function ToggleSwitch({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label?: string }) {
    return (
        <button onClick={onToggle} className="flex items-center gap-2">
            {enabled ? (
                <ToggleRight className="w-8 h-5 text-[#F8B032]" />
            ) : (
                <ToggleLeft className="w-8 h-5 text-gray-600" />
            )}
            {label && <span className="text-sm text-gray-400">{label}</span>}
        </button>
    );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between py-4 border-b border-white/5 last:border-0">
            <div className="flex-1 mr-6">
                <p className="text-sm font-medium text-white">{label}</p>
                {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function SelectInput({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-white/5 border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F8B032] focus:border-[#F8B032]/50 min-w-[180px]"
        >
            {options.map(opt => (
                <option key={opt} value={opt} className="bg-gray-900">{opt}</option>
            ))}
        </select>
    );
}

function TextInput({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
    return (
        <input
            type="text"
            value={value}
            readOnly={readOnly}
            onChange={e => onChange?.(e.target.value)}
            className={`bg-white/5 border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F8B032] focus:border-[#F8B032]/50 min-w-[280px] ${readOnly ? 'opacity-60 cursor-default' : ''}`}
        />
    );
}

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [settings, setSettings] = useState<SDKSettings>(sdkStore.getSettings());

    useEffect(() => {
        const unsubscribe = sdkStore.subscribe(() => {
            setSettings(sdkStore.getSettings());
        });
        return () => unsubscribe();
    }, []);

    const update = useCallback((partial: Partial<SDKSettings>) => {
        sdkStore.updateSettings(partial);
    }, []);

    const renderGeneral = () => (
        <div>
            <SettingRow label="Environment" description="SDK operating environment">
                <SelectInput
                    value={settings.environment}
                    options={['testnet', 'mainnet', 'local']}
                    onChange={v => update({ environment: v as SDKSettings['environment'] })}
                />
            </SettingRow>
            <SettingRow label="SDK Version" description="Currently deployed SDK version">
                <TextInput value="v2.4.1-beta" readOnly />
            </SettingRow>
            <SettingRow label="API Base URL" description="Backend API endpoint">
                <TextInput value="https://api.ahoy.fund/v2" readOnly />
            </SettingRow>
            <SettingRow label="Log Level" description="Console output verbosity">
                <SelectInput
                    value={settings.logLevel}
                    options={['debug', 'info', 'warn', 'error']}
                    onChange={v => update({ logLevel: v as SDKSettings['logLevel'] })}
                />
            </SettingRow>
        </div>
    );

    const renderChains = () => (
        <div>
            <p className="text-sm text-gray-400 mb-4">Toggle supported chains for SDK operations. Active chains are available for asset deployment and transfers.</p>
            <div className="space-y-1">
                {CHAINS.map(chain => (
                    <div key={chain.chainId} className="flex items-center justify-between py-3 px-4 rounded-lg border border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${settings.enabledChains[chain.chainId] ? 'bg-green-500' : 'bg-gray-600'}`} />
                            <div>
                                <p className="text-sm text-white font-medium">{chain.name}</p>
                                <p className="text-xs text-gray-500">Chain ID: {chain.chainId}</p>
                            </div>
                        </div>
                        <ToggleSwitch
                            enabled={!!settings.enabledChains[chain.chainId]}
                            onToggle={() => update({
                                enabledChains: {
                                    ...settings.enabledChains,
                                    [chain.chainId]: !settings.enabledChains[chain.chainId],
                                },
                            })}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

    const renderCompliance = () => (
        <div>
            <SettingRow label="Jurisdiction" description="Primary regulatory jurisdiction for compliance rules">
                <SelectInput value={settings.jurisdiction} options={['UAE', 'EU (MiCA)', 'US (Reg D)', 'Singapore', 'UK']} onChange={v => update({ jurisdiction: v })} />
            </SettingRow>
            <SettingRow label="KYC Provider" description="Identity verification service provider">
                <SelectInput value={settings.kycProvider} options={['SumSub', 'Onfido', 'Jumio', 'Manual']} onChange={v => update({ kycProvider: v })} />
            </SettingRow>
            <SettingRow label="Compliance Mode" description="How strictly compliance rules are enforced">
                <SelectInput value={settings.complianceMode} options={['strict', 'permissive', 'audit-only']} onChange={v => update({ complianceMode: v as SDKSettings['complianceMode'] })} />
            </SettingRow>
            <SettingRow label="AML Screening" description="Automated anti-money laundering transaction screening">
                <ToggleSwitch enabled={settings.amlEnabled} onToggle={() => update({ amlEnabled: !settings.amlEnabled })} />
            </SettingRow>
        </div>
    );

    const renderCustody = () => (
        <div>
            <SettingRow label="Custody Adapter" description="Key management and signing infrastructure">
                <SelectInput value={settings.custodyAdapter} options={['Fireblocks', 'Multi-Sig (Safe)', 'Hot Wallet (MetaMask)', 'AWS KMS']} onChange={v => update({ custodyAdapter: v })} />
            </SettingRow>
            <SettingRow label="Vault ID" description="Primary vault for asset operations">
                <TextInput value={settings.vaultId} onChange={v => update({ vaultId: v })} />
            </SettingRow>
            <SettingRow label="Signing Policy" description="Transaction approval workflow">
                <SelectInput value="2-of-3 Approval" options={['Single Signer', '2-of-3 Approval', '3-of-5 Approval', 'Custom Policy']} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="Auto-Sign Threshold" description="Transactions below this USD value auto-approve">
                <TextInput value="$10,000" onChange={() => {}} />
            </SettingRow>
        </div>
    );

    const renderNotifications = () => (
        <div>
            <SettingRow label="Webhook URL" description="Endpoint for SDK event delivery">
                <TextInput value={settings.webhookUrl} onChange={v => update({ webhookUrl: v })} />
            </SettingRow>
            <SettingRow label="Email Alerts" description="Send critical events via email to admin">
                <ToggleSwitch enabled={settings.emailAlerts} onToggle={() => update({ emailAlerts: !settings.emailAlerts })} />
            </SettingRow>
            <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Webhook Events</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {WEBHOOK_EVENTS.map(event => (
                        <button
                            key={event}
                            onClick={() => update({
                                enabledWebhookEvents: {
                                    ...settings.enabledWebhookEvents,
                                    [event]: !settings.enabledWebhookEvents[event],
                                },
                            })}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                                settings.enabledWebhookEvents[event]
                                    ? 'border-[#F8B032]/20 bg-[#F8B032]/5'
                                    : 'border-white/5 bg-white/[0.02]'
                            }`}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                settings.enabledWebhookEvents[event]
                                    ? 'border-[#F8B032] bg-[#F8B032]'
                                    : 'border-gray-600'
                            }`}>
                                {settings.enabledWebhookEvents[event] && <Check className="w-3 h-3 text-black" />}
                            </div>
                            <span className={`text-sm font-mono ${settings.enabledWebhookEvents[event] ? 'text-white' : 'text-gray-500'}`}>
                                {event}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const TAB_CONTENT: Record<SettingsTab, () => JSX.Element> = {
        general: renderGeneral,
        chains: renderChains,
        compliance: renderCompliance,
        custody: renderCustody,
        notifications: renderNotifications,
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
            <Breadcrumb items={[{ label: 'Settings' }]} />

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F8B032]/10 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-[#F8B032]" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Settings</h1>
                </div>
                <p className="text-gray-400">
                    Configure SDK environment, chain support, compliance rules, custody adapters, and notification preferences.
                    <span className="text-gray-500 ml-1">Changes are saved automatically.</span>
                </p>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg overflow-x-auto mb-8">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-[#F8B032] text-black font-medium'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-sm">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
                {TAB_CONTENT[activeTab]()}
            </div>

            {/* Reset Button */}
            <div className="mt-6 flex justify-end">
                <button
                    onClick={() => sdkStore.resetSettings()}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:border-white/20 transition-colors flex items-center gap-2"
                >
                    <RotateCcw className="w-4 h-4" />
                    Reset to Defaults
                </button>
            </div>
        </div>
    );
}
