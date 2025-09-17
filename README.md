# Privy Demo: Auto-Create Embedded Wallets + Multi-Chain Support

A comprehensive demonstration of Privy's authentication and embedded wallet features with automatic wallet creation, multi-chain support, and admin user management.

## ⚡ Quick Start Summary

**What you need to set up:**

1. **Privy Account** → Get App ID & App Secret
2. **Google OAuth** → Set up Google Cloud credentials (optional)
3. **Environment Files** → Configure `.env` files with credentials
4. **Enable Features** → Turn on embedded wallets in Privy dashboard
5. **Run the App** → Start server & client

**Total setup time: ~15-30 minutes**

## 🎯 What This Demo Shows

- **Auto-Create Embedded Wallets**: Automatically creates EVM wallets on user login
- **Multi-Chain Support**: Same wallet address works across all EVM chains
- **Multiple Auth Methods**: Email, Google, SMS, and external wallet login
- **Admin User Search**: Search users by email, Twitter handle, or wallet address
- **Real-time Balance**: Fetches and displays Sepolia testnet balance
- **Chain Agnostic**: Embedded wallets work on Ethereum, Polygon, Arbitrum, etc.

## 🏗 Architecture

```
Frontend (React + Vite)     Backend (Express)     Privy API
├── Authentication UI  ──→  ├── Admin Search ──→  ├── User Management
├── Embedded Wallets        ├── Proxy Endpoint    ├── Wallet Creation
├── Balance Display         └── Simple Auth       └── Account Linking
└── Admin Interface
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
- Google OAuth
- SMS verification
- External wallets (MetaMask, Coinbase, WalletConnect)

### 4. **Admin User Management**

- Search by email, Twitter handle, or wallet address
- Secure API with token authentication
- Real-time user data from Privy Management API

## 📋 Prerequisites

- **Node.js 18+**
- **Privy Account** with App ID and App Secret
- **Google OAuth Credentials** (for Google login)
- **Environment Variables** (see setup below)

## 🛠 Complete Setup Checklist

### **Phase 1: Account Setup**

#### 1. **Privy Dashboard Setup**

- [ ] Go to [Privy Dashboard](https://dashboard.privy.io)
- [ ] Create account or sign in
- [ ] Create a new app or select existing
- [ ] Copy your **App ID** from the dashboard
- [ ] Go to Settings → API Keys → Copy your **App Secret**
- [ ] Configure **Allowed Origins**:
  - Add `http://localhost:5173` (dev)
  - Add `http://localhost:5174` (backup dev port)
  - Add your production domain when ready

#### 2. **Google OAuth Setup** (Optional but recommended)

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
- [ ] Create a new project or select existing
- [ ] Enable **Google+ API** and **OAuth2 API**
- [ ] Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
- [ ] Configure OAuth consent screen:
  - Application name: "Your App Name"
  - Authorized domains: `localhost`, your domain
- [ ] Create **Web Application** credentials:
  - Authorized origins: `http://localhost:5173`, `https://yourdomain.com`
  - Authorized redirect URIs: `https://auth.privy.io/api/v1/oauth/callback`
- [ ] Copy **Client ID** and **Client Secret**
- [ ] Add Google credentials to **Privy Dashboard**:
  - Settings → Login Methods → Google → Add credentials

#### 3. **SMS Provider Setup** (Optional)

- [ ] In Privy Dashboard → Settings → Login Methods → SMS
- [ ] Configure SMS provider (Twilio recommended)
- [ ] Add phone number verification settings

### **Phase 2: Code Setup**

#### 4. **Clone and Install Dependencies**

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

#### 5. **Environment Configuration**

**Create Server Environment** (`server/.env`):

```env
# Required - From Privy Dashboard
PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_app_secret_here

# Optional - Server Configuration
PORT=5057

# Required - Admin Security
ADMIN_TOKEN=your_secure_random_token_here
```

**Create Client Environment** (`app/.env`):

```env
# Required - From Privy Dashboard
VITE_PRIVY_APP_ID=your_privy_app_id_here

# Required - Backend Connection
VITE_SERVER_URL=http://localhost:5057

# Required - Admin Access (should match server)
VITE_ADMIN_TOKEN=your_secure_random_token_here
```

### **Phase 3: Privy Configuration**

#### 6. **Enable Embedded Wallets**

