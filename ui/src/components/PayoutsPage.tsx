import React, { useState } from 'react';
import {
    Wallet, ArrowUpRight, Clock, CheckCircle, XCircle, AlertTriangle,
    DollarSign, Users, Calendar, Filter, Download, Plus, RefreshCw,
    PieChart, TrendingUp, FileText, ChevronRight, Building, Coins
} from 'lucide-react';

// Types based on StripeSDKPlan Section 3G and 8.6
type DistributionType = 'dividend' | 'interest' | 'revenue_share' | 'redemption' | 'airdrop';
type DistributionStatus = 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface Distribution {
    id: string;
    assetId: string;
    assetName: string;
    type: DistributionType;
    status: DistributionStatus;
    totalAmount: string;
    currency: string;
    recipientCount: number;
    eligibleHolders: number;
    distributedAmount: string;
    scheduledDate: string;
    executedDate?: string;
    description: string;
    snapshotBlock?: number;
}

interface PayoutStats {
    totalDistributed: string;
    pendingPayouts: string;
    scheduledCount: number;
    avgProcessingTime: string;
}

// Sample data
const SAMPLE_DISTRIBUTIONS: Distribution[] = [
    {
        id: 'dist_001',
        assetId: 'asset_marina_001',
        assetName: 'Marina Bay Tower REIT',
        type: 'dividend',
        status: 'completed',
        totalAmount: '125,000',
        currency: 'USDC',
        recipientCount: 847,
        eligibleHolders: 892,
        distributedAmount: '125,000',
        scheduledDate: '2025-01-01T00:00:00Z',
        executedDate: '2025-01-01T00:05:23Z',
        description: 'Q4 2024 Dividend Distribution',
        snapshotBlock: 18234567
    },
    {
        id: 'dist_002',
        assetId: 'asset_carbon_001',
        assetName: 'Amazon Reforestation Credits',
        type: 'revenue_share',
        status: 'processing',
        totalAmount: '45,000',
        currency: 'USDC',
        recipientCount: 234,
        eligibleHolders: 312,
        distributedAmount: '23,450',
        scheduledDate: '2025-01-08T10:00:00Z',
        description: 'Monthly Carbon Offset Revenue',
        snapshotBlock: 18345678
    },
    {
        id: 'dist_003',
        assetId: 'asset_bond_001',
        assetName: 'Corporate Bond Series A',
        type: 'interest',
        status: 'scheduled',
        totalAmount: '78,500',
        currency: 'USDC',
        recipientCount: 0,
        eligibleHolders: 156,
        distributedAmount: '0',
        scheduledDate: '2025-01-15T00:00:00Z',
        description: 'Monthly Interest Payment',
    },
    {
        id: 'dist_004',
        assetId: 'asset_ticket_001',
        assetName: 'Tech Summit 2025 VIP',
        type: 'airdrop',
        status: 'completed',
        totalAmount: '500',
        currency: 'MERCH',
        recipientCount: 500,
        eligibleHolders: 500,
        distributedAmount: '500',
        scheduledDate: '2025-01-05T12:00:00Z',
        executedDate: '2025-01-05T12:01:15Z',
        description: 'Exclusive Merch Token Airdrop',
        snapshotBlock: 18298765
    },
    {
        id: 'dist_005',
        assetId: 'asset_fund_001',
        assetName: 'Venture Growth Fund',
        type: 'redemption',
        status: 'failed',
        totalAmount: '250,000',
        currency: 'USDC',
        recipientCount: 0,
        eligibleHolders: 45,
        distributedAmount: '0',
        scheduledDate: '2025-01-07T00:00:00Z',
        description: 'Quarterly Redemption Window',
    },
];

const STATS: PayoutStats = {
    totalDistributed: '$2.4M',
    pendingPayouts: '$373,500',
    scheduledCount: 12,
    avgProcessingTime: '2.3 min'
};

const TYPE_CONFIG: Record<DistributionType, { label: string; color: string; icon: React.ElementType }> = {
    dividend: { label: 'Dividend', color: 'text-green-400 bg-green-400/10', icon: DollarSign },
    interest: { label: 'Interest', color: 'text-blue-400 bg-blue-400/10', icon: TrendingUp },
    revenue_share: { label: 'Revenue Share', color: 'text-purple-400 bg-purple-400/10', icon: PieChart },
    redemption: { label: 'Redemption', color: 'text-orange-400 bg-orange-400/10', icon: ArrowUpRight },
    airdrop: { label: 'Airdrop', color: 'text-pink-400 bg-pink-400/10', icon: Coins }
};

