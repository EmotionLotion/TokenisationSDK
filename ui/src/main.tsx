import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { AuthProvider } from './contexts/AuthContext'
import { SDKProvider } from './contexts/SDKContext'
import { router } from './routes'
import './index.css'

// Create a react-query client for wagmi
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SDKProvider>
            <RouterProvider router={router} />
          </SDKProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
