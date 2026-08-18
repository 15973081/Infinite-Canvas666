import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/dist/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/canvas/spike/renderer-spike.tsx',
      formats: ['es'],
      fileName: () => 'canvas-board-spike.js',
      cssFileName: 'canvas-board-spike',
    },
    outDir: '../static/dist',
  },
});