const STATUS_CONFIG: Record<DistributionStatus, { label: string; color: string; icon: React.ElementType }> = {
    scheduled: { label: 'Scheduled', color: 'text-blue-400 bg-blue-400/10', icon: Clock },
    processing: { label: 'Processing', color: 'text-yellow-400 bg-yellow-400/10', icon: RefreshCw },
    completed: { label: 'Completed', color: 'text-green-400 bg-green-400/10', icon: CheckCircle },
    failed: { label: 'Failed', color: 'text-red-400 bg-red-400/10', icon: XCircle },
    cancelled: { label: 'Cancelled', color: 'text-gray-400 bg-gray-400/10', icon: AlertTriangle }
};

export function PayoutsPage() {
    const [selectedType, setSelectedType] = useState<DistributionType | 'all'>('all');
    const [selectedStatus, setSelectedStatus] = useState<DistributionStatus | 'all'>('all');
    const [selectedDistribution, setSelectedDistribution] = useState<Distribution | null>(null);

    const filteredDistributions = SAMPLE_DISTRIBUTIONS.filter(d => {
        if (selectedType !== 'all' && d.type !== selectedType) return false;
        if (selectedStatus !== 'all' && d.status !== selectedStatus) return false;
        return true;
    });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-[#F8B032]/10 rounded-lg">
                            <Wallet className="w-6 h-6 text-[#F8B032]" />
                        </div>
                        Payouts & Distributions
                    </h1>
                    <p className="text-gray-400 mt-1">Manage dividend distributions, revenue sharing, and redemptions</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-all flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        New Distribution
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Total Distributed</span>
                        <DollarSign className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{STATS.totalDistributed}</p>
                    <p className="text-xs text-green-400 mt-1">+18.5% from last month</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Pending Payouts</span>
                        <Clock className="w-4 h-4 text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{STATS.pendingPayouts}</p>
                    <p className="text-xs text-gray-500 mt-1">3 distributions in queue</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Scheduled</span>
                        <Calendar className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{STATS.scheduledCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Next 30 days</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Avg Processing</span>
                        <RefreshCw className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{STATS.avgProcessingTime}</p>
                    <p className="text-xs text-gray-500 mt-1">Per distribution</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Filter by:</span>
                </div>
                <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value as DistributionType | 'all')}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
                >
                    <option value="all">All Types</option>
                    {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                    ))}
                </select>
                <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as DistributionStatus | 'all')}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
                >
                    <option value="all">All Statuses</option>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                    ))}
                </select>
            </div>

            {/* Distributions List */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5">
                    <h2 className="font-semibold text-white">Distribution History</h2>
                </div>
                <div className="divide-y divide-white/5">
                    {filteredDistributions.map((distribution) => {
                        const typeConfig = TYPE_CONFIG[distribution.type];
                        const statusConfig = STATUS_CONFIG[distribution.status];
                        const TypeIcon = typeConfig.icon;
                        const StatusIcon = statusConfig.icon;
                        const progress = distribution.eligibleHolders > 0
                            ? (distribution.recipientCount / distribution.eligibleHolders) * 100
                            : 0;

                        return (
                            <div
                                key={distribution.id}
                                className="p-4 hover:bg-white/5 transition-colors cursor-pointer"
                                onClick={() => setSelectedDistribution(distribution)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${typeConfig.color.split(' ')[1]}`}>
                                            <TypeIcon className={`w-5 h-5 ${typeConfig.color.split(' ')[0]}`} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-white">{distribution.description}</h3>
                                                <span className={`px-2 py-0.5 rounded text-xs ${statusConfig.color}`}>
                                                    <StatusIcon className="w-3 h-3 inline mr-1" />
                                                    {statusConfig.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-sm text-gray-400">{distribution.assetName}</span>
                                                <span className="text-xs text-gray-500">•</span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${typeConfig.color}`}>
                                                    {typeConfig.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <p className="font-mono text-lg font-semibold text-white">
                                                {distribution.totalAmount} {distribution.currency}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {distribution.recipientCount} / {distribution.eligibleHolders} recipients
                                            </p>
                                        </div>
                                        <div className="w-32">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-gray-500">Progress</span>
                                                <span className="text-gray-400">{Math.round(progress)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        distribution.status === 'completed'
                                                            ? 'bg-green-500'
                                                            : distribution.status === 'failed'
                                                            ? 'bg-red-500'
                                                            : 'bg-[#F8B032]'
                                                    }`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="text-right min-w-[140px]">
                                            <p className="text-sm text-gray-300">
                                                {distribution.status === 'scheduled' ? 'Scheduled:' : 'Executed:'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatDate(distribution.executedDate || distribution.scheduledDate)}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-gray-600" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Distribution Detail Modal */}
            {selectedDistribution && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                        <div className="p-6 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${TYPE_CONFIG[selectedDistribution.type].color.split(' ')[1]}`}>
                                        {React.createElement(TYPE_CONFIG[selectedDistribution.type].icon, {
                                            className: `w-5 h-5 ${TYPE_CONFIG[selectedDistribution.type].color.split(' ')[0]}`
                                        })}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{selectedDistribution.description}</h2>
                                        <p className="text-sm text-gray-400">{selectedDistribution.id}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedDistribution(null)}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <XCircle className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Status Banner */}
                            <div className={`p-4 rounded-lg ${STATUS_CONFIG[selectedDistribution.status].color.split(' ')[1]} border border-white/10`}>
                                <div className="flex items-center gap-3">
                                    {React.createElement(STATUS_CONFIG[selectedDistribution.status].icon, {
                                        className: `w-5 h-5 ${STATUS_CONFIG[selectedDistribution.status].color.split(' ')[0]}`
                                    })}
                                    <div>
                                        <p className={`font-medium ${STATUS_CONFIG[selectedDistribution.status].color.split(' ')[0]}`}>
                                            {STATUS_CONFIG[selectedDistribution.status].label}
                                        </p>
                                        <p className="text-sm text-gray-400">
                                            {selectedDistribution.status === 'completed'
                                                ? `Completed on ${formatDate(selectedDistribution.executedDate!)}`
                                                : selectedDistribution.status === 'scheduled'
                                                ? `Scheduled for ${formatDate(selectedDistribution.scheduledDate)}`
                                                : selectedDistribution.status === 'processing'
                                                ? 'Distribution in progress...'
                                                : 'Distribution failed - check error logs'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Distribution Details */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Asset</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Building className="w-4 h-4 text-[#F8B032]" />
                                            <p className="text-white">{selectedDistribution.assetName}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Type</p>
                                        <p className={`mt-1 ${TYPE_CONFIG[selectedDistribution.type].color.split(' ')[0]}`}>
                                            {TYPE_CONFIG[selectedDistribution.type].label}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Snapshot Block</p>
                                        <p className="text-white font-mono mt-1">
                                            {selectedDistribution.snapshotBlock || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Total Amount</p>
                                        <p className="text-2xl font-bold text-white mt-1">
                                            {selectedDistribution.totalAmount} {selectedDistribution.currency}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Distributed</p>
                                        <p className="text-white mt-1">
                                            {selectedDistribution.distributedAmount} {selectedDistribution.currency}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider">Recipients</p>
                                        <p className="text-white mt-1">
                                            {selectedDistribution.recipientCount} of {selectedDistribution.eligibleHolders} holders
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Progress */}
                            <div>
                                <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="text-gray-400">Distribution Progress</span>
                                    <span className="text-white">
                                        {Math.round((selectedDistribution.recipientCount / selectedDistribution.eligibleHolders) * 100)}%
                                    </span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${
                                            selectedDistribution.status === 'completed'
                                                ? 'bg-green-500'
                                                : selectedDistribution.status === 'failed'
                                                ? 'bg-red-500'
                                                : 'bg-[#F8B032]'
                                        }`}
                                        style={{
                                            width: `${(selectedDistribution.recipientCount / selectedDistribution.eligibleHolders) * 100}%`
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                                {selectedDistribution.status === 'scheduled' && (
                                    <>
                                        <button className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg transition-all">
                                            Execute Now
                                        </button>
                                        <button className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 transition-all">
                                            Edit Schedule
                                        </button>
                                        <button className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-all">
                                            Cancel
                                        </button>
                                    </>
                                )}
                                {selectedDistribution.status === 'failed' && (
                                    <button className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg transition-all flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4" />
                                        Retry Distribution
                                    </button>
                                )}
                                <button className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 transition-all flex items-center gap-2 ml-auto">
                                    <FileText className="w-4 h-4" />
                                    View Full Report
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
