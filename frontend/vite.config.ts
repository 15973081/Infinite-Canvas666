import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/static/dist/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: () => 'canvas-modern.js',
    },
    outDir: '../static/dist',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
