import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import type {
  FeedbackMessage,
  FeedbackMessageInput,
  FeedbackSenderRole,
  FeedbackThread
} from '../types';
import { FEEDBACK_MAX_MESSAGE_LENGTH, FEEDBACK_MAX_NAME_LENGTH } from '../types';

const THREADS = 'feedbackThreads';
const MESSAGES = 'messages';
const ADMINS = 'admins';

type ThreadListener = (threads: FeedbackThread[]) => void;
type MessageListener = (messages: FeedbackMessage[]) => void;
type SingleThreadListener = (thread: FeedbackThread | null) => void;

type DemoState = {
  threads: FeedbackThread[];
  messagesByThread: Record<string, FeedbackMessage[]>;
  threadListeners: Set<ThreadListener>;
  singleThreadListeners: Map<string, Set<SingleThreadListener>>;
  messageListeners: Map<string, Set<MessageListener>>;
};

const DEMO_DINER_ID = 'demo-diner';
const DEMO_SAM_ID = 'demo-sam';
const DEMO_ADMIN_ID = 'demo-admin';

function nowMs() {
  return Date.now();
}

function clipName(name: string) {
  const trimmed = name.trim() || 'Diner';
  return trimmed.slice(0, FEEDBACK_MAX_NAME_LENGTH);
}

function clipMessage(text: string) {
  return text.trim().slice(0, FEEDBACK_MAX_MESSAGE_LENGTH);
}

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }

  return db;
}

function readTimestamp(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return undefined;
}

function mapThreadDocument(document: QueryDocumentSnapshot<DocumentData>): FeedbackThread | null {
  const data = document.data();

  if (typeof data.userId !== 'string' || typeof data.lastMessage !== 'string') {
    return null;
  }

  return {
    id: document.id,
    userId: data.userId,
    userDisplayName: typeof data.userDisplayName === 'string' ? data.userDisplayName : 'Diner',
    lastMessage: data.lastMessage,
    lastMessageAt: readTimestamp(data.lastMessageAt),
    lastSenderRole: data.lastSenderRole === 'admin' ? 'admin' : 'user',
    unreadByAdmin: data.unreadByAdmin === true,
    unreadByUser: data.unreadByUser === true,
    createdAt: readTimestamp(data.createdAt),
    updatedAt: readTimestamp(data.updatedAt)
  };
}

function mapMessageDocument(
  threadId: string,
  document: QueryDocumentSnapshot<DocumentData>
): FeedbackMessage | null {
  const data = document.data();

  if (typeof data.text !== 'string' || typeof data.senderId !== 'string') {
    return null;
  }

  return {
    id: document.id,
    threadId,
    text: data.text,
    senderId: data.senderId,
    senderRole: data.senderRole === 'admin' ? 'admin' : 'user',
    senderName: typeof data.senderName === 'string' ? data.senderName : 'Diner',
    createdAt: readTimestamp(data.createdAt)
  };
}

