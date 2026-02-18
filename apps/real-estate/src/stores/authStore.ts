import { create } from 'zustand';

type Role = 'visitor' | 'investor' | 'admin';

interface AuthState {
  isConnected: boolean;
  walletAddress: string | null;
  role: Role;
  connectDemo: () => void;
  disconnect: () => void;
}

function generateDemoAddress(): string {
  const hex = Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `0x${hex}`;
}

export const useAuthStore = create<AuthState>((set) => ({
  isConnected: false,
  walletAddress: null,
  role: 'visitor',

  connectDemo: () =>
    set({
      isConnected: true,
      walletAddress: generateDemoAddress(),
      role: 'investor',
    }),

  disconnect: () =>
    set({
      isConnected: false,
      walletAddress: null,
      role: 'visitor',
    }),
}));
