import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'map',
        component: () => import('../pages/MapPage.vue')
      },
      {
        path: 'login',
        name: 'login',
        component: () => import('../pages/AuthPage.vue')
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('../pages/ProfilePage.vue'),
        meta: { requiresAuth: true }
      }
    ]
  },

  {
    path: '/:catchAll(.*)*',
    redirect: '/'
  }
];

export default routes;
