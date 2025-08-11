// 缓存名称和版本
  const CACHE_NAME = 'vocabulary-flashcards-v1';
  // 静态资源缓存列表
  const ASSETS_TO_CACHE = [
  '/first-grade-index.html',
  '/first-grade-vocabulary.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
];

// Serverless API配置
const SERVERLESS_CONFIG = {
  // 腾讯云API网关URL (请替换为实际URL)
  apiUrl: 'https://your-api-gateway-url/tencent-tts',
  // 缓存音频文件的最大数量
  maxCacheSize: 50
};

// 音频缓存管理
const audioCache = {
  // 存储音频URL和对应的缓存键
  cacheMap: new Map(),
  // 缓存音频文件
  async cacheAudio(url, audioBlob) {
    // 实现LRU缓存策略
    if (this.cacheMap.size >= SERVERLESS_CONFIG.maxCacheSize) {
      // 删除最早添加的缓存
      const oldestKey = this.cacheMap.keys().next().value;
      this.cacheMap.delete(oldestKey);
      await caches.delete(`audio-${oldestKey}`);
    }

    // 为音频创建唯一标识符
    const audioId = Date.now().toString();
    this.cacheMap.set(audioId, url);

    // 缓存音频Blob
    const cache = await caches.open(`audio-${audioId}`);
    await cache.put(url, new Response(audioBlob, {
      headers: { 'Content-Type': 'audio/mpeg' }
    }));

    return audioId;
  },
  // 获取缓存的音频
  async getCachedAudio(url) {
    for (const [audioId, cachedUrl] of this.cacheMap.entries()) {
      if (cachedUrl === url) {
        const cache = await caches.open(`audio-${audioId}`);
        return cache.match(url);
      }
    }
    return null;
  }
};

// 自定义的Serverless请求处理函数
async function handleServerlessRequest(request) {
  const url = request.url;

  // 检查是否是Serverless API请求
  if (url.includes(SERVERLESS_CONFIG.apiUrl)) {
    // 检查是否有缓存的音频
    const cachedResponse = await audioCache.getCachedAudio(url);
    if (cachedResponse) {
      console.log('返回缓存的音频响应');
      return cachedResponse;
    }

    try {
      // 发起Serverless API请求
      const response = await fetch(request);

      // 如果响应是音频，缓存它
      if (response.headers.get('Content-Type')?.includes('audio')) {
        const audioBlob = await response.blob();
        await audioCache.cacheAudio(url, audioBlob);
      }

      return response;
    } catch (error) {
      console.error('Serverless请求失败:', error);
      return new Response('Serverless请求失败', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  // 不是Serverless API请求，返回null让其他处理逻辑处理
  return null;
}

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
    // 首先尝试处理Serverless请求
    handleServerlessRequest(event.request)
      .then((serverlessResponse) => {
        if (serverlessResponse) {
          return serverlessResponse;
        }
        // 如果不是Serverless请求或处理失败，尝试从缓存获取
        return caches.match(event.request)
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
        })
  );
});