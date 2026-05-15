import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import type { AddressInfo } from 'net'

function smartOpen(): Plugin {
  return {
    name: 'smart-open',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        // Wait for existing browser tabs to reconnect via HMR WebSocket
        setTimeout(() => {
          if (server.ws.clients.size > 0) return;

          const addr = server.httpServer?.address() as AddressInfo | null
          const port = addr?.port ?? 5173
          const url = `http://localhost:${port}`

          if (process.env.WSL_DISTRO_NAME) {
            exec(`/mnt/c/Windows/System32/cmd.exe /c start ${url}`)
          } else if (process.platform === 'darwin') {
            exec(`open ${url}`)
          } else if (process.platform === 'win32') {
            exec(`start ${url}`)
          } else {
            exec(`xdg-open ${url}`)
          }
        }, 1500)
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), smartOpen()],
  server: {
    watch: {
      usePolling: true,
    },
  },
})
