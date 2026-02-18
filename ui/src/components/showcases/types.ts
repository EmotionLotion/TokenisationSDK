/**
 * Showcase types — kept for Playground and developer tool infrastructure.
 * Vertical-specific showcase data has been moved to reference apps.
 */

export type VerticalId = string;

export interface ShowcaseStep {
  id: string;
  title: string;
  description: string;
  code: string;
  sdkMethod?: string;
  sectionId?: string;
  completed?: boolean;
  result?: string;
}

export interface ShowcaseSection {
  id: string;
  label: string;
}

export interface ShowcaseConfig {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  steps: ShowcaseStep[];
  sections?: ShowcaseSection[];
}
