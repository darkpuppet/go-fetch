<template>
  <div class="feedback-chat">
    <q-scroll-area ref="scrollRef" class="feedback-chat__transcript">
      <div v-if="!messages.length" class="feedback-chat__empty">
        <q-icon name="forum" size="42px" color="primary" />
        <div class="text-subtitle1 text-weight-bold">{{ emptyTitle }}</div>
        <p class="text-grey-7">{{ emptyCaption }}</p>
      </div>

      <div v-else class="feedback-chat__messages">
        <div
          v-for="message in messages"
          :key="message.id"
          class="feedback-bubble-row"
          :class="{ 'feedback-bubble-row--mine': isMine(message) }"
        >
          <div
            class="feedback-bubble"
            :class="isMine(message) ? 'feedback-bubble--mine' : 'feedback-bubble--theirs'"
          >
            <div class="feedback-bubble__meta">
              {{ isMine(message) ? 'You' : message.senderName }}
              <span v-if="message.createdAt"> · {{ formatTime(message.createdAt) }}</span>
            </div>
            <div class="feedback-bubble__text">{{ message.text }}</div>
          </div>
        </div>
      </div>
    </q-scroll-area>

    <form class="feedback-chat__composer" @submit.prevent="submit">
      <q-input
        v-model="draft"
        outlined
        autogrow
        dense
        :maxlength="maxLength"
        :disable="disabled || sending"
        :placeholder="placeholder"
        :hint="`${draft.length}/${maxLength}`"
        hide-bottom-space
        @keydown.enter.exact.prevent="submit"
      />
      <q-btn
        unelevated
        round
        color="primary"
        icon="send"
        type="submit"
        :loading="sending"
        :disable="disabled || !draft.trim()"
        aria-label="Send message"
      />
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import { FEEDBACK_MAX_MESSAGE_LENGTH, type FeedbackMessage } from '../../types';

const props = withDefaults(
  defineProps<{
    messages: FeedbackMessage[];
    currentUid: string;
    sending?: boolean;
    disabled?: boolean;
    placeholder?: string;
    emptyTitle?: string;
    emptyCaption?: string;
  }>(),
  {
    sending: false,
    disabled: false,
    placeholder: 'Write a message',
    emptyTitle: 'Start the conversation',
    emptyCaption: 'Share an idea, a bug, or a question. We read every message.'
  }
);

const emit = defineEmits<{
  send: [text: string];
}>();

const draft = ref('');
const scrollRef = ref<{
  getScrollTarget: () => HTMLElement;
  setScrollPosition: (axis: 'vertical', offset: number, duration?: number) => void;
} | null>(null);
const maxLength = FEEDBACK_MAX_MESSAGE_LENGTH;

function isMine(message: FeedbackMessage) {
  return message.senderId === props.currentUid;
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function scrollToBottom() {
  await nextTick();
  const area = scrollRef.value;

  if (!area) {
    return;
  }

  const target = area.getScrollTarget();
  area.setScrollPosition('vertical', target.scrollHeight, 180);
}

function submit() {
  const text = draft.value.trim();

  if (!text || props.sending || props.disabled) {
    return;
  }

  emit('send', text);
  draft.value = '';
}

watch(
  () => props.messages.length,
  () => {
    void scrollToBottom();
  }
);

watch(
  () => props.messages.at(-1)?.id,
  () => {
    void scrollToBottom();
  }
);
</script>
