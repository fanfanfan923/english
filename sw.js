// Service Worker for 英语高阶词义网络与复习工作台
const CACHE_NAME = 'english-hub-cache-v4';

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

// 1. 安装阶段：预缓存应用核心 Shell 与资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 容错预缓存：即便部分资源失败也尽量保证核心文件入缓存
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

// 2. 激活阶段：清理旧版本缓存并立即接管所有客户端
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

// 3. 请求拦截阶段：Cache First 兼顾 Stale-While-Revalidate 与离线降级
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // 只拦截 GET 请求
  if (req.method !== 'GET') return;

  // 忽略不受支持的 schema (如 chrome-extension:// 等)
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      // 网络请求与动态缓存更新 Promise
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          // 确保响应有效 (允许 opaque 响应 如跨域 CDN)
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          // 离线模式：如果网络失败且无缓存，若是页面导航则兜底返回 index.html
          if (req.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
          throw err;
        });

      // 如果有缓存，立即返回缓存 (秒开)，并在后台更新 (Stale-While-Revalidate)
      if (cachedResponse) {
        // 后台静默更新
        fetchPromise.catch(() => {});
        return cachedResponse;
      }

      // 没有缓存时等待网络请求
      return fetchPromise;
    })
  );
});
