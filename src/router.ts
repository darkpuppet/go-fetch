import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./pages/AuthPage.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('./pages/ProfilePage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/',
      name: 'map',
      component: () => import('./pages/MapPage.vue'),
      meta: { requiresAuth: true, requiresProfile: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
});
