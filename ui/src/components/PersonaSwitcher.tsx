import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Users, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersona, PERSONA_POLICIES, PersonaId } from '../context/PersonaContext';

const PERSONA_IDS: PersonaId[] = ['partner_admin', 'issuer', 'user', 'auditor'];

export function PersonaSwitcher() {
  const { persona, policy, sdkRole, activePartyId, setPersona } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
      >
        <Users className="w-4 h-4 text-gray-400" />
        <span
          className="font-medium"
          style={{ color: policy.color }}
        >
          {policy.label}
        </span>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header showing SDK binding */}
            <div className="px-4 py-2.5 border-b border-white/5 bg-white/5">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Shield className="w-3 h-3" />
                <span>SDK Role: <span className="text-gray-300 font-mono">{sdkRole}</span></span>
              </div>
              {activePartyId && (
                <div className="text-xs text-gray-600 mt-0.5 font-mono truncate">
                  Party: {activePartyId.slice(0, 8)}...
                </div>
              )}
            </div>

            {PERSONA_IDS.map(id => {
              const p = PERSONA_POLICIES[id];
              const active = id === persona;
              return (
                <button
                  key={id}
                  onClick={() => { setPersona(id); setOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{p.label}</p>
                      <span className="text-[10px] font-mono text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">
                        {p.sdkRole}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{p.description}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
