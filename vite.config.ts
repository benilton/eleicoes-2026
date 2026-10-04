import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// O base precisa casar com o nome do repositorio, porque o GitHub Pages
// serve o site em https://<usuario>.github.io/eleicoes-2026/
export default defineConfig({
  base: '/eleicoes-2026/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
