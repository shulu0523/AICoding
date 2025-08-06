// 缓存名称和版本
const CACHE_NAME = 'vocabulary-flashcards-v1';
const ASSETS_TO_CACHE = [
  '/first-grade-index.html',
  '/first-grade-vocabulary.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
];

// 安装Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('缓存打开成功');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// 激活Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 缓存命中则返回缓存的资源
        if (response) {
          return response;
        }
        // 缓存未命中则发起网络请求
        return fetch(event.request).then(
          (response) => {
            // 如果请求失败则返回错误
            if (!response || response.status !== 200) {
              return response;
            }

            // 克隆响应以缓存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          // 网络错误时的回退策略
          if (event.request.mode === 'navigate') {
            return caches.match('/first-grade-index.html');
          }
          return new Response('无法连接到网络', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});