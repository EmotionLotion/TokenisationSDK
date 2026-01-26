import { useEffect, useState } from 'react';
import { UserPlus, CheckCircle, XCircle, Building2, User, Users } from 'lucide-react';
import { sdkStore } from '../store';
import { Party, PartyType, PartyRole } from '../types';

export function PartyManager() {
  const [parties, setParties] = useState<Party[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PartyType>(PartyType.INDIVIDUAL);
  const [roles, setRoles] = useState<PartyRole[]>([PartyRole.INVESTOR]);
  const [jurisdiction, setJurisdiction] = useState('AE');

  useEffect(() => {
    const update = () => setParties(sdkStore.getParties());
    update();
    return sdkStore.subscribe(update);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sdkStore.createParty({ name, type, roles, jurisdiction });
    setShowForm(false);
    setName('');
    setRoles([PartyRole.INVESTOR]);
  };

  const toggleRole = (role: PartyRole) => {
    if (roles.includes(role)) {
      setRoles(roles.filter(r => r !== role));
    } else {
      setRoles([...roles, role]);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Party Management
          </h2>
          <p className="text-gray-400 text-sm mt-1">Manage network participants and KYC status</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <UserPlus className="w-4 h-4" />
          Add Party
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="glass-card rounded-xl p-6 animate-in slide-in-from-top-4 border border-white/10">
          <h3 className="font-bold text-white mb-6">Create New Party</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Party name"
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 text-white outline-none placeholder-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Type</label>
              <div className="relative">
                <select
                  value={type}
                  onChange={e => setType(e.target.value as PartyType)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 text-white outline-none appearance-none"
                >
                  <option value={PartyType.INDIVIDUAL}>Individual</option>
                  <option value={PartyType.ORGANIZATION}>Organization</option>
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Jurisdiction</label>
              <div className="relative">
                <select
                  value={jurisdiction}
                  onChange={e => setJurisdiction(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/50 text-white outline-none appearance-none"
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

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Roles</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(PartyRole).map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${roles.includes(role)
                      ? 'bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_rgba(var(--primary),0.2)]'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                      }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 flex gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2.5 border border-white/10 rounded-xl hover:bg-white/5 text-gray-400 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl transition-colors font-medium shadow-lg shadow-primary/20"
              >
                Create Party
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Parties List */}
      <div className="glass-card rounded-xl overflow-hidden border border-white/10">
        {parties.length === 0 ? (
          <div className="p-16 text-center text-gray-500">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No parties yet. Add one or load demo data.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {parties.map(party => (
              <div key={party.id} className="p-5 flex items-center gap-5 hover:bg-white/5 transition-colors group">
                <div className={`p-3 rounded-xl border ${party.type === PartyType.ORGANIZATION
                  ? 'bg-purple-500/10 border-purple-500/20'
                  : 'bg-blue-500/10 border-blue-500/20'
                  }`}>
                  {party.type === PartyType.ORGANIZATION
                    ? <Building2 className="w-6 h-6 text-purple-400" />
                    : <User className="w-6 h-6 text-blue-400" />
                  }
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white text-lg">{party.name}</span>
                    {party.verificationLevel !== 'NONE' ? (
                      <span className="flex items-center gap-1.5 text-green-400 text-xs font-bold bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                        <CheckCircle className="w-3.5 h-3.5" /> KYC VERIFIED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-500 text-xs font-bold bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                        <XCircle className="w-3.5 h-3.5" /> NOT VERIFIED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-medium text-gray-400">{party.type}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-xs font-medium text-gray-400">{party.jurisdiction}</span>
                    <span className="text-gray-600">•</span>
                    <div className="flex gap-1.5">
                      {party.roles.map(role => (
                        <span key={role} className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold text-gray-300 uppercase tracking-wide border border-white/5">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {party.verificationLevel === 'NONE' && (
                  <button
                    onClick={() => sdkStore.verifyKyc(party.id)}
                    className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg text-sm font-bold hover:bg-green-600 hover:text-white transition-all shadow-[0_0_10px_rgba(22,163,74,0.1)] group-hover:shadow-[0_0_15px_rgba(22,163,74,0.3)]"
                  >
                    Verify KYC
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
