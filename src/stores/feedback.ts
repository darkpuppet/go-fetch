import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  markFeedbackThreadRead,
  sendFeedbackMessage,
  subscribeToAllFeedbackThreads,
  subscribeToFeedbackMessages,
  subscribeToFeedbackThread
} from '../services/feedback';
import type { FeedbackMessage, FeedbackSenderRole, FeedbackThread } from '../types';

export const useFeedbackStore = defineStore('feedback', () => {
  const inbox = ref<FeedbackThread[]>([]);
  const ownThread = ref<FeedbackThread | null>(null);
  const activeThreadId = ref<string | null>(null);
  const messages = ref<FeedbackMessage[]>([]);
  const inboxLoaded = ref(false);
  const ownThreadLoaded = ref(false);
  const messagesLoaded = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);

  let ownUid: string | null = null;
  let messagesThreadId: string | null = null;
  let unsubscribeInbox: (() => void) | null = null;
  let unsubscribeOwn: (() => void) | null = null;
  let unsubscribeMessages: (() => void) | null = null;

  const activeThread = computed(() => {
    if (!activeThreadId.value) {
      return null;
    }

    return (
      inbox.value.find((thread) => thread.id === activeThreadId.value) ??
      (ownThread.value?.id === activeThreadId.value ? ownThread.value : null)
    );
  });

  const adminUnreadCount = computed(
    () => inbox.value.filter((thread) => thread.unreadByAdmin).length
  );

  const userUnreadCount = computed(() => (ownThread.value?.unreadByUser ? 1 : 0));

  function attachInbox() {
    if (unsubscribeInbox) {
      return;
    }

    unsubscribeInbox = subscribeToAllFeedbackThreads(
      (threads) => {
        inbox.value = threads;
        inboxLoaded.value = true;
      },
      (listenError) => {
        error.value = listenError.message;
      }
    );
  }

  function attachOwnThread(uid: string) {
    if (ownUid === uid && unsubscribeOwn) {
      return;
    }

    unsubscribeOwn?.();
    ownUid = uid;
    ownThreadLoaded.value = false;

    unsubscribeOwn = subscribeToFeedbackThread(
      uid,
      (thread) => {
        ownThread.value = thread;
        ownThreadLoaded.value = true;
      },
      (listenError) => {
        error.value = listenError.message;
      }
    );
  }

  function openThread(threadId: string, readerRole?: FeedbackSenderRole) {
    activeThreadId.value = threadId;

    if (messagesThreadId === threadId && unsubscribeMessages) {
      if (readerRole) {
        void markThreadRead(threadId, readerRole);
      }
      return;
    }

    unsubscribeMessages?.();
    messagesThreadId = threadId;
    messages.value = [];
    messagesLoaded.value = false;

    unsubscribeMessages = subscribeToFeedbackMessages(
      threadId,
      (nextMessages) => {
        messages.value = nextMessages;
        messagesLoaded.value = true;
      },
      (listenError) => {
        error.value = listenError.message;
      }
    );

    if (readerRole) {
      void markThreadRead(threadId, readerRole);
    }
  }

  async function markThreadRead(threadId: string, role: FeedbackSenderRole) {
    try {
      await markFeedbackThreadRead(threadId, role);
    } catch (markError) {
      error.value = markError instanceof Error ? markError.message : 'Unable to mark messages read.';
    }
  }

  async function sendMessage(input: {
    threadId: string;
    uid: string;
    displayName: string;
    role: FeedbackSenderRole;
    text: string;
  }) {
    sending.value = true;
    error.value = null;

    try {
      await sendFeedbackMessage(input);

      if (activeThreadId.value !== input.threadId) {
        openThread(input.threadId, input.role);
      }
    } catch (sendError) {
      error.value = sendError instanceof Error ? sendError.message : 'Unable to send message.';
      throw sendError;
    } finally {
      sending.value = false;
    }
  }

  function reset() {
    unsubscribeInbox?.();
    unsubscribeOwn?.();
    unsubscribeMessages?.();
    unsubscribeInbox = null;
    unsubscribeOwn = null;
    unsubscribeMessages = null;
    ownUid = null;
    messagesThreadId = null;
    inbox.value = [];
    ownThread.value = null;
    activeThreadId.value = null;
    messages.value = [];
    inboxLoaded.value = false;
    ownThreadLoaded.value = false;
    messagesLoaded.value = false;
    sending.value = false;
    error.value = null;
  }

  return {
    inbox,
    ownThread,
    activeThreadId,
    activeThread,
    messages,
    inboxLoaded,
    ownThreadLoaded,
    messagesLoaded,
    sending,
    error,
    adminUnreadCount,
    userUnreadCount,
    attachInbox,
    attachOwnThread,
    openThread,
    sendMessage,
    reset
  };
});
