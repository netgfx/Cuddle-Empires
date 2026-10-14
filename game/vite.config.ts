import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Debug-only features (the Online lobby): `npm run dev:debug`, or any vite command with --debug / --mode debug.
    __RISK_DEBUG__: JSON.stringify(mode === 'debug' || process.argv.includes('--debug')),
  },
}))