function seedDemoState(): DemoState {
  const dinerStarted = nowMs() - 1000 * 60 * 60 * 6;
  const dinerReply = nowMs() - 1000 * 60 * 45;
  const samStarted = nowMs() - 1000 * 60 * 25;

  const dinerThread: FeedbackThread = {
    id: DEMO_DINER_ID,
    userId: DEMO_DINER_ID,
    userDisplayName: 'Alex Diner',
    lastMessage: 'The tacos at Love Park were incredible — more trucks there please!',
    lastMessageAt: dinerReply,
    lastSenderRole: 'user',
    unreadByAdmin: true,
    unreadByUser: false,
    createdAt: dinerStarted,
    updatedAt: dinerReply
  };

  const samThread: FeedbackThread = {
    id: DEMO_SAM_ID,
    userId: DEMO_SAM_ID,
    userDisplayName: 'Sam Ortiz',
    lastMessage: 'Can owners get a heads-up when someone spots their truck?',
    lastMessageAt: samStarted,
    lastSenderRole: 'user',
    unreadByAdmin: true,
    unreadByUser: false,
    createdAt: samStarted,
    updatedAt: samStarted
  };

  return {
    threads: [dinerThread, samThread],
    messagesByThread: {
      [DEMO_DINER_ID]: [
        {
          id: 'demo-msg-1',
          threadId: DEMO_DINER_ID,
          text: 'Hey Go Fetch — the map is great. One wish: filter by cuisine from the list.',
          senderId: DEMO_DINER_ID,
          senderRole: 'user',
          senderName: 'Alex Diner',
          createdAt: dinerStarted
        },
        {
          id: 'demo-msg-2',
          threadId: DEMO_DINER_ID,
          text: 'Thanks for writing in! Cuisine filters are on our list. Anything else we should know?',
          senderId: DEMO_ADMIN_ID,
          senderRole: 'admin',
          senderName: 'Go Fetch',
          createdAt: dinerStarted + 1000 * 60 * 90
        },
        {
          id: 'demo-msg-3',
          threadId: DEMO_DINER_ID,
          text: 'The tacos at Love Park were incredible — more trucks there please!',
          senderId: DEMO_DINER_ID,
          senderRole: 'user',
          senderName: 'Alex Diner',
          createdAt: dinerReply
        }
      ],
      [DEMO_SAM_ID]: [
        {
          id: 'demo-msg-4',
          threadId: DEMO_SAM_ID,
          text: 'Can owners get a heads-up when someone spots their truck?',
          senderId: DEMO_SAM_ID,
          senderRole: 'user',
          senderName: 'Sam Ortiz',
          createdAt: samStarted
        }
      ]
    },
    threadListeners: new Set(),
    singleThreadListeners: new Map(),
    messageListeners: new Map()
  };
}

const demoState: DemoState = seedDemoState();

function emitDemoThreads() {
  const sorted = [...demoState.threads].sort(
    (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
  );

  for (const listener of demoState.threadListeners) {
    listener(sorted);
  }

  for (const [threadId, listeners] of demoState.singleThreadListeners) {
    const thread = demoState.threads.find((item) => item.id === threadId) ?? null;
    for (const listener of listeners) {
      listener(thread);
    }
  }
}

function emitDemoMessages(threadId: string) {
  const listeners = demoState.messageListeners.get(threadId);

  if (!listeners) {
    return;
  }

  const messages = [...(demoState.messagesByThread[threadId] ?? [])].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );

  for (const listener of listeners) {
    listener(messages);
  }
}

function useDemo() {
  return !isFirebaseConfigured || !db;
}

export const feedbackDemoIds = {
  diner: DEMO_DINER_ID,
  admin: DEMO_ADMIN_ID
};

export async function isAdminUid(uid: string): Promise<boolean> {
  if (useDemo()) {
    return uid === DEMO_ADMIN_ID;
  }

  const snapshot = await getDoc(doc(requireDb(), ADMINS, uid));
  return snapshot.exists();
}

export function subscribeToFeedbackThread(
  threadId: string,
  onChange: SingleThreadListener,
  onError?: (error: Error) => void
): Unsubscribe {
  if (useDemo()) {
    const listeners = demoState.singleThreadListeners.get(threadId) ?? new Set();
    listeners.add(onChange);
    demoState.singleThreadListeners.set(threadId, listeners);
    onChange(demoState.threads.find((thread) => thread.id === threadId) ?? null);

    return () => {
      listeners.delete(onChange);
    };
  }

  return onSnapshot(
    doc(requireDb(), THREADS, threadId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }

      onChange(mapThreadDocument(snapshot as QueryDocumentSnapshot<DocumentData>));
    },
    (error) => {
      onChange(null);
      onError?.(error);
    }
  );
}

export function subscribeToAllFeedbackThreads(
  onChange: ThreadListener,
  onError?: (error: Error) => void
): Unsubscribe {
  if (useDemo()) {
    demoState.threadListeners.add(onChange);
    emitDemoThreads();

    return () => {
      demoState.threadListeners.delete(onChange);
    };
  }

  const threadsQuery = query(collection(requireDb(), THREADS), orderBy('lastMessageAt', 'desc'));

  return onSnapshot(
    threadsQuery,
    (snapshot) => {
      onChange(
        snapshot.docs
          .map(mapThreadDocument)
          .filter((thread): thread is FeedbackThread => Boolean(thread))
      );
    },
    (error) => {
      onChange([]);
      onError?.(error);
    }
  );
}

