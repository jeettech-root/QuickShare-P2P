import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // This automatically adds all the missing Node.js wrappers
      // (process, buffer, stream, util, etc.)
      protocolImports: true,
    }),
  ],
})