import type { ReactNode } from 'react';

export interface ShowcaseSection {
  id: string;
  label: string;
}

export interface ShowcaseStep {
  id: number;
  title: string;
  description: string;
  code: string;
  sectionId: string;
  action: (addLog: (msg: string) => void, setData: (fn: (prev: Record<string, string>) => Record<string, string>) => void, data: Record<string, string>) => Promise<void>;
  render?: (data: Record<string, string>) => ReactNode;
  completed: boolean;
}

export type VerticalId = 'real-estate' | 'airline' | 'car-rental' | 'hotel' | 'concert';

export interface ShowcaseConfig {
  id: VerticalId;
  name: string;
  shortName: string;
  description: string;
  color: string;
  icon: ReactNode;
  sections?: ShowcaseSection[];
  steps: ShowcaseStep[];
}
