import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ConcertDemo } from '../../components/ConcertDemo';

export function ConcertApp() {
    const navigate = useNavigate();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                onClick={() => navigate('/')}
                className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                </div>
                <span className="font-medium">Back to Ecosystem Hub</span>
            </button>
            <ConcertDemo />
        </div>
    );
}
