import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const posixGlob = (...parts) => path.resolve(dir, ...parts).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    posixGlob('index.html'),
    posixGlob('src/**/*.{js,ts,jsx,tsx}'),
    posixGlob('../../packages/shared/src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        m2s: {
          gold: '#FDC513',
          'gold-hover': '#E0AC00',
          'gold-ink': '#8C6200',
          'gold-soft': '#FFF8D6',
          ink: '#181611',
          yellow: '#FDC513',
          'yellow-soft': '#FFF8D6',
          bg: '#FAF8F2',
          card: '#FFFFFF',
          text: '#181611',
          muted: '#625C4E',
          border: '#E7E2D4',
        },
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'Inter',
          'Noto Sans Devanagari',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 29, 23, 0.04), 0 1px 3px 0 rgba(17, 29, 23, 0.03)',
        'card-md': '0 6px 18px -4px rgba(8, 61, 40, 0.09), 0 2px 6px -2px rgba(17, 29, 23, 0.05)',
      },
    },
  },
  plugins: [],
};
