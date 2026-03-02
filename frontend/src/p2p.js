/**
 * p2p.js — WebRTC peer-to-peer file transfer.
 *
 * Files never touch the server.  The server's WebSocket is used only as a
 * signaling channel (offer / answer / ICE candidates).
 *
 * Flow:
 *   1. Uploader drops files → stored in localFiles Map, metadata broadcast via WS.
 *   2. Downloader clicks Download → sends "file_request" to the owner peer.
 *   3. Owner creates RTCPeerConnection + DataChannel, sends offer via WS relay.
 *   4. Downloader sets remote desc, answers, both exchange ICE via WS relay.
 *   5. DataChannel opens: owner streams file in 16 KB chunks.
 *   6. Downloader reassembles Blob → browser download.
 */

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const CHUNK_SIZE = 16 * 1024; // 16 KB — well within DataChannel limits

// ---------------------------------------------------------------------------
// P2PManager
// ---------------------------------------------------------------------------

export class P2PManager {
  /**
   * @param {WebSocket} ws          - signaling WebSocket (already connected)
   * @param {Map}       localFiles  - Map<fileId, File>  (files owned by this peer)
   */
  constructor(ws, localFiles) {
    this.ws = ws;
    this.localFiles = localFiles;

    /** Map<connId, { pc, role, resolve, reject, onProgress }> */
    this._conns = new Map();

    /** Map<connId, RTCIceCandidate[]> — buffered before remote desc is set */
    this._pendingIce = new Map();
  }

  // -------------------------------------------------------------------------
  // Called by the WS message handler
  // -------------------------------------------------------------------------

  /** Sender side: a remote peer wants one of our files. */
  async handleFileRequest(fromPeerId, fileId, connId) {
    const file = this.localFiles.get(fileId);
    if (!file) return; // we no longer have it

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this._conns.set(connId, { pc, role: "sender" });

    // Create DataChannel and stream file once it opens
    const dc = pc.createDataChannel("file");
    dc.binaryType = "arraybuffer";

    dc.onopen = async () => {
      try {
        // 1. Header
        dc.send(
          JSON.stringify({ name: file.name, size: file.size, type: file.type }),
        );

        // 2. Chunks
        let offset = 0;
        while (offset < file.size) {
          // Back-pressure: wait if the send buffer is too full
          while (dc.bufferedAmount > 4 * 1024 * 1024) {
            await new Promise((r) => setTimeout(r, 10));
          }
          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const buf = await slice.arrayBuffer();
          dc.send(buf);
          offset += buf.byteLength;
        }

        // 3. EOF sentinel
        dc.send(JSON.stringify({ done: true }));
      } catch (err) {
        console.error("[P2P] sender error:", err);
      }
    };

    dc.onerror = (e) => console.error("[P2P] sender DataChannel error:", e);

    this._setupIce(pc, fromPeerId, connId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this._send({
      type: "webrtc_offer",
      to: fromPeerId,
      conn_id: connId,
      sdp: offer,
    });
    await this._flushIce(pc, connId);
  }

  /** Receiver side: got an offer from the file owner. */
  async handleOffer(fromPeerId, connId, sdp) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Merge any existing entry (may already have resolve/reject from requestFile)
    const existing = this._conns.get(connId) || {};
    const entry = { ...existing, pc, role: "receiver" };
    this._conns.set(connId, entry);

    // Receive file through the DataChannel
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.binaryType = "arraybuffer";

      let metadata = null;
      const chunks = [];
      let received = 0;

      dc.onmessage = (evt) => {
        if (typeof evt.data === "string") {
          const msg = JSON.parse(evt.data);
          if (msg.done) {
            const blob = new Blob(chunks, {
              type: metadata?.type || "application/octet-stream",
            });
            entry.resolve?.({ blob, filename: metadata?.name ?? "download" });
            pc.close();
            this._conns.delete(connId);
          } else {
            metadata = msg; // first string message is the header
          }
        } else {
          chunks.push(evt.data);
          received += evt.data.byteLength;
          if (metadata?.size) {
            entry.onProgress?.(Math.round((received / metadata.size) * 100));
          }
        }
      };

      dc.onerror = (e) => {
        entry.reject?.(e);
        this._conns.delete(connId);
      };
    };

    this._setupIce(pc, fromPeerId, connId);

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this._send({
      type: "webrtc_answer",
      to: fromPeerId,
      conn_id: connId,
      sdp: answer,
    });
    await this._flushIce(pc, connId);
  }

  /** Sender side: got the receiver's answer. */
  async handleAnswer(connId, sdp) {
    const entry = this._conns.get(connId);
    if (!entry?.pc) return;
    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this._flushIce(entry.pc, connId);
  }

  /** Either side: got an ICE candidate from the remote. */
  async handleIce(connId, candidate) {
    const entry = this._conns.get(connId);
    const pc = entry?.pc;

    if (!pc || !pc.remoteDescription) {
      // Buffer — remote description not set yet
      if (!this._pendingIce.has(connId)) this._pendingIce.set(connId, []);
      this._pendingIce.get(connId).push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn("[P2P] addIceCandidate error:", e);
    }
  }

  // -------------------------------------------------------------------------
  // Called by the download button (receiver initiates)
  // -------------------------------------------------------------------------

  /**
   * Request a file from a remote peer.
   * @param {string}   toPeerId   - peer that owns the file
   * @param {string}   fileId     - file identifier
   * @param {function} onProgress - (0-100) progress callback
   * @returns {Promise<{blob: Blob, filename: string}>}
   */
  requestFile(toPeerId, fileId, onProgress) {
    const connId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Store callbacks BEFORE sending so even a very fast reply finds them
      this._conns.set(connId, {
        pc: null,
        role: "receiver",
        resolve,
        reject,
        onProgress,
        fileId,
      });
      this._send({
        type: "file_request",
        to: toPeerId,
        file_id: fileId,
        conn_id: connId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _send(msg) {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error("[P2P] WS send error:", e);
    }
  }

  _setupIce(pc, remotePeerId, connId) {
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._send({
          type: "webrtc_ice",
          to: remotePeerId,
          conn_id: connId,
          candidate: e.candidate,
        });
      }
    };
  }

  /** Flush any ICE candidates that arrived before remote description was set. */
  async _flushIce(pc, connId) {
    const pending = this._pendingIce.get(connId);
    if (!pending?.length) return;
    this._pendingIce.delete(connId);
    for (const c of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn("[P2P] flush ICE error:", e);
      }
    }
  }
}
