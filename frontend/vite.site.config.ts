import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/dist/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'comfyui-settings-modern': 'src/pages/comfyui-settings.tsx',
        'online-modern': 'src/pages/online.tsx',
        'zimage-modern': 'src/pages/zimage.tsx',
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
