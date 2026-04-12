import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Load environment variables from repository root (.env)
  envDir: '..',
  plugins: [
    react(),
    tailwindcss(),
  ],
})