// Service Worker for 英语高阶词义网络与复习工作台
const CACHE_NAME = 'english-hub-cache-v1790141536';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js'
];

// 1. 安装阶段：立即跳过等待，接管旧版 SW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Pre-caching asset failed: ${asset}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. 激活阶段：清理一切旧版本缓存并立即接管全部客户端
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log(`[SW] Removing outdated cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 请求拦截阶段：HTML 网络优先 (保证最新词库秒级同步) + 静态资源缓存优先 + 离线兜底
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // 1) 带有版本/更新查询参数的请求（如 ?t=... / ?v=...），直接走网络，绝不缓存
  if (url.search) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) HTML 主页面导航请求：Network-First (网络优先)
  // 联网状态下永远拉取 GitHub 最新版本并静默刷新缓存；断网离线时无缝回退本地缓存
  const isHtmlNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/english');

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // 断网/地铁离线兜底
          return caches.match(req).then((cached) => {
            return cached || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // 3) 静态资源 (CSS / 图标 / CDN 脚本)：Cache-First (秒开体验) + 后台静默更新
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {});

      if (cachedResponse) {
        return cachedResponse;
      }
      return fetchPromise;
    })
  );
});
