import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_PORT = process.env.SERVER_PORT ?? '3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so phones/other devices on the same Wi-Fi can reach the dev server
    port: 5173,
    proxy: {
      '/socket.io': {
        target: `http://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
})
