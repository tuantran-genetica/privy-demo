import React from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { defineChain } from 'viem'
import GaslessErc20 from './components/GaslessErc20.jsx'
import StatusPollingDemo from './components/StatusPollingDemo.jsx'
import { PrivyAuthUI } from './components/PrivyAuthUI.jsx'
import { Navbar } from './components/Navbar.jsx'

const appId = import.meta.env.VITE_PRIVY_APP_ID
const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID

// Basic configuration check
if (!appId) {
  console.error('VITE_PRIVY_APP_ID is not set in environment variables')
}

// LifeAI testnet chain (custom EVM L1)
const lifeAiTestnet = defineChain({
  id: 94909,
  name: 'LifeAI L1 (testnet)',
  nativeCurrency: { name: 'LifeAI', symbol: 'LIFE', decimals: 18 },
  rpcUrls: {
    default: { http: [typeof window !== 'undefined' ? '/lifeai-rpc' : 'https://subnets.avax.network/lifeaitest/testnet/rpc'] },
    public: { http: [typeof window !== 'undefined' ? '/lifeai-rpc' : 'https://subnets.avax.network/lifeaitest/testnet/rpc'] }
  }
})

export default function App() {
  return (
    <PrivyProvider
      appId={appId}
      appClientId={clientId}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#6C5CE7'
        },
        loginMethods: [
          'email', 'google', 'sms', 'wallet'
        ],
        socialLoginProviders: {
          google: true,
        },
        wallets: {
          external: {
            coinbaseWallet: false,
            metamask: true,
            rainbow: true,
            walletConnect: true
          },
          // Handle wallet conflicts more gracefully
          detectWallets: false
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users'
          }
        },
        // Switch default to LifeAI testnet
        defaultChain: lifeAiTestnet,
        // Register custom chain so Privy can build public client
        supportedChains: [lifeAiTestnet]
      }}
    >
      <Navbar />
      <div className="container">
        <PrivyAuthUI chain={lifeAiTestnet} />
        <hr style={{ margin: '24px 0' }} />
        <GaslessErc20 chain={lifeAiTestnet} />
        <hr style={{ margin: '24px 0' }} />
        <StatusPollingDemo chain={lifeAiTestnet} />
      </div>
    </PrivyProvider>
  )
}


