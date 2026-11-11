import "server-only";

import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import type {
  Chat,
  DBMessage,
  Document,
  Stream,
  Suggestion,
  User,
  Vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

/**
 * In-memory storage, so the app runs with no database. Everything lives in this process and is gone on restart.
 * Kept on globalThis so Next.js hot reloads in development don't wipe it.
 */
type Store = {
  users: User[];
  chats: Chat[];
  messages: DBMessage[];
  votes: Vote[];
  documents: Document[];
  suggestions: Suggestion[];
  streams: Stream[];
};

const globalStore = globalThis as typeof globalThis & {
  __chatbotStore?: Store;
};
const store: Store = (globalStore.__chatbotStore ??= {
  users: [],
  chats: [],
  messages: [],
  votes: [],
  documents: [],
  suggestions: [],
  streams: [],
});

const byCreatedAsc = <T extends { createdAt: Date }>(a: T, b: T) =>
  a.createdAt.getTime() - b.createdAt.getTime();

export async function getUser(email: string): Promise<User[]> {
  return store.users.filter((u) => u.email === email);
}

function newUser(email: string, password: string): User {
  const now = new Date();
  return {
    createdAt: now,
    email,
    emailVerified: false,
    id: generateUUID(),
    image: null,
    isAnonymous: false,
    name: null,
    password,
    updatedAt: now,
  };
}

export async function createUser(email: string, password: string) {
  const created = newUser(email, generateHashedPassword(password));
  store.users.push(created);
  return [created];
}

export async function createGuestUser() {
  const created = newUser(
    `guest-${Date.now()}`,
    generateHashedPassword(generateUUID())
  );
  store.users.push(created);
  return [{ email: created.email, id: created.id }];
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  const created: Chat = {
    createdAt: new Date(),
    id,
    title,
    userId,
    visibility,
  };
  store.chats.push(created);
  return [created];
}

function removeChats(chatIds: Set<string>) {
  store.votes = store.votes.filter((v) => !chatIds.has(v.chatId));
  store.messages = store.messages.filter((m) => !chatIds.has(m.chatId));
  store.streams = store.streams.filter((s) => !chatIds.has(s.chatId));
  const deleted = store.chats.filter((c) => chatIds.has(c.id));
  store.chats = store.chats.filter((c) => !chatIds.has(c.id));
  return deleted;
}

export async function deleteChatById({ id }: { id: string }) {
  const [deleted] = removeChats(new Set([id]));
  return deleted;
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  const ids = new Set(
    store.chats.filter((c) => c.userId === userId).map((c) => c.id)
  );
  return { deletedCount: removeChats(ids).length };
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  let chats = store.chats
    .filter((c) => c.userId === id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const cursorId = startingAfter ?? endingBefore;
  if (cursorId) {
    const cursor = store.chats.find((c) => c.id === cursorId);
    if (!cursor) {
      throw new ChatbotError(
        "not_found:database",
        `Chat with id ${cursorId} not found`
      );
    }
    chats = chats.filter((c) =>
      startingAfter
        ? c.createdAt > cursor.createdAt
        : c.createdAt < cursor.createdAt
    );
  }

  const hasMore = chats.length > limit;
  return { chats: chats.slice(0, limit), hasMore };
}

export async function getChatById({ id }: { id: string }) {
  return store.chats.find((c) => c.id === id) ?? null;
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  store.messages.push(...messages);
  return messages;
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  for (const m of store.messages) {
    if (m.id === id) {
      m.parts = parts;
    }
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  return store.messages.filter((m) => m.chatId === id).sort(byCreatedAsc);
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  const existing = store.votes.find(
    (v) => v.messageId === messageId && v.chatId === chatId
  );
  if (existing) {
    existing.isUpvoted = type === "up";
    return;
  }
  store.votes.push({ chatId, isUpvoted: type === "up", messageId });
}

export async function getVotesByChatId({ id }: { id: string }) {
  return store.votes.filter((v) => v.chatId === id);
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  const created: Document = {
    content,
    createdAt: new Date(),
    id,
    kind,
    title,
    userId,
  };
  store.documents.push(created);
  return [created];
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  const latest = store.documents
    .filter((d) => d.id === id)
    .sort(byCreatedAsc)
    .at(-1);
  if (!latest) {
    throw new ChatbotError("not_found:database", "Document not found");
  }
  latest.content = content;
  return [latest];
}

export async function getDocumentsById({ id }: { id: string }) {
  return store.documents.filter((d) => d.id === id).sort(byCreatedAsc);
}

export async function getDocumentById({ id }: { id: string }) {
  return store.documents
    .filter((d) => d.id === id)
    .sort(byCreatedAsc)
    .at(-1);
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  store.suggestions = store.suggestions.filter(
    (s) => !(s.documentId === id && s.documentCreatedAt > timestamp)
  );
  const deleted = store.documents.filter(
    (d) => d.id === id && d.createdAt > timestamp
  );
  store.documents = store.documents.filter((d) => !deleted.includes(d));
  return deleted;
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  store.suggestions.push(...suggestions);
  return suggestions;
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  return store.suggestions.filter((s) => s.documentId === documentId);
}

export async function getMessageById({ id }: { id: string }) {
  return store.messages.filter((m) => m.id === id);
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  const ids = new Set(
    store.messages
      .filter((m) => m.chatId === chatId && m.createdAt >= timestamp)
      .map((m) => m.id)
  );
  store.votes = store.votes.filter(
    (v) => !(v.chatId === chatId && ids.has(v.messageId))
  );
  store.messages = store.messages.filter((m) => !ids.has(m.id));
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  for (const c of store.chats) {
    if (c.id === chatId) {
      c.visibility = visibility;
    }
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  for (const c of store.chats) {
    if (c.id === chatId) {
      c.title = title;
    }
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  const cutoff = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);
  const chatIds = new Set(
    store.chats.filter((c) => c.userId === id).map((c) => c.id)
  );
  return store.messages.filter(
    (m) => chatIds.has(m.chatId) && m.createdAt >= cutoff && m.role === "user"
  ).length;
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  store.streams.push({ chatId, createdAt: new Date(), id: streamId });
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  return store.streams
    .filter((s) => s.chatId === chatId)
    .sort(byCreatedAsc)
    .map(({ id }) => id);
}
