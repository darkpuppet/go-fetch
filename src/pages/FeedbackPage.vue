<template>
  <q-page class="page-shell">
    <section class="container narrow-container">
      <q-card flat bordered class="profile-card feedback-card">
        <q-card-section>
          <q-chip color="primary" text-color="white" icon="forum" label="Feedback" />
          <h1 class="page-title">Talk with Go Fetch</h1>
          <p class="text-grey-7">
            Send a note about the map, a truck, or an idea. Replies show up in this thread.
          </p>
        </q-card-section>

        <q-banner v-if="demoMode" rounded class="app-banner q-mx-md q-mb-md">
          Firebase is not configured, so this is a local demo conversation.
          <template #action>
            <q-btn flat no-caps color="primary" label="Preview admin inbox" to="/admin/feedback" />
          </template>
        </q-banner>

        <q-banner v-if="error" rounded class="app-banner q-mx-md q-mb-md">
          {{ error }}
        </q-banner>

        <q-card-section class="feedback-card__body">
          <FeedbackChat
            :messages="messages"
            :current-uid="session.uid"
            :sending="sending"
            :disabled="!session.uid"
            placeholder="What's on your mind?"
            empty-title="No messages yet"
            empty-caption="Tell us what is working, what is broken, or what you wish Go Fetch could do."
            @send="handleSend"
          />
        </q-card-section>
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { storeToRefs } from 'pinia';
import { computed, watch } from 'vue';

import FeedbackChat from '../components/feedback/FeedbackChat.vue';
import { feedbackDemoIds } from '../services/feedback';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuthStore } from '../stores/auth';
import { useFeedbackStore } from '../stores/feedback';

const auth = useAuthStore();
const feedback = useFeedbackStore();
const { messages, sending, error } = storeToRefs(feedback);
const demoMode = !isFirebaseConfigured;

const session = computed(() => {
  if (demoMode) {
    return { uid: feedbackDemoIds.diner, displayName: 'Alex Diner' };
  }

  return {
    uid: auth.user?.uid ?? '',
    displayName: auth.profile?.displayName || 'Diner'
  };
});

function attach() {
  if (!session.value.uid) {
    return;
  }

  feedback.attachOwnThread(session.value.uid);
  feedback.openThread(session.value.uid, 'user');
}

attach();

watch(
  () => session.value.uid,
  () => {
    attach();
  }
);

async function handleSend(text: string) {
  try {
    await feedback.sendMessage({
      threadId: session.value.uid,
      uid: session.value.uid,
      displayName: session.value.displayName,
      role: 'user',
      text
    });
  } catch (sendError) {
    Notify.create({
      type: 'negative',
      message: sendError instanceof Error ? sendError.message : 'Unable to send feedback.'
    });
  }
}
</script>
