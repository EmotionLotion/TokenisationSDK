import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

interface ShowcaseConfig {
  vertical: string;
  showcaseId: string;
  theme?: string;
}

interface ExportToZipProps {
  config: ShowcaseConfig;
  generatedCode?: string;
}

function generatePackageJson(config: ShowcaseConfig) {
  return JSON.stringify({
    name: `${config.showcaseId}-demo`,
    private: true,
    version: '0.0.1',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      '@tokenisation/sdk': 'latest',
      '@tokenisation/ui-kit': 'latest',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.0.0',
      typescript: '~5.6.0',
      vite: '^5.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
    },
  }, null, 2);
}

function generateMainTsx() {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function generateAppTsx(config: ShowcaseConfig, code?: string) {
  if (code) return code;
  return `import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>${config.vertical} Demo</h1>
      <p>Generated from TokenisationSDK Showcase</p>
    </div>
  );
}
`;
}

function generateTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
    },
    include: ['src'],
  }, null, 2);
}

function generateViteConfig() {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;
}

function generateReadme(config: ShowcaseConfig) {
  return `# ${config.showcaseId} Demo

Generated from TokenisationSDK Showcase (${config.vertical} vertical).

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Built with

- [TokenisationSDK](https://github.com/tokenisation/sdk)
- React 19
- Vite
`;
}

export function ExportToZip({ config, generatedCode }: ExportToZipProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      zip.file('package.json', generatePackageJson(config));
      zip.file('tsconfig.json', generateTsConfig());
      zip.file('vite.config.ts', generateViteConfig());
      zip.file('README.md', generateReadme(config));
      zip.file('src/main.tsx', generateMainTsx());
      zip.file('src/App.tsx', generateAppTsx(config, generatedCode));
      zip.file('index.html', `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${config.showcaseId} Demo</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.showcaseId}-demo.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors text-sm font-medium text-white disabled:opacity-50"
    >
      {exporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4 text-amber-400" />
      )}
      {exporting ? 'Exporting...' : 'Export to ZIP'}
    </button>
  );
}
