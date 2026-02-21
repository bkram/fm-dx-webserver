"use strict";

class AudioHandlerClient {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    this.socket = null;
    this.nextPlayTime = 0;
    this.started = false;
    this.connecting = false;
    this.uiBound = false;
    this.targetBufferSeconds = 0.16;
    this.minBufferSeconds = 0.08;
    this.maxBufferSeconds = 0.35;
    this.underrunCount = 0;
    this.stableCount = 0;
  }

  async start() {
    if (this.started || this.connecting) {
      return;
    }

    this.connecting = true;

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.95;
      this.gainNode.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const url = new URL("/audio", window.location.href);
    url.protocol = url.protocol.replace("http", "ws");

    this.socket = new WebSocket(url.toString());
    this.socket.binaryType = "arraybuffer";
    this.socket.onopen = async () => {
      if (this.audioContext && this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
        } catch (_) {
          // ignore resume errors
        }
      }
    };
    this.socket.onmessage = (event) => this.onAudioPacket(event.data);
    this.socket.onclose = () => {
      this.started = false;
      this.connecting = false;
      this.nextPlayTime = 0;
    };
    this.socket.onerror = () => {
      this.connecting = false;
    };

    this.started = true;
    this.connecting = false;
  }

  async stop() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {
        // ignore
      }
      this.socket = null;
    }
    this.started = false;
    this.connecting = false;
    this.nextPlayTime = 0;
  }

  setVolume(v) {
    if (!this.gainNode) {
      return;
    }
    const num = Number(v);
    if (Number.isFinite(num)) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, num));
    }
  }

  updatePlayButtons(isPlaying) {
    const buttons = document.querySelectorAll('.playbutton i');
    buttons.forEach((icon) => {
      icon.classList.remove('fa-play', 'fa-stop');
      icon.classList.add(isPlaying ? 'fa-stop' : 'fa-play');
    });
  }

  async togglePlayback() {
    if (this.started || this.connecting) {
      await this.stop();
      this.updatePlayButtons(false);
      return;
    }

    await this.start();
    this.updatePlayButtons(true);
  }

  bindUI() {
    if (this.uiBound) {
      return;
    }
    this.uiBound = true;

    const onPlayClick = async (e) => {
      e.preventDefault();
      try {
        await this.togglePlayback();
      } catch (_) {
        // ignore toggle failures in UI
      }
    };

    document.querySelectorAll('.playbutton').forEach((btn) => {
      btn.addEventListener('click', onPlayClick);
    });

    const vol = document.getElementById('volumeSlider');
    if (vol) {
      this.setVolume(vol.value);
      vol.addEventListener('input', () => this.setVolume(vol.value));
      vol.addEventListener('change', () => this.setVolume(vol.value));
    }

    this.updatePlayButtons(false);
  }

  onAudioPacket(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) {
      return;
    }

    const header = new DataView(buffer, 0, 16);
    const sampleRate = header.getUint16(12, true) || 48000;
    const channels = Math.max(1, header.getUint8(14) || 1);

    const bytesPerFrame = channels * 2;
    const rawPayloadBytes = buffer.byteLength - 16;
    const payloadBytes = rawPayloadBytes - (rawPayloadBytes % bytesPerFrame);
    if (payloadBytes <= 0) {
      return;
    }

    const payload = new Int16Array(buffer, 16, payloadBytes / 2);
    if (!payload.length) {
      return;
    }

    const frames = Math.floor(payload.length / channels);
    if (!frames) {
      return;
    }

    const audioBuffer = this.audioContext.createBuffer(channels, frames, sampleRate);
    for (let ch = 0; ch < channels; ch += 1) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frames; i += 1) {
        const idx = i * channels + ch;
        channelData[i] = payload[idx] / 32768;
      }
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const now = this.audioContext.currentTime;

    if (this.nextPlayTime && this.nextPlayTime < now + this.minBufferSeconds) {
      this.underrunCount += 1;
      this.stableCount = 0;
      if (this.underrunCount >= 3) {
        this.targetBufferSeconds = Math.min(this.targetBufferSeconds + 0.02, 0.20);
        this.underrunCount = 0;
      }
    } else {
      this.stableCount += 1;
      if (this.stableCount >= 120) {
        this.targetBufferSeconds = Math.max(this.targetBufferSeconds - 0.01, 0.10);
        this.stableCount = 0;
      }
    }

    if (this.nextPlayTime < now + this.targetBufferSeconds) {
      this.nextPlayTime = now + this.targetBufferSeconds;
    }
    if (this.nextPlayTime > now + this.maxBufferSeconds) {
      this.nextPlayTime = now + this.targetBufferSeconds;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }
}

function Init() {
  if (!window.audioHandlerClient) {
    window.audioHandlerClient = new AudioHandlerClient();
  }
  window.audioHandlerClient.bindUI();
}

window.Init = Init;
