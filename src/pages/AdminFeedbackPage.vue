<template>
  <q-page class="page-shell">
    <section class="container">
      <q-card flat bordered class="profile-card feedback-admin-card">
        <q-card-section>
          <q-chip color="primary" text-color="white" icon="inbox" label="Admin inbox" />
          <h1 class="page-title">Feedback chats</h1>
          <p class="text-grey-7">
            Read every diner thread and reply in the same conversation they see.
          </p>
        </q-card-section>

        <q-banner v-if="demoMode" rounded class="app-banner q-mx-md q-mb-md">
          Firebase is not configured, so this inbox is a local preview.
          <template #action>
            <q-btn flat no-caps color="primary" label="Preview diner chat" to="/feedback" />
          </template>
        </q-banner>

        <q-banner
          v-else-if="auth.adminStatusReady && !auth.isAdmin"
          rounded
          class="app-banner q-mx-md q-mb-md"
        >
          This inbox is only for Go Fetch admins. Create an
          <code>admins/{{ auth.user?.uid }}</code> document (or run
          <code>npm run grant-admin -- {{ auth.user?.uid }}</code>) to unlock it.
        </q-banner>

        <q-banner v-if="feedback.error" rounded class="app-banner q-mx-md q-mb-md">
          {{ feedback.error }}
        </q-banner>

        <div v-if="canUseInbox" class="feedback-admin">
          <aside class="feedback-admin__list" :class="{ 'feedback-admin__list--hidden': showMobileChat }">
            <q-item-label header class="q-px-md">
              {{ feedback.inbox.length }} {{ feedback.inbox.length === 1 ? 'thread' : 'threads' }}
            </q-item-label>
            <q-separator />
            <q-scroll-area class="feedback-admin__list-scroll">
              <div v-if="feedback.inboxLoaded && !feedback.inbox.length" class="feedback-admin__empty">
                <q-icon name="chat_bubble_outline" size="36px" color="primary" />
                <div class="text-body2 text-grey-7">No feedback yet. New diner messages will land here.</div>
              </div>
              <q-list v-else separator>
                <q-item
                  v-for="thread in feedback.inbox"
                  :key="thread.id"
                  clickable
                  v-ripple
                  :active="thread.id === feedback.activeThreadId"
                  active-class="feedback-thread--active"
                  @click="selectThread(thread.id)"
                >
                  <q-item-section>
                    <q-item-label class="text-weight-bold row items-center no-wrap">
                      <span class="ellipsis">{{ thread.userDisplayName }}</span>
                      <q-badge
                        v-if="thread.unreadByAdmin"
                        rounded
                        color="primary"
                        class="q-ml-sm"
                        label="New"
                      />
                    </q-item-label>
                    <q-item-label caption class="ellipsis">
                      {{ thread.lastSenderRole === 'admin' ? 'You: ' : '' }}{{ thread.lastMessage }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section v-if="thread.lastMessageAt" side>
                    <q-item-label caption>{{ formatTime(thread.lastMessageAt) }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-scroll-area>
          </aside>

          <section class="feedback-admin__chat" :class="{ 'feedback-admin__chat--hidden': !showMobileChat }">
            <div v-if="!feedback.activeThread" class="feedback-admin__empty feedback-admin__empty--chat">
              <q-icon name="forum" size="42px" color="primary" />
              <div class="text-subtitle1 text-weight-bold">Choose a conversation</div>
              <p class="text-grey-7">Select a diner on the left to read and reply.</p>
            </div>
            <template v-else>
              <div class="feedback-admin__chat-header">
                <q-btn
                  class="lt-sm"
                  flat
                  round
                  dense
                  icon="arrow_back"
                  aria-label="Back to threads"
                  @click="showMobileChat = false"
                />
                <div class="min-width-0">
                  <div class="text-subtitle1 text-weight-bold ellipsis">
                    {{ feedback.activeThread.userDisplayName }}
                  </div>
                  <div class="text-caption text-grey-7">Diner feedback thread</div>
                </div>
              </div>
              <FeedbackChat
                :messages="feedback.messages"
                :current-uid="session.uid"
                :sending="feedback.sending"
                placeholder="Reply to this diner..."
                empty-title="No replies yet"
                empty-caption="This diner started a thread. Write back below."
                @send="handleSend"
              />
            </template>
          </section>
        </div>
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, onMounted, ref, watch } from 'vue';

import FeedbackChat from '../components/feedback/FeedbackChat.vue';
import { feedbackDemoIds } from '../services/feedback';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuthStore } from '../stores/auth';
import { useFeedbackStore } from '../stores/feedback';

const auth = useAuthStore();
const feedback = useFeedbackStore();
const demoMode = !isFirebaseConfigured;
const showMobileChat = ref(false);

const session = computed(() => {
  if (demoMode) {
    return { uid: feedbackDemoIds.admin, displayName: 'Go Fetch' };
  }

  return {
    uid: auth.user?.uid ?? '',
    displayName: auth.profile?.displayName || 'Go Fetch'
  };
});

const canUseInbox = computed(() => demoMode || auth.isAdmin);

function formatTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function selectThread(threadId: string) {
  feedback.openThread(threadId, 'admin');
  showMobileChat.value = true;
}

function attach() {
  if (!canUseInbox.value) {
    return;
  }

  feedback.attachInbox();
}

onMounted(attach);

watch(canUseInbox, (allowed) => {
  if (allowed) {
    attach();
  }
});

async function handleSend(text: string) {
  const threadId = feedback.activeThreadId;

  if (!threadId) {
    return;
  }

  try {
    await feedback.sendMessage({
      threadId,
      uid: session.value.uid,
      displayName: session.value.displayName,
      role: 'admin',
      text
    });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to send reply.'
    });
  }
}
</script>