- [ ] In Privy Dashboard → Settings → Embedded Wallets
- [ ] Enable **Ethereum** embedded wallets
- [ ] Set creation policy to **"Create for all users"**
- [ ] Configure supported chains (Sepolia for testing)

#### 7. **Configure Login Methods**

- [ ] In Privy Dashboard → Settings → Login Methods
- [ ] Enable desired methods:
  - [x] **Email** (passwordless)
  - [x] **Google** (if OAuth set up)
  - [x] **SMS** (if provider configured)
  - [x] **Wallet** (MetaMask, Coinbase, etc.)

#### 8. **Set Up Webhooks** (Optional)

- [ ] Settings → Webhooks → Add endpoint
- [ ] Configure for user events if needed

### **Phase 4: Testing Setup**

#### 9. **Test Environment**

- [ ] Ensure you have a **MetaMask** or similar wallet for testing
- [ ] Get **Sepolia testnet ETH** from faucets:
  - [Sepolia Faucet](https://sepoliafaucet.com)
  - [Alchemy Faucet](https://sepoliafaucet.com)
- [ ] Configure MetaMask for Sepolia network

#### 10. **Run and Verify**

```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start frontend
cd app && npm run dev
```

**Verification Checklist:**

- [ ] App loads at `http://localhost:5173`
- [ ] Login button appears
- [ ] Can authenticate with email
- [ ] Can authenticate with Google (if configured)
- [ ] Embedded wallet creates automatically
- [ ] Wallet address displays
- [ ] Sepolia balance loads (0 ETH initially)
- [ ] Admin panel accessible
- [ ] User search works in admin panel

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
PRIVY_APP_SECRET=your_privy_app_secret_here
PORT=5057
ADMIN_TOKEN=your_secure_admin_token_here
```

**Client Environment** (`app/.env`):

```env
VITE_PRIVY_APP_ID=your_privy_app_id_here
VITE_SERVER_URL=http://localhost:5057
VITE_ADMIN_TOKEN=your_secure_admin_token_here
```

### 3. **Get Privy Credentials**

1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Create a new app or use existing
3. Copy your **App ID** and **App Secret**
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
2. **Choose auth method** → Email, Google, SMS, or wallet
3. **Complete authentication** → Privy handles the flow
4. **Wallet auto-created** → Embedded wallet appears instantly
5. **View details** → See address, balance, and user info

### **Admin Features**

1. **Click "Admin" tab** → Access user search
2. **Search users** → By email, Twitter, or wallet address
3. **View results** → See user details and linked accounts

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
    loginMethods: ['email', 'google', 'sms', 'wallet']
  }}
>
```

```javascript
// PrivyAuthUI.jsx - Wallet integration
const { wallets } = useWallets();
const embedded = wallets.find((wallet) => wallet.walletClientType === "privy");
```

### **Backend Architecture**

```javascript
// Admin search with Privy Management API
const endpoint = "https://api.privy.io/api/v1/users";
const authHeader =
  "Basic " +
  Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");
```

### **Multi-Chain Support**

The embedded wallet address works across all EVM chains:

```javascript
// Same address, different chains
const sepoliaClient = createPublicClient({ chain: sepolia, transport: http() });
const polygonClient = createPublicClient({ chain: polygon, transport: http() });
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http(),
});

// All use the same wallet.address!
```

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

```javascript
// In App.jsx config
defaultChain: { id: 137, name: 'Polygon' }
```

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

3. **Admin search not working**
   - Verify App Secret is correct
   - Check admin token matches between client/server
   - Ensure server is running and accessible

### **Debug Mode**

The app includes comprehensive logging:

- Wallet detection details in browser console
- Server API logs for admin searches
- Balance fetch error handling

## 🚀 Production Deployment

### **Security Checklist**

- [ ] Use HTTPS everywhere
- [ ] Rotate admin tokens regularly
- [ ] Set proper CORS origins
- [ ] Use environment-specific Privy apps
- [ ] Enable rate limiting on admin endpoints

### **Scaling Considerations**

- Cache user data to reduce Privy API calls
- Implement proper session management
- Add database for application-specific data
- Use Redis for session storage

## 📚 Resources

- [Privy Documentation](https://docs.privy.io)
- [Privy Dashboard](https://dashboard.privy.io)
- [Viem Documentation](https://viem.sh)
- [React Documentation](https://react.dev)

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve this demo!

## 📄 License

This demo is provided as-is for educational and reference purposes.

---

**Built with ❤️ using Privy, React, and Viem**
