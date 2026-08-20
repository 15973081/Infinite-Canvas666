import { defineConfig } from 'vite';

export default defineConfig({
  base: '/static/dist/',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'index-modern': 'src/pages/index.tsx',
        'asset-manager-modern': 'src/pages/asset-manager.tsx',
        'gpt-chat-modern': 'src/pages/gpt-chat.tsx',
        'api-settings-modern': 'src/pages/api-settings.tsx',
        'comfyui-settings-modern': 'src/pages/comfyui-settings.tsx',
        'enhance-modern': 'src/pages/enhance.tsx',
        'klein-modern': 'src/pages/klein.tsx',
        'angle-modern': 'src/pages/angle.tsx',
        'online-modern': 'src/pages/online.tsx',
        'zimage-modern': 'src/pages/zimage.tsx',
        'smart-canvas-modern': 'src/pages/smart-canvas.tsx',
        'site-shared-style': 'src/styles/site-shared-style.ts',
        'provider-style': 'src/styles/provider-style.ts',
        'asset-style': 'src/styles/asset-style.ts',
        'comfy-style': 'src/styles/comfy-style.ts',
        'theme-style': 'src/styles/theme-style.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'site-[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
    outDir: '../static/dist',
  },
});
