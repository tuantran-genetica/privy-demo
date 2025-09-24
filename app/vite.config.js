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
    },
  },
})


