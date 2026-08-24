import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/dist/smart-canvas/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/pages/smart-canvas.tsx',
      formats: ['es'],
      fileName: () => 'smart-canvas-modern.js',
    },
    outDir: '../static/dist/smart-canvas',
  },
});
