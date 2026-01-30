import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Users } from 'lucide-react';

export interface Persona {
  id: string;
  label: string;
  description: string;
  color: string;
  /** Optional SDK PartyRole string for display purposes */
  sdkRole?: string;
}

export interface PersonaSwitcherProps {
  personas: Persona[];
  activePersona: string;
  onSwitch: (id: string) => void;
}

export function PersonaSwitcher({ personas, activePersona, onSwitch }: PersonaSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = personas.find(p => p.id === activePersona) || personas[0];

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
        <span className="font-medium" style={{ color: active?.color }}>
          {active?.label}
        </span>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-white/10 bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          {personas.map(p => (
            <button
              key={p.id}
              onClick={() => { onSwitch(p.id); setOpen(false); }}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                p.id === activePersona ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: p.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{p.label}</p>
                  {p.sdkRole && (
                    <span className="text-[10px] font-mono text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">
                      {p.sdkRole}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
