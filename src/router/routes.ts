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
      },
      {
        path: 'feedback',
        name: 'feedback',
        component: () => import('../pages/FeedbackPage.vue'),
        meta: { requiresAuth: true, allowFirebaseDemo: true }
      },
      {
        path: 'admin/feedback',
        name: 'admin-feedback',
        component: () => import('../pages/AdminFeedbackPage.vue'),
        meta: { requiresAuth: true, allowFirebaseDemo: true }
      },
      {
        path: 'spot',
        name: 'spot-truck',
        component: () => import('../pages/SpotTruckPage.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'truck',
        component: () => import('../layouts/TruckOwnerLayout.vue'),
        meta: { requiresAuth: true },
        children: [
          {
            path: '',
            name: 'truck-owner',
            component: { template: '<div />' }
          },
          {
            path: 'operate',
            name: 'truck-operate',
            component: () => import('../pages/TruckOperatePage.vue')
          },
          {
            path: 'manage',
            name: 'truck-manage',
            component: () => import('../pages/TruckManagePage.vue')
          }
        ]
      }
    ]
  },

  {
    path: '/:catchAll(.*)*',
    redirect: '/'
  }
];

export default routes;
