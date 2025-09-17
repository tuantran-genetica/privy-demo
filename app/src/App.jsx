import React from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { PrivyAuthUI } from './components/PrivyAuthUI.jsx'
import { Navbar } from './components/Navbar.jsx'
import { Admin } from './components/Admin.jsx'

const appId = import.meta.env.VITE_PRIVY_APP_ID
const clientId = import.meta.env.VITE_PRIVY_CLIENT_ID

if (!appId) {
  console.error('VITE_PRIVY_APP_ID is not set in environment variables')
}

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
            coinbaseWallet: true,
            metamask: true,
            rainbow: true,
            walletConnect: true
          },
          // Handle wallet conflicts more gracefully
          detectWallets: true
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users'
          }
        },
        defaultChain: { id: 11155111, name: 'Sepolia' }
      }}
    >
      <Navbar />
      <div className="container">
        <PrivyAuthUI />
        <hr style={{ margin: '24px 0' }} />
        <Admin />
      </div>
    </PrivyProvider>
  )
}


