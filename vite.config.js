import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function standalonePageRoutes() {
  const routes = new Map([
    ['/projects/probmoe', '/projects/probmoe/index.html'],
    ['/projects/probmoe/', '/projects/probmoe/index.html'],
  ])

  return {
    name: 'standalone-page-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const target = routes.get(requestUrl.pathname)

        if (target) {
          req.url = `${target}${requestUrl.search}`
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [standalonePageRoutes(), react()],
})
