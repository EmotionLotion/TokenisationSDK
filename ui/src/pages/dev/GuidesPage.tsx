import { useState } from 'react';
import { BookOpen, Palette, Library, Unplug, GitCompare, Radio, Boxes } from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { UIKitDemo } from '../UIKitDemo';
import { LibraryPage } from '../../components/LibraryPage';
import { HeadlessDocsPage } from '../../components/HeadlessDocsPage';
import { HeadlessVsLibrary } from '../../components/HeadlessVsLibrary';
import { EventCallbackDemo } from '../EventCallbackDemo';
import { HostedComponentsDemo } from '../../components/HostedComponents';

type GuideTab = 'uikit' | 'library' | 'headless' | 'comparison' | 'events' | 'hosted';

const TABS: { id: GuideTab; label: string; icon: typeof Palette }[] = [
    { id: 'uikit', label: 'UI Kit', icon: Palette },
    { id: 'library', label: 'Component Library', icon: Library },
    { id: 'headless', label: 'Headless Hooks', icon: Unplug },
    { id: 'comparison', label: 'Headless vs Library', icon: GitCompare },
    { id: 'events', label: 'Events & Callbacks', icon: Radio },
    { id: 'hosted', label: 'Hosted Components', icon: Boxes },
];

export function GuidesPage() {
    const [activeTab, setActiveTab] = useState<GuideTab>('uikit');

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Develop', path: '/dev/getting-started' },
                { label: 'SDK Guides' }
            ]} />

            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <div className="p-2 bg-indigo-400/10 rounded-lg">
                        <BookOpen className="w-6 h-6 text-indigo-400" />
                    </div>
                    SDK Guides
                </h1>
                <p className="text-gray-400 mt-1">Comprehensive guides for UI Kit, Headless Hooks, Components, and Events.</p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg overflow-x-auto">
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
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div>
                {activeTab === 'uikit' && <UIKitDemo />}
                {activeTab === 'library' && <LibraryPage />}
                {activeTab === 'headless' && <HeadlessDocsPage />}
                {activeTab === 'comparison' && <HeadlessVsLibrary />}
                {activeTab === 'events' && <EventCallbackDemo />}
                {activeTab === 'hosted' && <HostedComponentsDemo />}
            </div>
        </div>
    );
}
