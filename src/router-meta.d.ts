export {};

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresProfile?: boolean;
    allowFirebaseDemo?: boolean;
  }
}
