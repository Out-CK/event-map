import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Respect PORT when a harness assigns one (e.g. Claude Code preview)
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
