import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
const proxy = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true, rewrite: (path: string) => path.slice(4) } };
export default defineConfig({
  plugins: [tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
});
