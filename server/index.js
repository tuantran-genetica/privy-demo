import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
dotenv.config()
import { PrivyClient } from '@privy-io/node'

const PORT = process.env.PORT || 8787

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

// Basic health check
app.get('/healthz', (req, res) => res.json({ ok: true }))

// POST /api/wallets/:walletId/rpc - sign via Privy authorization context using user JWT
// Body: { method: 'personal_sign', params: { message, encoding } }
app.post('/api/wallets/:walletId/rpc', async (req, res) => {
  try {
    const appId = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID
    const clientId = process.env.PRIVY_CLIENT_ID || process.env.VITE_PRIVY_CLIENT_ID
    const clientSecret = process.env.PRIVY_CLIENT_SECRET
    const userJwt = req.headers['x-user-jwt'] || req.body?.user_jwt
    const { walletId } = req.params
    const { method, params } = req.body || {}

    if (!appId || !clientId || !clientSecret) {
      return res.status(500).json({ error: 'Server misconfigured: missing Privy credentials' })
    }
    if (!userJwt) {
      return res.status(401).json({ error: 'Missing user JWT' })
    }

    console.log("appId", appId)
    console.log("clientId", clientId)
    const privyClient = new PrivyClient({ appId: appId, appSecret: clientSecret, clientId: clientId })

    // Build authorization context with user JWT (Privy handles requesting user key under the hood)
    const authorization_context = { user_jwts: [String(userJwt)] }

    if (method !== 'personal_sign') {
      return res.status(400).json({ error: 'Only personal_sign is supported in this endpoint' })
    }
    console.log("params", params)
    const message = params?.message
    if (!message) return res.status(400).json({ error: 'Missing message' })
      
    const response = await privyClient
      .wallets()
      .ethereum()
      .signMessage(walletId, { message, authorization_context: authorization_context })

    return res.json({ signature: response.signature })
  } catch (e) {
    console.error('Privy sign error:', e)
    const status = e?.statusCode || e?.status || 500
    return res.status(status).json({ error: e?.message || 'Privy sign error' })
  }
})

app.listen(PORT, () => {
  console.log(`Privy signing server listening on :${PORT}`)
})


