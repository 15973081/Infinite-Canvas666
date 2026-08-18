import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/dist/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'comfyui-settings-modern': 'src/pages/comfyui-settings.tsx',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'site-[name]-[hash].js',
        assetFileNames: 'site-[name]-[hash][extname]',
      },
    },
    outDir: '../static/dist',
  },
});
