import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const PRIVY_APP_ID = env.VITE_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || ''
  const BUNDLER_URL = env.VITE_BUNDLER_URL || process.env.VITE_BUNDLER_URL || 'http://34.87.58.39:3000'
  const PAYMASTER_URL = env.VITE_PAYMASTER_URL || process.env.VITE_PAYMASTER_URL || 'http://34.87.58.39:4337'

  return {
    plugins: [react()],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        buffer: 'buffer',
      },
    },
    optimizeDeps: {
      include: ['buffer'],
    },
    server: {
      proxy: {
        '/lifeai-rpc': {
          target: 'https://subnets.avax.network',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/lifeai-rpc$/, '/lifeaitest/testnet/rpc'),
        },
        '/bundler': {
          target: BUNDLER_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/bundler/, '/'),
        },
        '/paymaster': {
          target: PAYMASTER_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/paymaster/, '/'),
        },
        // Local API
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '/api'),
        },
        // Proxy to Privy App Wallet RPC for backend signing (dev only)
        '/app-wallet-sign': {
          target: 'https://api.privy.io',
          changeOrigin: true,
          secure: true,
          // Forward to base API – the client will include full path (e.g. /v1/wallets/{id}/rpc)
          rewrite: (path) => path.replace(/^\/app-wallet-sign/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (PRIVY_APP_ID) {
                proxyReq.setHeader('privy-app-id', PRIVY_APP_ID)
              } else {
                console.warn('VITE_PRIVY_APP_ID is not set; Privy requests may fail')
              }
            })
          },
        },
      },
    },
  }
})


