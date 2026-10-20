import { defineConfig } from 'vite';

// 2026-10-18：本站挂在子目录下（/finance-sim/monopoly-3d/），资源必须用相对路径
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
  },
});
