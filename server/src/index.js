import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5057;
const { PRIVY_APP_ID, PRIVY_APP_SECRET, ADMIN_TOKEN } = process.env;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.warn('Warning: PRIVY_APP_ID or PRIVY_APP_SECRET not set. Set them in server/.env');
}

// Simple admin auth via token header (demo-only)
function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Helper: call Privy Management API
async function searchPrivyUsers({ query }) {
  // Basic heuristic: email, twitter handle, or wallet address
  const trimmed = (query || '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const isEmail = /@/.test(trimmed) && !trimmed.startsWith('@');
  const isTwitter = trimmed.startsWith('@') || (!isEmail && !isAddress);

  // Use Privy REST Management API (query supports email/username/address)
  // Docs may evolve; adjust endpoint/params accordingly in production.
  const endpoint = 'https://api.privy.io/api/v1/users';

  const params = {};
  if (isEmail) params.email = trimmed;
  else if (isAddress) params.wallet_address = trimmed.toLowerCase();
  else if (isTwitter) params.twitter = trimmed.replace(/^@/, '');

  const authHeader =
    'Basic ' + Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');

  const { data } = await axios.get(endpoint, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    },
    params
  });

  // Normalize response to a simple shape for the UI
  const users = (data?.results || data?.users || []).map((u) => ({
    id: u.id || u.user_id || u.uuid,
    email: u.email?.address || u.email || null,
    twitter: u.twitter?.username || u.twitter || null,
    wallets: (u.wallets || u.linked_accounts || u.linkedAccounts || [])
      .filter((a) => (a.type || a.kind) === 'wallet' || a.address)
      .map((w) => w.address || w.wallet_address)
      .filter(Boolean)
  }));

  return users;
}

// Admin search endpoint
app.get('/api/admin/search', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.q || '');
    if (!query) return res.status(400).json({ error: 'Missing q' });
    const users = await searchPrivyUsers({ query });
    res.json({ users });
  } catch (err) {
    console.error('Search error', err?.response?.data || err.message);
    res.status(500).json({ error: 'Search failed', details: err?.response?.data || null });
  }
});

app.listen(PORT, () => {
  console.log(`Privy demo server listening on http://localhost:${PORT}`);
});


