import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { Buffer } from 'buffer'

// Polyfill Buffer for libraries expecting a global Buffer
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)


