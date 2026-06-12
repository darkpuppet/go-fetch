import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/dist/quasar.css';
import './styles/main.css';

import { Quasar, Dialog, Loading, Notify } from 'quasar';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';

import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

const authStore = useAuthStore();
authStore.init();

router.beforeEach(async (to) => {
  await authStore.init();

  if (to.meta.requiresAuth && !authStore.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.name === 'login' && authStore.user) {
    return authStore.profile ? { name: 'map' } : { name: 'profile' };
  }

  if (to.meta.requiresProfile && authStore.user && !authStore.profile) {
    return { name: 'profile' };
  }

  return true;
});

app.use(router);
app.use(Quasar, {
  plugins: {
    Dialog,
    Loading,
    Notify
  },
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
  }
});

registerSW({ immediate: true });

app.mount('#app');
