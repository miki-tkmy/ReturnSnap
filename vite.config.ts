import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ReturnSnap/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        count: resolve(__dirname, 'count/index.html'),
        lift: resolve(__dirname, 'lift/index.html')
      }
    }
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // マニフェストファイルは count と lift で別々に静的配置しているため、
      // ここでの自動マニフェスト生成は行いませんが、PWAプラグインの動作に必要な
      // 最小限のmanifest設定を残しておきます。
      manifest: false
    })
  ]
});
