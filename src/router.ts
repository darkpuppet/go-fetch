import { createRouter, createWebHistory } from 'vue-router';

import AuthPage from './pages/AuthPage.vue';
import MapPage from './pages/MapPage.vue';
import ProfilePage from './pages/ProfilePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: AuthPage
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfilePage,
      meta: { requiresAuth: true }
    },
    {
      path: '/',
      name: 'map',
      component: MapPage,
      meta: { requiresAuth: true, requiresProfile: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
});
