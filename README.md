# Privy Embedded Wallets – Social Login Demo

A streamlined demo showing Privy authentication and embedded wallets on a custom LifeAI testnet.

## ⚡ Quick Start Summary

**What you need to set up:**

1. **Privy Account** → Get App ID
2. **Environment Files** → Configure `.env` files with credentials
3. **Run the App** → Start server & client

**Total setup time: ~5-10 minutes**

## 🎯 What This Demo Shows

- **Auto-Create Embedded Wallets**: Automatically creates EVM wallets on user login
- **Custom Chain (LifeAI testnet)**: Configured via Privy Provider custom chain

## 🏗 Architecture

```
Frontend (React + Vite)     Privy SDKs            Privy API
├── Authentication UI  ──→  ├── Wallets ─→  ├── Wallet Creation
├── Embedded Wallets                            └── User Management
└── Gasless Demo
```

## 🚀 Key Features

### 1. **Automatic Embedded Wallet Creation**

```javascript
embeddedWallets: {
  ethereum: {
    createOnLogin: "all-users"; // 🎯 Auto-creates wallets!
  }
}
```

### 2. **Multi-Chain EVM Support**

- Same wallet address works on all EVM chains
- Currently displays Sepolia balance, but easily extensible
- Chain-agnostic embedded wallets

### 3. **Multiple Authentication Methods**

- Email (passwordless)
- Social login (Google OAuth)
- External wallets (MetaMask, Coinbase, WalletConnect)

## 📋 Prerequisites

- **Node.js 18+**
- **Privy Account** with App ID
- **Environment Variables** (see setup below)

## 🛠 Complete Setup Checklist

### **Phase 1: Account Setup**

#### 1. **Privy Dashboard Setup**

- [ ] Go to [Privy Dashboard](https://dashboard.privy.io)
- [ ] Create account or sign in
- [ ] Create a new app or select existing
- [ ] Copy your **App ID** from the dashboard
- [ ] Configure **Allowed Origins**:
  - Add `http://localhost:5173` (dev)
  - Add `http://localhost:5174` (backup dev port)
  - Add your production domain when ready

### **Phase 2: Code Setup**

#### 2. **Clone and Install Dependencies**

```bash
# Clone the repository
git clone <your-repo-url>
cd privy

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../app
npm install
```

#### 3. **Environment Configuration**

**Create Client Environment** (`app/.env`):

```env
# Required - From Privy Dashboard
VITE_PRIVY_APP_ID=your_privy_app_id_here
```

### **Phase 3: Testing Setup**

#### 4. **Run and Verify**

```bash
cd app && npm run dev
```

**Verification Checklist:**

- [ ] App loads at `http://localhost:5173`
- [ ] Login button appears
- [ ] Can authenticate with email
- [ ] Can authenticate with Google (if configured)
- [ ] Embedded wallet creates automatically
- [ ] Wallet address displays
- [ ] Balance loads (may be 0)

## ⚙️ Detailed Setup Instructions

### 1. **Clone and Install**

```bash
git clone <your-repo>
cd privy

# Install dependencies
cd server && npm install
cd ../app && npm install
```

### 2. **Environment Configuration**

**Server Environment** (`server/.env`):

```env
PRIVY_APP_ID=your_privy_app_id_here
PORT=5057
```

**Client Environment** (`app/.env`):

```env
VITE_PRIVY_APP_ID=your_privy_app_id_here
VITE_SERVER_URL=http://localhost:5057
```

### 3. **Get Privy Credentials**

1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Create a new app or use existing
3. Copy your **App ID**
4. Configure allowed origins (e.g., `http://localhost:5173`)

### 4. **Run the Application**

```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start frontend
cd app && npm run dev
```

Open your browser to the displayed Vite URL (typically `http://localhost:5173`)

## 🎮 How to Use

### **User Authentication Flow**

1. **Visit the app** → See login interface
2. **Choose auth method** → Email, Google, or wallet
3. **Complete authentication** → Privy handles the flow
4. **Wallet auto-created** → Embedded wallet appears instantly
5. **View details** → See address, balance, and user info

## 🔧 Technical Implementation

### **Frontend Architecture**

```javascript
// App.jsx - Main configuration
<PrivyProvider
  appId={appId}
  config={{
    embeddedWallets: {
      ethereum: { createOnLogin: 'all-users' }
    },
    loginMethods: ['email', 'google', 'wallet']
  }}
>
```

### **Custom Chain**

`App.jsx` defines LifeAI testnet with `defineChain` and sets it as `defaultChain`.

## 🔒 Security Features

- **Automatic wallet encryption** by Privy
- **Secure key management** (keys never exposed)
- **Token-based admin authentication**
- **HTTPS-ready configuration**
- **Environment variable isolation**

## 🌐 Multi-Chain Capabilities

### **Supported Networks**

All EVM-compatible chains work with the same embedded wallet:

- Ethereum (Mainnet, Sepolia, Goerli)
- Polygon (Mainnet, Mumbai)
- Arbitrum (One, Sepolia)
- Optimism (Mainnet, Sepolia)
- Base (Mainnet, Sepolia)
- BSC (Mainnet, Testnet)
- And many more...

### **Adding New Chains**

```javascript
// Simply change the chain configuration
const newChainClient = createPublicClient({
  chain: yourChain,
  transport: http(),
});

// Same wallet.address works everywhere!
```

## 📝 Customization Guide

### **Add New Auth Methods**

```javascript
// In App.jsx config
loginMethods: ["email", "google", "discord", "github"];
```

### **Change Default Chain**

Set `defaultChain` and `chains` in `PrivyProvider` config.

### **Modify Wallet Creation**

```javascript
// Options: 'all-users', 'users-without-wallets', 'off'
embeddedWallets: {
  ethereum: {
    createOnLogin: "users-without-wallets";
  }
}
```

## 🐛 Troubleshooting

### **Common Issues**

1. **No wallet address showing**

   - Check console for wallet detection logs
   - Verify `createOnLogin: 'all-users'` is set
   - Ensure Privy dashboard has embedded wallets enabled

2. **Authentication errors**

   - Verify App ID matches environment variable
   - Check allowed origins in Privy dashboard
   - Ensure HTTPS for production deployments

### **Debug Mode**

The app includes comprehensive logging:

- Wallet detection details in browser console
- Server API logs for admin searches
- Balance fetch error handling

## 🚀 Production Deployment

### **Security Checklist**

- [ ] Use HTTPS everywhere
      -- [ ] Use environment-specific Privy apps
      -- [ ] Configure allowed origins in Privy dashboard

### **Scaling Considerations**

- Cache user data to reduce Privy API calls
- Implement proper session management
- Add database for application-specific data
- Use Redis for session storage

## 📚 Resources

- [Privy Dashboard](https://dashboard.privy.io)
- [Viem Documentation](https://viem.sh)
- [React Documentation](https://react.dev)

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve this demo!

## 📄 License

This demo is provided as-is for educational and reference purposes.

---

**Built with ❤️ using Privy, React, and Viem**
