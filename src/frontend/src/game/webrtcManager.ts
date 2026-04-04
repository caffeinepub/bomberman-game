// WebRTC Manager for Online Co-op
// Uses ICP canister only for signaling (SDP + ICE exchange)
// All game data flows over DataChannel after connection is established

export type RTCRole = "host" | "guest";

export interface WebRTCManager {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  role: RTCRole;
  isConnected: boolean;
  onMessage: ((data: string) => void) | null;
  onConnected: (() => void) | null;
  onDisconnected: (() => void) | null;
}

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function createWebRTCManager(role: RTCRole): WebRTCManager {
  const pc = new RTCPeerConnection(STUN_CONFIG);
  const manager: WebRTCManager = {
    pc,
    dc: null,
    role,
    isConnected: false,
    onMessage: null,
    onConnected: null,
    onDisconnected: null,
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      manager.isConnected = true;
      manager.onConnected?.();
    } else if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      manager.isConnected = false;
      manager.onDisconnected?.();
    }
  };

  return manager;
}

// HOST: create data channel and offer
export async function hostCreateOffer(manager: WebRTCManager): Promise<string> {
  const dc = manager.pc.createDataChannel("game", {
    ordered: false,
    maxRetransmits: 0,
  });
  manager.dc = dc;
  dc.onopen = () => {
    manager.isConnected = true;
    manager.onConnected?.();
  };
  dc.onclose = () => {
    manager.isConnected = false;
    manager.onDisconnected?.();
  };
  dc.onmessage = (e) => manager.onMessage?.(e.data as string);

  const offer = await manager.pc.createOffer();
  await manager.pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete (or trickle via onicecandidate)
  return JSON.stringify(manager.pc.localDescription);
}

// HOST: receive answer from guest
export async function hostReceiveAnswer(
  manager: WebRTCManager,
  answerJson: string,
): Promise<void> {
  const answer = JSON.parse(answerJson) as RTCSessionDescriptionInit;
  if (manager.pc.signalingState !== "stable") {
    await manager.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

// GUEST: receive offer and create answer
export async function guestReceiveOffer(
  manager: WebRTCManager,
  offerJson: string,
): Promise<string> {
  // Set up data channel receive handler
  manager.pc.ondatachannel = (e) => {
    manager.dc = e.channel;
    e.channel.onopen = () => {
      manager.isConnected = true;
      manager.onConnected?.();
    };
    e.channel.onclose = () => {
      manager.isConnected = false;
      manager.onDisconnected?.();
    };
    e.channel.onmessage = (ev) => manager.onMessage?.(ev.data as string);
  };

  const offer = JSON.parse(offerJson) as RTCSessionDescriptionInit;
  await manager.pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await manager.pc.createAnswer();
  await manager.pc.setLocalDescription(answer);
  return JSON.stringify(manager.pc.localDescription);
}

// Add a remote ICE candidate
export async function addIceCandidate(
  manager: WebRTCManager,
  candidateJson: string,
): Promise<void> {
  try {
    const candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
    if (manager.pc.remoteDescription) {
      await manager.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (_e) {
    // Ignore stale or invalid candidates
  }
}

// Send data over the DataChannel
export function sendData(manager: WebRTCManager, data: string): void {
  if (manager.dc && manager.dc.readyState === "open") {
    manager.dc.send(data);
  }
}

// Close the connection and clean up
export function closeConnection(manager: WebRTCManager): void {
  try {
    manager.dc?.close();
  } catch (_e) {
    // ignore
  }
  try {
    manager.pc.close();
  } catch (_e) {
    // ignore
  }
  manager.isConnected = false;
}
