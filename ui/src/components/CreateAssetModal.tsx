import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { sdkStore } from '../store';
import { RightType, Party, PartyRole } from '../types';

interface CreateAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateAssetModal({ isOpen, onClose }: CreateAssetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rightType, setRightType] = useState<RightType>(RightType.OWNERSHIP);
  const [jurisdiction, setJurisdiction] = useState('AE');
  const [issuerId, setIssuerId] = useState('');
  const [issuers, setIssuers] = useState<Party[]>([]);

  useEffect(() => {
    const update = () => {
      const parties = sdkStore.getParties();
      setIssuers(parties.filter(p => p.roles.includes(PartyRole.ISSUER)));
    };
    update();
    return sdkStore.subscribe(update);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuerId) {
      alert('Please select an issuer');
      return;
    }
    sdkStore.createAsset({
      name,
      description,
      rightType,
      jurisdiction,
      issuerId,
    });
    onClose();
    setName('');
    setDescription('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card w-full max-w-lg rounded-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-white">Create New Asset</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Asset Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g., Dubai Marina Apartment"
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-white placeholder-gray-600 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the asset..."
              rows={3}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-white placeholder-gray-600 outline-none transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Right Type</label>
              <div className="relative">
                <select
                  value={rightType}
                  onChange={e => setRightType(e.target.value as RightType)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-white outline-none appearance-none transition-all"
                >
                  <option value={RightType.OWNERSHIP}>OWNERSHIP</option>
                  <option value={RightType.ACCESS}>ACCESS</option>
                  <option value={RightType.BEHAVIOR}>BEHAVIOR</option>
                  <option value={RightType.VERIFICATION}>VERIFICATION</option>
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Jurisdiction</label>
              <div className="relative">
                <select
                  value={jurisdiction}
                  onChange={e => setJurisdiction(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-white outline-none appearance-none transition-all"
                >
                  <option value="AE">UAE (AE)</option>
                  <option value="US">USA (US)</option>
                  <option value="GB">UK (GB)</option>
                  <option value="SG">Singapore (SG)</option>
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Issuer</label>
            {issuers.length === 0 ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                No issuers available. Create a party with ISSUER role first.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={issuerId}
                  onChange={e => setIssuerId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-white outline-none appearance-none transition-all"
                >
                  <option value="">Select an issuer...</option>
                  {issuers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/10 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={issuers.length === 0}
              className="flex-1 py-2.5 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
            >
              Create Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
