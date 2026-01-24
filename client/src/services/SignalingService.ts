
import { useAuthStore } from '../stores/authStore';

// Signal Types
enum SignalType {
  UNKNOWN = 0,
  OFFER = 1,
  ANSWER = 2,
  ICE_CANDIDATE = 3,
  JOIN = 4,
  LEAVE = 5,
  PRESENCE = 6
}

interface SignalMessage {
  type: SignalType;
  source_peer_id?: string;
  target_peer_id?: string;
  sdp?: string;
  ice_candidate?: string;
  presence_status?: string; // "online" | "offline"
}

class SignalingService {
  private ws: WebSocket | null = null;
  private reconnectInterval: number | null = null;
  private isConnecting = false;

  constructor() { }

  public connect(url: string, userId: string, accessToken: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.isConnecting) return;

    this.isConnecting = true;
    console.log(`Connecting to Signaling Server: ${url}`);

    // Append access token to query params for authentication
    const wsUrl = new URL(url);
    wsUrl.searchParams.append('token', accessToken);

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onopen = () => {
      console.log('Signaling WebSocket Connected');
      this.isConnecting = false;
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: SignalMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse signaling message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('Signaling WebSocket Disconnected');
      this.isConnecting = false;
      this.ws = null;
      this.scheduleReconnect(url, userId, accessToken);
    };

    this.ws.onerror = (err) => {
      console.error('Signaling WebSocket Error:', err);
      this.ws?.close();
    };
  }

  private handleMessage(msg: SignalMessage) {
    console.log('Received Signal:', msg);

    if (msg.type === SignalType.PRESENCE && msg.source_peer_id) {
      const isOnline = msg.presence_status === 'online';
      useAuthStore.getState().updateCrewPresence(msg.source_peer_id, isOnline);
    }
  }

  private scheduleReconnect(url: string, userId: string, accessToken: string) {
    if (this.reconnectInterval) return;
    this.reconnectInterval = window.setInterval(() => {
      console.log('Reconnecting to Signaling Server...');
      this.connect(url, userId, accessToken);
    }, 5000);
  }

  public disconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    this.ws?.close();
  }
}

export const signalingService = new SignalingService();
