import { defineBoot } from '#q-app/wrappers';

import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';

export default defineBoot(async ({ router, store }) => {
  const authStore = useAuthStore(store);
  const themeStore = useThemeStore(store);

  themeStore.init();
  await authStore.init();

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
});
