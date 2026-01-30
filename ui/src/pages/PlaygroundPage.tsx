import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import { SandpackPlayground } from '../components/playground/SandpackPlayground';
import { ShowcaseConfigEditor } from '../components/playground/ShowcaseConfigEditor';
import { CodeSnippetGenerator } from '../components/playground/CodeSnippetGenerator';
import { realEstateShowcase } from '../components/showcases/real-estate';
import { airlineShowcase } from '../components/showcases/airline';
import { carRentalShowcase } from '../components/showcases/car-rental';
import { hotelShowcase } from '../components/showcases/hotel';
import { concertShowcase } from '../components/showcases/concert';
import type { ShowcaseConfig, VerticalId } from '../components/showcases/types';

const SHOWCASES: ShowcaseConfig[] = [
  realEstateShowcase,
  airlineShowcase,
  carRentalShowcase,
  hotelShowcase,
  concertShowcase,
];

const DEFAULT_CODE = `import sdk from './sdk-setup';

export default function App() {
  const handleCreateAsset = async () => {
    const asset = await sdk.assets.create({
      name: 'My Tokenised Asset',
      rightType: 'OWNERSHIP',
      jurisdiction: 'AE',
    });
    console.log('Created:', asset);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>TokenisationSDK Playground</h2>
      <p>Edit this code to experiment with the SDK.</p>
      <button
        onClick={handleCreateAsset}
        style={{
          padding: '10px 20px',
          background: '#F8B032',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: 12,
        }}
      >
        Create Asset
      </button>
    </div>
  );
}
`;

export function PlaygroundPage() {
  const { vertical } = useParams<{ vertical?: string }>();
  const initialVertical = (vertical as VerticalId) || 'real-estate';
  const [activeVertical, setActiveVertical] = useState<VerticalId>(
    SHOWCASES.find(s => s.id === initialVertical) ? initialVertical : 'real-estate'
  );
  const [activeStep, setActiveStep] = useState(0);

  const showcase = SHOWCASES.find(s => s.id === activeVertical)!;
  const step = showcase.steps[activeStep] || showcase.steps[0];

  const playgroundCode = step
    ? `// Generated from: ${showcase.name} — Step ${step.id}: ${step.title}
// ${step.description}

import sdk from './sdk-setup';

export default function App() {
  const run = async () => {
    ${step.code.split('\n').map(l => '    ' + l).join('\n')}
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>${step.title}</h2>
      <p style={{ color: '#888' }}>${step.description}</p>
      <button
        onClick={run}
        style={{
          padding: '10px 20px',
          background: '#F8B032',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: 12,
        }}
      >
        Run Step
      </button>
    </div>
  );
}
`
    : DEFAULT_CODE;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Code2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Interactive Playground</h1>
          <p className="text-sm text-gray-400">Live-edit SDK code with instant preview</p>
        </div>
      </div>

      {/* Vertical Tabs */}
      <div className="glass-card rounded-xl overflow-hidden p-2 flex flex-wrap gap-1">
        {SHOWCASES.map(sc => (
          <button
            key={sc.id}
            onClick={() => {
              setActiveVertical(sc.id);
              setActiveStep(0);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-medium border ${
              sc.id === activeVertical
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white'
            }`}
          >
            {sc.icon}
            <span className="hidden sm:inline">{sc.shortName}</span>
          </button>
        ))}
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Col 1: Showcase Config */}
        <div className="lg:col-span-3 glass-card rounded-xl border border-white/10 p-4">
          <ShowcaseConfigEditor
            config={showcase}
            activeStep={activeStep}
            onStepSelect={setActiveStep}
          />
        </div>

        {/* Col 2: Sandpack Editor + Preview */}
        <div className="lg:col-span-6">
          <SandpackPlayground
            initialCode={playgroundCode}
            showcaseId={showcase.id}
          />
        </div>

        {/* Col 3: Code Snippet */}
        <div className="lg:col-span-3 space-y-4">
          <CodeSnippetGenerator step={step} />
        </div>
      </div>
    </div>
  );
}
