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
          bg: '#FAF8F2',
          text: '#181611',
          muted: '#625C4E',
          border: '#E7E2D4',
        },
      },
    },
  },
  plugins: [],
};

