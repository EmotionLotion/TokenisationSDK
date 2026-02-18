import { useState } from 'react';
import { FileText, ChevronRight, Search } from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { EndpointDetail } from '../../components/dev/EndpointDetail';
import { getEndpointGroups, type ApiEndpoint } from '../../data/api-endpoints';

const METHOD_BADGE: Record<string, string> = {
    GET: 'text-blue-400',
    POST: 'text-green-400',
    PUT: 'text-yellow-400',
    PATCH: 'text-orange-400',
    DELETE: 'text-red-400',
};

export function ApiReferencePage() {
    const groups = getEndpointGroups();
    const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(groups[0].endpoints[0]);
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        new Set(groups.map(g => g.name))
    );

    const toggleGroup = (name: string) => {
        const next = new Set(expandedGroups);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setExpandedGroups(next);
    };

    const filteredGroups = groups.map(group => ({
        ...group,
        endpoints: group.endpoints.filter(ep =>
            !search ||
            ep.summary.toLowerCase().includes(search.toLowerCase()) ||
            ep.path.toLowerCase().includes(search.toLowerCase()) ||
            ep.method.toLowerCase().includes(search.toLowerCase())
        ),
    })).filter(g => g.endpoints.length > 0);

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Develop', path: '/dev/getting-started' },
                { label: 'API Reference' }
            ]} />

            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <div className="p-2 bg-violet-400/10 rounded-lg">
                        <FileText className="w-6 h-6 text-violet-400" />
                    </div>
                    API Reference
                </h1>
                <p className="text-gray-400 mt-1">Complete reference for all TokenisationSDK API endpoints.</p>
            </div>

            {/* Two-column layout */}
            <div className="flex gap-6 min-h-[calc(100vh-280px)]">
                {/* Left: Endpoint Tree */}
                <div className="w-72 flex-shrink-0">
                    <div className="sticky top-0 space-y-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search endpoints..."
                                className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                            />
                        </div>

                        {/* Groups */}
                        <div className="glass-card overflow-hidden divide-y divide-white/5 max-h-[calc(100vh-340px)] overflow-y-auto">
                            {filteredGroups.map((group) => (
                                <div key={group.name}>
                                    <button
                                        onClick={() => toggleGroup(group.name)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:bg-white/5 transition-colors"
                                    >
                                        <span>{group.name}</span>
                                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedGroups.has(group.name) ? 'rotate-90' : ''}`} />
                                    </button>
                                    {expandedGroups.has(group.name) && (
                                        <div className="pb-1">
                                            {group.endpoints.map((ep) => (
                                                <button
                                                    key={ep.id}
                                                    onClick={() => setSelectedEndpoint(ep)}
                                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                                        selectedEndpoint.id === ep.id
                                                            ? 'bg-[#F8B032]/10 border-l-2 border-[#F8B032]'
                                                            : 'hover:bg-white/5 border-l-2 border-transparent'
                                                    }`}
                                                >
                                                    <span className={`text-[10px] font-bold font-mono w-10 ${METHOD_BADGE[ep.method]}`}>
                                                        {ep.method}
                                                    </span>
                                                    <span className={`text-sm truncate ${
                                                        selectedEndpoint.id === ep.id ? 'text-white' : 'text-gray-400'
                                                    }`}>
                                                        {ep.summary}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 min-w-0">
                    <EndpointDetail endpoint={selectedEndpoint} />
                </div>
            </div>
        </div>
    );
}
