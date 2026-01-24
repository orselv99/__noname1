
import { signalingService, SignalType, SignalMessage } from '../SignalingService';


// P2P Data Channel Message Structure
export interface P2PMessage {
  feature: string; // 'chat', 'whiteboard', etc.
  roomId?: string; // For room-based routing
  payload: any;
  timestamp?: number;
}

type P2PListener = (peerId: string, msg: P2PMessage) => void;

class P2PManager {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private listeners: P2PListener[] = [];
  private myPeerId: string | null = null;
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    // Turn servers can be added here
  ];

  constructor() {
    // Listen to signaling events
    signalingService.subscribe(this.handleSignal.bind(this));
  }

  public setMyPeerId(id: string) {
    this.myPeerId = id;
  }

  public subscribe(listener: P2PListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // --- Signaling Handling ---

  private async handleSignal(msg: SignalMessage) {
    if (!msg.source_peer_id) return;
    const peerId = msg.source_peer_id;

    try {
      if (msg.type === SignalType.OFFER && msg.sdp) {
        await this.handleOffer(peerId, msg.sdp);
      } else if (msg.type === SignalType.ANSWER && msg.sdp) {
        await this.handleAnswer(peerId, msg.sdp);
      } else if (msg.type === SignalType.ICE_CANDIDATE && msg.ice_candidate) {
        await this.handleIceCandidate(peerId, JSON.parse(msg.ice_candidate));
      }
    } catch (e) {
      console.error(`Error handling signal from ${peerId}:`, e);
    }
  }

  private async handleOffer(peerId: string, sdp: string) {
    console.log(`Handling OFFER from ${peerId}`);
    const pc = this.getOrCreatePeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

    // Create Answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    signalingService.sendSignal({
      type: SignalType.ANSWER,
      target_peer_id: peerId,
      sdp: answer.sdp
    });
  }

  private async handleAnswer(peerId: string, sdp: string) {
    console.log(`Handling ANSWER from ${peerId}`);
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    console.log(`Handling ICE Candidate from ${peerId}`);
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  // --- Connection Management ---

  public connect(peerId: string) {
    if (this.peers.has(peerId)) return; // Already connected or connecting

    console.log(`Initiating connection to ${peerId}`);
    const pc = this.getOrCreatePeerConnection(peerId);

    // Create Data Channel (Initiator)
    const dc = pc.createDataChannel('fiery-data');
    this.setupDataChannel(peerId, dc);

    // Create Offer
    pc.createOffer().then(async (offer) => {
      await pc.setLocalDescription(offer);
      signalingService.sendSignal({
        type: SignalType.OFFER,
        target_peer_id: peerId,
        sdp: offer.sdp
      });
    });
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!;
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.sendSignal({
          type: SignalType.ICE_CANDIDATE,
          target_peer_id: peerId,
          ice_candidate: JSON.stringify(event.candidate)
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.cleanup(peerId);
      }
    };

    // Handle Data Channel (Receiver)
    pc.ondatachannel = (event) => {
      console.log(`Received Data Channel from ${peerId}`);
      this.setupDataChannel(peerId, event.channel);
    };

    return pc;
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel) {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log(`Data Channel Open with ${peerId}`);
    };

    dc.onmessage = (event) => {
      try {
        const msg: P2PMessage = JSON.parse(event.data);
        this.notifyListeners(peerId, msg);
      } catch (e) {
        console.error('Failed to parse P2P message:', e);
      }
    };

    dc.onclose = () => {
      console.log(`Data Channel Closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };
  }

  private cleanup(peerId: string) {
    const pc = this.peers.get(peerId);
    pc?.close();
    this.peers.delete(peerId);
    this.dataChannels.delete(peerId);
  }

  // --- Messaging ---

  public send(peerId: string, msg: P2PMessage) {
    const dc = this.dataChannels.get(peerId);
    if (dc && dc.readyState === 'open') {
      msg.timestamp = Date.now();
      dc.send(JSON.stringify(msg));
    } else {
      console.warn(`Cannot send message to ${peerId}: Data Channel not open`);
      // Optionally queue message
    }
  }

  public broadcast(peerIds: string[], msg: P2PMessage) {
    peerIds.forEach(id => {
      if (id !== this.myPeerId) {
        this.send(id, msg);
      }
    });
  }

  private notifyListeners(peerId: string, msg: P2PMessage) {
    this.listeners.forEach(l => l(peerId, msg));
  }
}

export const p2pManager = new P2PManager();
