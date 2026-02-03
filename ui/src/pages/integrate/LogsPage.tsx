import { useState, useEffect, useMemo } from 'react';
import {
    Terminal, Filter, Download, Search, RefreshCw, X, Eye,
    ChevronLeft, ChevronRight, Clock, Server, ArrowRight, Copy, Check, Trash2
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';

type LogLevel = 'info' | 'warning' | 'error' | 'success';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiLog {
    id: string;
    timestamp: string;
    method: HttpMethod;
    endpoint: string;
    statusCode: number;
    duration: string;
    level: LogLevel;
    requestId: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
    responseBody?: unknown;
    ipAddress?: string;
    userAgent?: string;
    apiKeyId?: string;
}

const STORAGE_KEY = 'tokenisation_api_logs';
const LOGS_PER_PAGE = 10;

// Generate realistic sample logs
function generateSampleLogs(): ApiLog[] {
    const endpoints = [
        { method: 'POST' as HttpMethod, endpoint: '/v1/assets', statusCodes: [201, 400, 401, 500] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/assets', statusCodes: [200, 401, 500] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/assets/:id', statusCodes: [200, 404, 401] },
        { method: 'PUT' as HttpMethod, endpoint: '/v1/assets/:id', statusCodes: [200, 400, 404, 401] },
        { method: 'DELETE' as HttpMethod, endpoint: '/v1/assets/:id', statusCodes: [204, 404, 401] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/identities', statusCodes: [201, 400, 401] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/identities', statusCodes: [200, 401] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/identities/:id', statusCodes: [200, 404, 401] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/identities/:id/verify', statusCodes: [200, 400, 404] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/transfers', statusCodes: [201, 400, 401, 422] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/transfers', statusCodes: [200, 401] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/policies', statusCodes: [201, 400, 401] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/policies/validate', statusCodes: [200, 400] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/distributions', statusCodes: [200, 401] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/distributions', statusCodes: [201, 400, 401] },
        { method: 'GET' as HttpMethod, endpoint: '/v1/oracle/price', statusCodes: [200, 503] },
        { method: 'POST' as HttpMethod, endpoint: '/v1/webhooks/test', statusCodes: [200, 400] },
    ];

    const logs: ApiLog[] = [];
    const now = Date.now();

    for (let i = 0; i < 50; i++) {
        const config = endpoints[Math.floor(Math.random() * endpoints.length)];
        const statusCode = config.statusCodes[Math.floor(Math.random() * config.statusCodes.length)];
        const timestamp = new Date(now - i * 60000 * Math.random() * 10).toISOString();
        const duration = Math.floor(50 + Math.random() * 500);

        let endpoint = config.endpoint;
        if (endpoint.includes(':id')) {
            endpoint = endpoint.replace(':id', `id_${Math.random().toString(36).substring(2, 10)}`);
        }

        const level: LogLevel = statusCode >= 500 ? 'error'
            : statusCode >= 400 ? 'warning'
            : statusCode >= 200 && statusCode < 300 ? 'success'
            : 'info';

        logs.push({
            id: `log_${Date.now()}_${i}`,
            timestamp,
            method: config.method,
            endpoint,
            statusCode,
            duration: `${duration}ms`,
            level,
            requestId: `req_${Math.random().toString(36).substring(2, 14)}`,
            requestHeaders: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk_test_***',
                'X-Request-Id': `req_${Math.random().toString(36).substring(2, 14)}`,
                'User-Agent': 'TokenisationSDK/1.0.0',
            },
            requestBody: config.method !== 'GET' ? {
                example: 'request body',
                timestamp: timestamp,
            } : undefined,
            responseHeaders: {
                'Content-Type': 'application/json',
                'X-Request-Id': `req_${Math.random().toString(36).substring(2, 14)}`,
                'X-RateLimit-Remaining': String(Math.floor(Math.random() * 1000)),
            },
            responseBody: statusCode >= 400 ? {
                error: {
                    code: statusCode === 401 ? 'unauthorized' : statusCode === 404 ? 'not_found' : 'bad_request',
                    message: statusCode === 401 ? 'Invalid API key' : statusCode === 404 ? 'Resource not found' : 'Validation failed',
                }
            } : {
                success: true,
                data: { id: `res_${Math.random().toString(36).substring(2, 10)}` }
            },
            ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            userAgent: 'TokenisationSDK/1.0.0 Node.js/18.0.0',
            apiKeyId: `key_${Math.random().toString(36).substring(2, 10)}`,
        });
    }

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function loadLogs(): ApiLog[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load logs:', e);
    }
    const logs = generateSampleLogs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    return logs;
}

