/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// 古いキャッシュをクリア
cleanupOutdatedCaches();

// VitePWAによって self.__WB_MANIFEST にビルド後のファイル一覧が注入され、自動で事前キャッシュされます
precacheAndRoute(self.__WB_MANIFEST || []);

// 静的画像やフォントなどのアセットに対するキャッシュ戦略 (Cache First)
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'returnsnap-static-assets',
  })
);

// GAS (Bridge) 関連の通信はキャッシュせず常にネットワークへ送る (Network Only)
registerRoute(
  ({ url }) => 
    url.hostname === 'script.google.com' || 
    url.hostname.endsWith('.googleusercontent.com') ||
    url.hostname === 'script.googleusercontent.com',
  new NetworkOnly()
);

// アップデート制御 (SKIP_WAITING が送信されたら即時適用)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
