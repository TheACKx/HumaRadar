import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // weekly reports are written to ../reports by the report workflow, beside
      // the app rather than inside it, so the dev server has to be allowed there
      allow: ['..'],
    },
  },
})