function saveLogs(logs: ApiLog[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function LogsPage() {
    const [logs, setLogs] = useState<ApiLog[]>([]);
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        setLogs(loadLogs());
    }, []);

    // Filter logs based on current filters
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Method filter
            if (methodFilter !== 'all' && log.method !== methodFilter) {
                return false;
            }

            // Status filter
            if (statusFilter !== 'all') {
                if (statusFilter === '2xx' && (log.statusCode < 200 || log.statusCode >= 300)) return false;
                if (statusFilter === '4xx' && (log.statusCode < 400 || log.statusCode >= 500)) return false;
                if (statusFilter === '5xx' && log.statusCode < 500) return false;
            }

            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    log.endpoint.toLowerCase().includes(query) ||
                    log.requestId.toLowerCase().includes(query) ||
                    log.method.toLowerCase().includes(query) ||
                    String(log.statusCode).includes(query)
                );
            }

            return true;
        });
    }, [logs, methodFilter, statusFilter, searchQuery]);

    // Paginate logs
    const paginatedLogs = useMemo(() => {
        const start = (currentPage - 1) * LOGS_PER_PAGE;
        return filteredLogs.slice(start, start + LOGS_PER_PAGE);
    }, [filteredLogs, currentPage]);

    const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [methodFilter, statusFilter, searchQuery]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        // Add some new logs to simulate real-time updates
        const newLogs = generateSampleLogs().slice(0, 5).map(log => ({
            ...log,
            id: `log_${Date.now()}_${Math.random()}`,
            timestamp: new Date().toISOString(),
        }));
        const updatedLogs = [...newLogs, ...logs].slice(0, 100); // Keep max 100 logs
        setLogs(updatedLogs);
        saveLogs(updatedLogs);
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleExport = () => {
        const exportData = filteredLogs.map(log => ({
            timestamp: log.timestamp,
            method: log.method,
            endpoint: log.endpoint,
            statusCode: log.statusCode,
            duration: log.duration,
            requestId: log.requestId,
            ipAddress: log.ipAddress,
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClearLogs = () => {
        if (confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
            setLogs([]);
            saveLogs([]);
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const getMethodColor = (method: HttpMethod) => {
        switch (method) {
            case 'GET': return 'bg-blue-400/10 text-blue-400';
            case 'POST': return 'bg-green-400/10 text-green-400';
            case 'PUT': return 'bg-yellow-400/10 text-yellow-400';
            case 'PATCH': return 'bg-orange-400/10 text-orange-400';
            case 'DELETE': return 'bg-red-400/10 text-red-400';
            default: return 'bg-gray-400/10 text-gray-400';
        }
    };

    const getStatusColor = (statusCode: number) => {
        if (statusCode >= 200 && statusCode < 300) return 'bg-green-400/10 text-green-400';
        if (statusCode >= 400 && statusCode < 500) return 'bg-yellow-400/10 text-yellow-400';
        return 'bg-red-400/10 text-red-400';
    };

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return {
            time: date.toLocaleTimeString(),
            date: date.toLocaleDateString(),
        };
    };

    // Stats
    const stats = useMemo(() => {
        const total = logs.length;
        const success = logs.filter(l => l.statusCode >= 200 && l.statusCode < 300).length;
        const errors = logs.filter(l => l.statusCode >= 400).length;
        const avgDuration = logs.length > 0
            ? Math.round(logs.reduce((sum, l) => sum + parseInt(l.duration), 0) / logs.length)
            : 0;
        return { total, success, errors, avgDuration };
    }, [logs]);

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Integrate', path: '/integrate' },
                { label: 'Logs & Monitoring' }
            ]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-blue-400/10 rounded-lg">
                            <Terminal className="w-6 h-6 text-blue-400" />
                        </div>
                        Logs & Monitoring
                    </h1>
                    <p className="text-gray-400 mt-1">View API request logs and monitor integration health.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-card p-4">
                    <div className="text-sm text-gray-400">Total Requests</div>
                    <div className="text-2xl font-bold text-white mt-1">{stats.total}</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-sm text-gray-400">Successful</div>
                    <div className="text-2xl font-bold text-green-400 mt-1">{stats.success}</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-sm text-gray-400">Errors</div>
                    <div className="text-2xl font-bold text-red-400 mt-1">{stats.errors}</div>
                </div>
                <div className="glass-card p-4">
                    <div className="text-sm text-gray-400">Avg Response Time</div>
                    <div className="text-2xl font-bold text-[#F8B032] mt-1">{stats.avgDuration}ms</div>
                </div>
            </div>

            {/* Filters and Search */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">Filter:</span>
                    </div>
                    <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
                    >
                        <option value="all">All Methods</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50"
                    >
                        <option value="all">All Status</option>
                        <option value="2xx">2xx Success</option>
                        <option value="4xx">4xx Client Error</option>
                        <option value="5xx">5xx Server Error</option>
                    </select>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search endpoint, request ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50 w-64"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        disabled={filteredLogs.length === 0}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        Export Logs
                    </button>
                    <button
                        onClick={handleClearLogs}
                        disabled={logs.length === 0}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <Trash2 className="w-4 h-4" />
                        Clear
                    </button>
                </div>
            </div>

            {/* Results count */}
            <div className="text-sm text-gray-400">
                Showing {paginatedLogs.length} of {filteredLogs.length} logs
                {(methodFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
                    <span className="ml-2">
                        (filtered from {logs.length} total)
                    </span>
                )}
            </div>

            {/* Logs Table */}
            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {paginatedLogs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-gray-400">
                                    {logs.length === 0 ? 'No logs available' : 'No logs match your filters'}
                                </td>
                            </tr>
                        ) : (
                            paginatedLogs.map((log) => {
                                const { time, date } = formatTimestamp(log.timestamp);
                                return (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-white/5 cursor-pointer transition-colors"
                                        onClick={() => setSelectedLog(log)}
                                    >
                                        <td className="p-4">
                                            <div className="text-sm text-white font-mono">{time}</div>
                                            <div className="text-xs text-gray-500">{date}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-mono font-medium ${getMethodColor(log.method)}`}>
                                                {log.method}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm font-mono text-white max-w-xs truncate">{log.endpoint}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-mono ${getStatusColor(log.statusCode)}`}>
                                                {log.statusCode}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-400">{log.duration}</td>
                                        <td className="p-4 text-sm font-mono text-gray-500">{log.requestId}</td>
                                        <td className="p-4">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedLog(log);
                                                }}
                                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                            >
                                                <Eye className="w-4 h-4 text-gray-400" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (currentPage <= 3) {
                                pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = currentPage - 2 + i;
                            }

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`px-3 py-2 rounded-lg transition-colors ${
                                        currentPage === pageNum
                                            ? 'bg-[#F8B032] text-black'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Log Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <span className={`px-2 py-1 rounded text-xs font-mono font-medium ${getMethodColor(selectedLog.method)}`}>
                                    {selectedLog.method}
                                </span>
                                <span className="text-white font-mono">{selectedLog.endpoint}</span>
                                <span className={`px-2 py-1 rounded text-xs font-mono ${getStatusColor(selectedLog.statusCode)}`}>
                                    {selectedLog.statusCode}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {/* Request Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-sm">Timestamp</span>
                                    </div>
                                    <div className="text-white font-mono text-sm">
                                        {new Date(selectedLog.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Server className="w-4 h-4" />
                                        <span className="text-sm">Duration</span>
                                    </div>
                                    <div className="text-white font-mono text-sm">{selectedLog.duration}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="text-sm text-gray-400">Request ID</div>
                                    <div className="flex items-center gap-2">
                                        <code className="text-white font-mono text-sm bg-white/5 px-2 py-1 rounded">
                                            {selectedLog.requestId}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(selectedLog.requestId, 'requestId')}
                                            className="p-1 hover:bg-white/10 rounded"
                                        >
                                            {copiedField === 'requestId' ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-gray-400" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm text-gray-400">IP Address</div>
                                    <div className="text-white font-mono text-sm">{selectedLog.ipAddress || 'N/A'}</div>
                                </div>
                            </div>

                            {/* Request/Response Flow */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="w-4 h-4 text-blue-400" />
                                    <span className="text-sm font-medium text-white">Request</span>
                                </div>

                                {selectedLog.requestHeaders && (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-500 uppercase">Headers</div>
                                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                            {Object.entries(selectedLog.requestHeaders).map(([key, value]) => (
                                                <div key={key} className="text-gray-300">
                                                    <span className="text-[#F8B032]">{key}</span>: {value}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedLog.requestBody && (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-500 uppercase">Body</div>
                                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                            <pre className="text-gray-300">
                                                {JSON.stringify(selectedLog.requestBody, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="w-4 h-4 text-green-400 rotate-180" />
                                    <span className="text-sm font-medium text-white">Response</span>
                                </div>

                                {selectedLog.responseHeaders && (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-500 uppercase">Headers</div>
                                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                            {Object.entries(selectedLog.responseHeaders).map(([key, value]) => (
                                                <div key={key} className="text-gray-300">
                                                    <span className="text-[#F8B032]">{key}</span>: {value}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedLog.responseBody && (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-500 uppercase">Body</div>
                                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                            <pre className={`${selectedLog.statusCode >= 400 ? 'text-red-400' : 'text-gray-300'}`}>
                                                {JSON.stringify(selectedLog.responseBody, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                            <button
                                onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), 'fullLog')}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                                {copiedField === 'fullLog' ? (
                                    <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                    <Copy className="w-4 h-4" />
                                )}
                                Copy Full Log
                            </button>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-4 py-2 bg-[#F8B032] text-black rounded-lg hover:bg-[#F8B032]/80 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
