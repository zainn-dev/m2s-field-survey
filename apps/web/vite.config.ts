import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': apiProxyTarget } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'dexie', 'zod'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
