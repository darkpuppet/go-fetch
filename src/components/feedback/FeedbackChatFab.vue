<template>
  <q-btn
    v-if="visible"
    class="feedback-fab"
    round
    unelevated
    color="primary"
    icon="chat"
    size="lg"
    to="/feedback"
    aria-label="Send feedback"
  >
    <q-badge
      v-if="unreadCount"
      floating
      rounded
      color="negative"
      :label="unreadCount"
    />
    <q-tooltip anchor="center left" self="center right">Send feedback</q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useAuthStore } from '../../stores/auth';
import { useFeedbackStore } from '../../stores/feedback';

const auth = useAuthStore();
const feedback = useFeedbackStore();
const route = useRoute();

const unreadCount = computed(() => feedback.userUnreadCount);

const visible = computed(() => {
  if (!auth.user) {
    return false;
  }

  return route.name !== 'feedback' && route.name !== 'admin-feedback';
});
</script>