export function subscribeToFeedbackMessages(
  threadId: string,
  onChange: MessageListener,
  onError?: (error: Error) => void
): Unsubscribe {
  if (useDemo()) {
    const listeners = demoState.messageListeners.get(threadId) ?? new Set();
    listeners.add(onChange);
    demoState.messageListeners.set(threadId, listeners);
    emitDemoMessages(threadId);

    return () => {
      listeners.delete(onChange);
    };
  }

  const messagesQuery = query(
    collection(requireDb(), THREADS, threadId, MESSAGES),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((document) => mapMessageDocument(threadId, document))
          .filter((message): message is FeedbackMessage => Boolean(message))
      );
    },
    (error) => {
      onChange([]);
      onError?.(error);
    }
  );
}

export async function sendFeedbackMessage(input: FeedbackMessageInput): Promise<void> {
  const text = clipMessage(input.text);
  const displayName = clipName(input.displayName);

  if (!text) {
    throw new Error('Write a message before sending.');
  }

  if (input.role === 'user' && input.threadId !== input.uid) {
    throw new Error('You can only send feedback from your own conversation.');
  }

  if (useDemo()) {
    const createdAt = nowMs();
    const message: FeedbackMessage = {
      id: `demo-msg-${createdAt}`,
      threadId: input.threadId,
      text,
      senderId: input.uid,
      senderRole: input.role,
      senderName: input.role === 'admin' ? 'Go Fetch' : displayName,
      createdAt
    };

    const existing = demoState.threads.find((thread) => thread.id === input.threadId);
    const nextThread: FeedbackThread = {
      id: input.threadId,
      userId: existing?.userId ?? input.threadId,
      userDisplayName:
        input.role === 'user' ? displayName : (existing?.userDisplayName ?? displayName),
      lastMessage: text,
      lastMessageAt: createdAt,
      lastSenderRole: input.role,
      unreadByAdmin: input.role === 'user',
      unreadByUser: input.role === 'admin',
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt
    };

    demoState.threads = [nextThread, ...demoState.threads.filter((thread) => thread.id !== input.threadId)];
    demoState.messagesByThread[input.threadId] = [
      ...(demoState.messagesByThread[input.threadId] ?? []),
      message
    ];
    emitDemoThreads();
    emitDemoMessages(input.threadId);
    return;
  }

  const firestore = requireDb();
  const threadRef = doc(firestore, THREADS, input.threadId);
  const messageRef = doc(collection(threadRef, MESSAGES));
  const threadSnap = await getDoc(threadRef);
  const senderName = input.role === 'admin' ? 'Go Fetch' : displayName;
  const batch = writeBatch(firestore);

  if (threadSnap.exists()) {
    batch.update(threadRef, {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: input.role,
      unreadByAdmin: input.role === 'user',
      unreadByUser: input.role === 'admin',
      updatedAt: serverTimestamp(),
      ...(input.role === 'user' ? { userDisplayName: displayName } : {})
    });
  } else {
    if (input.role !== 'user') {
      throw new Error('This conversation does not exist yet.');
    }

    batch.set(threadRef, {
      userId: input.uid,
      userDisplayName: displayName,
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: 'user',
      unreadByAdmin: true,
      unreadByUser: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  batch.set(messageRef, {
    text,
    senderId: input.uid,
    senderRole: input.role,
    senderName,
    createdAt: serverTimestamp()
  });

  await batch.commit();
}

export async function markFeedbackThreadRead(
  threadId: string,
  role: FeedbackSenderRole
): Promise<void> {
  if (useDemo()) {
    const thread = demoState.threads.find((item) => item.id === threadId);

    if (!thread) {
      return;
    }

    if (role === 'admin') {
      thread.unreadByAdmin = false;
    } else {
      thread.unreadByUser = false;
    }

    thread.updatedAt = nowMs();
    emitDemoThreads();
    return;
  }

  const firestore = requireDb();
  const threadRef = doc(firestore, THREADS, threadId);
  const snapshot = await getDoc(threadRef);

  if (!snapshot.exists()) {
    return;
  }

  const data = snapshot.data();
  const alreadyRead = role === 'admin' ? data.unreadByAdmin !== true : data.unreadByUser !== true;

  if (alreadyRead) {
    return;
  }

  const batch = writeBatch(firestore);
  batch.update(threadRef, {
    ...(role === 'admin' ? { unreadByAdmin: false } : { unreadByUser: false }),
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}
