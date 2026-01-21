import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ChatMessage } from './agentService';

const DB_NAME = 'rvm-chat-db';
const DB_VERSION = 1;
const RETENTION_DAYS = 14;

export interface ChatSession {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatMessage[];
    // Para contexto futuro
    weeksMentioned?: string[];
}

interface RvmChatDB extends DBSchema {
    sessions: {
        key: string;
        value: ChatSession;
        indexes: { 'by-date': Date };
    };
}

class ChatHistoryService {
    private dbPromise: Promise<IDBPDatabase<RvmChatDB>>;

    constructor() {
        this.dbPromise = openDB<RvmChatDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                const store = db.createObjectStore('sessions', {
                    keyPath: 'id',
                });
                store.createIndex('by-date', 'updatedAt');
            },
        });
    }

    /**
     * Cria uma nova sessão de chat
     */
    async createSession(initialTitle: string = 'Nova Conversa'): Promise<ChatSession> {
        const session: ChatSession = {
            id: crypto.randomUUID(),
            title: initialTitle,
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: [],
        };
        const db = await this.dbPromise;
        await db.put('sessions', session);
        return session;
    }

    /**
     * Salva uma mensagem em uma sessão existente
     */
    async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction('sessions', 'readwrite');
        const session = await tx.store.get(sessionId);

        if (session) {
            session.messages.push(message);
            session.updatedAt = new Date();

            // Atualiza título se for a primeira mensagem do usuário
            if (session.messages.length <= 2 && message.role === 'user') {
                session.title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
            }

            await tx.store.put(session);
        }
        await tx.done;
    }

    /**
     * Obtém uma sessão por ID
     */
    async getSession(sessionId: string): Promise<ChatSession | undefined> {
        const db = await this.dbPromise;
        return db.get('sessions', sessionId);
    }

    /**
     * Lista sessões recentes ordenadas por data
     */
    async getRecentSessions(limit: number = 20): Promise<ChatSession[]> {
        const db = await this.dbPromise;
        const sessions = await db.getAllFromIndex('sessions', 'by-date');
        // IndexedDB ordena ascendente, reverter para pegar mais recentes
        return sessions.reverse().slice(0, limit);
    }

    /**
     * Remove sessões antigas (> 14 dias)
     */
    async pruneOldSessions(): Promise<number> {
        const db = await this.dbPromise;
        const sessions = await db.getAll('sessions');
        const now = new Date();
        const limitDate = new Date(now.setDate(now.getDate() - RETENTION_DAYS));

        let deletedCount = 0;
        const tx = db.transaction('sessions', 'readwrite');

        for (const session of sessions) {
            // Converter para Date se tiver sido recuperado como string/timestamp
            const updatedAt = new Date(session.updatedAt);
            if (updatedAt < limitDate) {
                await tx.store.delete(session.id);
                deletedCount++;
            }
        }

        await tx.done;
        if (deletedCount > 0) {
            console.log(`[ChatHistory] Prunned ${deletedCount} old sessions.`);
        }
        return deletedCount;
    }

    /**
     * Limpa todo o histórico
     */
    async clearAll(): Promise<void> {
        const db = await this.dbPromise;
        await db.clear('sessions');
    }
}

export const chatHistoryService = new ChatHistoryService();
