/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({mode}) => {
  const admin = mode === 'admin'
  return {
  plugins: [
    react(),
    ...(admin ? [{name:'admin-entry', configureServer(server) { server.middlewares.use((req,_res,next) => { if (req.url && !req.url.startsWith('/@') && !req.url.startsWith('/src/') && !req.url.startsWith('/node_modules/') && !req.url.split('?')[0].includes('.')) req.url='/admin.html'; next() }) }, async closeBundle() { await rename(resolve('dist-admin/admin.html'),resolve('dist-admin/index.html')) }} satisfies Plugin] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Shakarchi Distribution',
        short_name: 'Distribution',
        description: 'Field visits: check in, survey, order, collect.',
        theme_color: '#132238',
        background_color: '#F5F7F9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webp}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/admin(?:\/|$)/] },
    })]),
  ],
  build: admin ? {outDir:'dist-admin',rollupOptions:{input:resolve('admin.html')}} : undefined,
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
