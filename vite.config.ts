import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaApp } from '@huishouden/pwa-kit/vite';

const googleFontsCache = (urlPattern: RegExp, cacheName: string) => ({
  urlPattern,
  handler: 'CacheFirst' as const,
  options: {
    cacheName,
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaApp({
      name: 'Huishouden Home',
      shortName: 'Home',
      description: "Keeping the house in good shape",
      url: 'https://huishouden-home.web.app',
      // Contacts → Share → Home on Android: a provider's contact card becomes a contact.
      shareTarget: { contacts: true },
      themeColor: '#1b4332',
      backgroundColor: '#faf9f5',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      overrides: {
        manifest: { categories: ['lifestyle', 'productivity', 'utilities'] },
        workbox: {
          runtimeCaching: [
            googleFontsCache(/^https:\/\/fonts\.googleapis\.com\/.*/i, 'google-fonts-cache'),
            googleFontsCache(/^https:\/\/fonts\.gstatic\.com\/.*/i, 'gstatic-fonts-cache'),
          ],
        },
      },
    }),
  ],
});
