import { fileURLToPath } from 'node:url';

import { defineConfig } from '@quasar/app-vite/wrappers';

export default defineConfig(() => {
  return {
    boot: ['init', 'pwa-update'],

    css: ['app.scss'],

    extras: ['material-icons'],

    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node22'
      },

      typescript: {
        strict: true,
        vueShim: true
      },

      vueRouterMode: 'history',

      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },

    devServer: {
      host: '0.0.0.0',
      open: false
    },

    framework: {
      config: {
        brand: {
          primary: '#f97316',
          secondary: '#16a34a',
          accent: '#0f172a',
          positive: '#16a34a',
          warning: '#f59e0b',
          negative: '#dc2626'
        },
        notify: {
          position: 'top-right',
          timeout: 3500
        }
      },

      plugins: ['Dialog', 'Loading', 'Notify']
    },

    animations: [],

    pwa: {
      workboxMode: 'GenerateSW',
      injectPwaMetaTags: true,
      swFilename: 'sw.js',
      manifestFilename: 'manifest.json',
      useCredentialsForManifestTag: false
    }
  };
});
