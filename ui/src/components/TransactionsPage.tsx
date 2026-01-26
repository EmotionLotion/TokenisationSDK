import { useState, useEffect } from 'react';
import {
  ArrowLeftRight, Search, Filter, Download, ChevronDown, CheckCircle,
  XCircle, Clock, ArrowUpRight, ArrowDownLeft, ExternalLink, Copy,
  Calendar, User, Box
} from 'lucide-react';
import { sdkStore } from '../store';
import { Event } from '../types';

type TransactionType = 'transfer' | 'mint' | 'burn' | 'freeze' | 'distribute' | 'redeem';
type TransactionStatus = 'completed' | 'pending' | 'failed';

interface Transaction {
  id: string;
  type: TransactionType;
  assetId: string;
  assetName: string;
  from: string;
  to: string;
  amount: string;
  status: TransactionStatus;
  txHash?: string;
  timestamp: string;
  gasUsed?: string;
  blockNumber?: number;
}

// Sample transactions
const SAMPLE_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn_001',
    type: 'transfer',
    assetId: 'asset_marina_tower',
    assetName: 'Marina Tower Unit 1204',
    from: 'Alice Johnson',
    to: 'Bob Smith',
    amount: '1,000',
    status: 'completed',
    txHash: '0x1234...abcd',
    timestamp: '2024-01-15T10:30:00Z',
    gasUsed: '45,000',
    blockNumber: 12345678
  },
  {
    id: 'txn_002',
    type: 'mint',
    assetId: 'asset_carbon_batch',
    assetName: 'Carbon Credit Batch #2024-01',
    from: 'System',
    to: 'Acme Corporation',
    amount: '10,000',
    status: 'completed',
    txHash: '0x5678...efgh',
    timestamp: '2024-01-15T09:15:00Z',
    gasUsed: '65,000',
    blockNumber: 12345670
  },
  {
    id: 'txn_003',
    type: 'distribute',
    assetId: 'asset_marina_tower',
    assetName: 'Marina Tower Unit 1204',
    from: 'SPV Treasury',
    to: 'All Holders',
    amount: '$25,000',
    status: 'completed',
    txHash: '0x9abc...ijkl',
    timestamp: '2024-01-14T15:00:00Z',
    gasUsed: '120,000',
    blockNumber: 12345650
  },
  {
    id: 'txn_004',
    type: 'transfer',
    assetId: 'asset_event_ticket',
    assetName: 'Tech Summit 2024 VIP',
    from: 'Carol Williams',
    to: 'David Lee',
    amount: '2',
    status: 'pending',
    timestamp: '2024-01-15T11:45:00Z'
  },
  {
    id: 'txn_005',
    type: 'redeem',
    assetId: 'asset_loyalty',
    assetName: 'Loyalty Points',
    from: 'Bob Smith',
    to: 'Rewards Program',
    amount: '5,000',
    status: 'failed',
    timestamp: '2024-01-15T08:30:00Z'
  },
  {
    id: 'txn_006',
    type: 'burn',
    assetId: 'asset_carbon_batch',
    assetName: 'Carbon Credit Batch #2023-12',
    from: 'Global Investments Ltd',
    to: 'Retired',
    amount: '500',
    status: 'completed',
    txHash: '0xdefg...mnop',
    timestamp: '2024-01-13T14:20:00Z',
    gasUsed: '55,000',
    blockNumber: 12345600
  }
];

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(SAMPLE_TRANSACTIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tx.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tx.to.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tx.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || tx.type === filterType;
    const matchesStatus = filterStatus === 'all' || tx.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    total: transactions.length,
    completed: transactions.filter(t => t.status === 'completed').length,
    pending: transactions.filter(t => t.status === 'pending').length,
    failed: transactions.filter(t => t.status === 'failed').length,
  };

  const getTypeIcon = (type: TransactionType) => {
    switch (type) {
      case 'transfer': return <ArrowLeftRight className="w-4 h-4" />;
      case 'mint': return <ArrowDownLeft className="w-4 h-4" />;
      case 'burn': return <ArrowUpRight className="w-4 h-4" />;
      case 'distribute': return <ArrowUpRight className="w-4 h-4" />;
      case 'redeem': return <ArrowUpRight className="w-4 h-4" />;
      case 'freeze': return <XCircle className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case 'transfer': return 'bg-blue-500/20 text-blue-400';
      case 'mint': return 'bg-green-500/20 text-green-400';
      case 'burn': return 'bg-orange-500/20 text-orange-400';
      case 'distribute': return 'bg-purple-500/20 text-purple-400';
      case 'redeem': return 'bg-cyan-500/20 text-cyan-400';
      case 'freeze': return 'bg-red-500/20 text-red-400';
    }
  };

  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium">
            <CheckCircle className="w-3 h-3" /> Completed
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded text-xs font-medium">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs font-medium">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Lexend Deca, sans-serif' }}>
            Transactions
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            View and track all asset transactions across the platform
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
        </div>
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-xs text-gray-500 mb-1">Failed</p>
          <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TransactionType | 'all')}
          className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
        >
          <option value="all">All Types</option>
          <option value="transfer">Transfer</option>
          <option value="mint">Mint</option>
          <option value="burn">Burn/Retire</option>
          <option value="distribute">Distribute</option>
          <option value="redeem">Redeem</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TransactionStatus | 'all')}
          className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-4 text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {(['24h', '7d', '30d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                dateRange === range
                  ? 'bg-[#F8B032]/20 text-[#F8B032]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Asset</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">From</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">To</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Amount</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map(tx => (
                <tr
                  key={tx.id}
                  className="hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setSelectedTx(tx)}
                >
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg ${getTypeColor(tx.type)}`}>
                      {getTypeIcon(tx.type)}
                      <span className="text-xs font-medium capitalize">{tx.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-white">{tx.assetName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-300">{tx.from}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-300">{tx.to}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-white">{tx.amount}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(tx.status)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">
                      {new Date(tx.timestamp).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No transactions found</p>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Transaction Details</h2>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${getTypeColor(selectedTx.type)}`}>
                  {getTypeIcon(selectedTx.type)}
                  <span className="text-sm font-medium capitalize">{selectedTx.type}</span>
                </div>
                {getStatusBadge(selectedTx.status)}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Transaction ID</span>
                  <span className="text-sm font-mono text-white">{selectedTx.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Asset</span>
                  <span className="text-sm text-white">{selectedTx.assetName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">From</span>
                  <span className="text-sm text-white">{selectedTx.from}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">To</span>
                  <span className="text-sm text-white">{selectedTx.to}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Amount</span>
                  <span className="text-sm font-mono text-white">{selectedTx.amount}</span>
                </div>
                {selectedTx.txHash && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Tx Hash</span>
                    <span className="text-sm font-mono text-[#F8B032] flex items-center gap-1">
                      {selectedTx.txHash}
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                )}
                {selectedTx.blockNumber && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Block</span>
                    <span className="text-sm font-mono text-white">{selectedTx.blockNumber}</span>
                  </div>
                )}
                {selectedTx.gasUsed && (
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-gray-400">Gas Used</span>
                    <span className="text-sm font-mono text-white">{selectedTx.gasUsed}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-400">Timestamp</span>
                  <span className="text-sm text-white">{new Date(selectedTx.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
