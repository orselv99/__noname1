import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';

interface ChatDB extends DBSchema {
  rooms: {
    key: string;
    value: {
      id: string;
      participants: string[];
      name?: string;
      createdAt: number;
      updatedAt: number;
    };
  };
  messages: {
    key: string;
    value: {
      id: string;
      roomId: string;
      senderId: string;
      content: string;
      timestamp: number;
      status: 'pending' | 'sent' | 'delivered' | 'read';
    };
    indexes: { 'by-room': string; 'by-timestamp': number };
  };
}

class MessagingStore {
  private dbPromise: Promise<IDBPDatabase<ChatDB>>;

  constructor() {
    this.dbPromise = openDB<ChatDB>('fiery-messaging', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('rooms')) {
          db.createObjectStore('rooms', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-room', 'roomId');
          msgStore.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }

  // --- Rooms ---

  async createOrUpdateRoom(room: { id: string; participants: string[]; name?: string }) {
    const db = await this.dbPromise;
    const existing = await db.get('rooms', room.id);
    await db.put('rooms', {
      ...room,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
  }

  async getRoom(roomId: string) {
    const db = await this.dbPromise;
    return db.get('rooms', roomId);
  }

  async getAllRooms() {
    const db = await this.dbPromise;
    return db.getAll('rooms');
  }

  // --- Messages ---

  async addMessage(msg: { roomId: string; senderId: string; content: string; status?: 'pending' | 'sent' | 'read' }) {
    const db = await this.dbPromise;
    const message = {
      id: uuidv4(),
      timestamp: Date.now(),
      status: 'pending' as const,
      ...msg,
    };
    await db.put('messages', message);

    // Update room updatedAt
    const room = await db.get('rooms', msg.roomId);
    if (room) {
      room.updatedAt = message.timestamp;
      await db.put('rooms', room);
    }

    return message;
  }

  async getMessages(roomId: string) {
    const db = await this.dbPromise;
    return db.getAllFromIndex('messages', 'by-room', roomId);
  }
}

export const messagingStore = new MessagingStore();
