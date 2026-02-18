import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { TokenisationProvider } from '@tokenisation/sdk-react';
import { router } from './routes';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TokenisationProvider
      config={{
        apiUrl: import.meta.env.VITE_API_URL || '/api',
        publishableKey: import.meta.env.VITE_PUBLISHABLE_KEY || '',
        apiKey: import.meta.env.VITE_API_KEY || '',
        defaultJurisdiction: 'AE',
        debug: import.meta.env.VITE_DEBUG === 'true',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TokenisationProvider>
  </StrictMode>,
);
