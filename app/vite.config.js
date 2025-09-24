import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
        target: process.env.VITE_BUNDLER_URL || 'http://34.87.58.39:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/bundler/, '/'),
      },
      '/paymaster': {
        target: process.env.VITE_PAYMASTER_URL || 'http://34.87.58.39:4337',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/paymaster/, '/'),
      },
      // Proxy to Privy App Wallet RPC for backend signing (dev only)
      '/app-wallet-sign': {
        target: 'https://api.privy.io',
        changeOrigin: true,
        secure: true,
        // Forward to base API – the client will include full path (e.g. /v1/wallets/{id}/rpc)
        rewrite: (path) => path.replace(/^\/app-wallet-sign/, ''),
        headers: {
          'privy-app-id': process.env.VITE_PRIVY_APP_ID || process.env.PRIVY_APP_ID || '',
          'Authorization': process.env.PRIVY_BASIC_AUTH ? `Basic ${process.env.PRIVY_BASIC_AUTH}` : (process.env.VITE_PRIVY_BASIC_AUTH ? `Basic ${process.env.VITE_PRIVY_BASIC_AUTH}` : ''),
        },
      },
    },
  },
})


