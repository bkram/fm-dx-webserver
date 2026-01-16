"use strict";
/*
    SSE audio codec streamer (replaces 3LAS server module)
*/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const checkFFmpeg = require('./checkFFmpeg');
const { logError, logWarn } = require('../console');
const { serverConfig } = require('../server_config');

const Settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'settings.json'), 'utf-8'));

let ffmpegPath = 'ffmpeg';
let ServerInstance;

let readyResolve;
const waitUntilReady = new Promise((resolve) => {
  readyResolve = resolve;
});

class StreamClient {
  constructor(server) {
    this.Server = server;
  }
  Destroy() {
  }
}

class StreamServer {
  constructor(channels, sampleRate) {
    this.Channels = channels;
    this.SampleRate = sampleRate;
    this.Clients = new Set();
    this.AudioCodecClients = {
      mp3: new Set(),
      opus: new Set()
    };
    this.AudioCodecProvider = {};
    if (Settings.AudioCodecUseMp3) {
      this.AudioCodecProvider.mp3 = AudioCodecProviderBase.Create(this, "mp3");
    }
    if (Settings.AudioCodecUseOpus) {
      this.AudioCodecProvider.opus = AudioCodecProviderBase.Create(this, "opus");
    }
    this.StdIn = process.stdin;
  }
  Run() {
    if (!this.StdIn) {
      logError('[Stream] No audio input stream defined (this.StdIn is null)');
      return;
    }
    this.StdIn.on('data', this.OnStdInData.bind(this));
    this.StdIn.resume();
  }
  OnStdInData(buffer) {
    for (let codec in this.AudioCodecProvider) {
      this.AudioCodecProvider[codec].InsertData(buffer);
    }
  }
  BroadcastBinary(codec, buffer) {
    const clients = this.AudioCodecClients[codec];
    if (!clients) return;
    clients.forEach((client) => {
      client.SendBinary(buffer);
    });
  }
  SetAudioCodec(client, codec) {
    if (!this.AudioCodecProvider[codec]) {
      this.DestroyClient(client);
      return;
    }
    this.AudioCodecClients[codec].add(client);
    this.AudioCodecProvider[codec].PrimeClient(client);
  }
  DestroyClient(client) {
    Object.keys(this.AudioCodecClients).forEach((key) => {
      this.AudioCodecClients[key].delete(client);
    });
    this.Clients.delete(client);
    if (typeof client.Destroy === 'function') {
      client.Destroy();
    }
  }
}

class AudioCodecProviderBase {
  constructor(server) {
    this.Server = server;
    this.Process = spawn(ffmpegPath, this.GetFFmpegArguments(), {
      shell: false,
      detached: false,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    this.Process.stdout.addListener('data', this.OnData.bind(this));
    this.Process.on('error', (err) => {
      logWarn(`[Stream] FFmpeg spawn failed: ${err.message}`);
    });
  }
  InsertData(buffer) {
    this.Process.stdin.write(buffer);
  }
  static Create(server, format) {
    if (format === "mp3") {
      return new AudioCodecProviderMp3(server);
    }
    if (format === "opus") {
      return new AudioCodecProviderOpus(server);
    }
    return null;
  }
}

class AudioCodecProviderMp3 extends AudioCodecProviderBase {
  GetFFmpegArguments() {
    return [
      "-fflags", "+nobuffer+flush_packets", "-flags", "low_delay", "-rtbufsize", "32", "-probesize", "32",
      "-f", "s16le",
      "-ar", Number(this.Server.SampleRate.toString()) + Number(serverConfig.audio.samplerateOffset),
      "-ac", this.Server.Channels.toString(),
      "-i", "pipe:0",
      "-c:a", "libmp3lame",
      "-b:a", serverConfig.audio.audioBitrate,
      "-ac", this.Server.Channels.toString(),
      "-reservoir", "0",
      "-f", "mp3", "-write_xing", "0", "-id3v2_version", "0",
      "-fflags", "+nobuffer", "-flush_packets", "1",
      "pipe:1"
    ];
  }
  OnData(chunk) {
    this.Server.BroadcastBinary("mp3", chunk);
  }
  PrimeClient(_) {
  }
}


class AudioCodecProviderOpus extends AudioCodecProviderBase {
  constructor(server) {
    super(server);
    this.HeaderBuffer = Buffer.alloc(0);
    this.HeaderBytes = null;
    this.HeaderComplete = false;
  }
  GetFFmpegArguments() {
    return [
      "-fflags", "+nobuffer+flush_packets", "-flags", "low_delay", "-rtbufsize", "32", "-probesize", "32",
      "-f", "s16le",
      "-ar", Number(this.Server.SampleRate.toString()) + Number(serverConfig.audio.samplerateOffset),
      "-ac", this.Server.Channels.toString(),
      "-i", "pipe:0",
      "-c:a", "libopus",
      "-b:a", serverConfig.audio.audioBitrate,
      "-application", "audio",
      "-f", "webm",
      "-cluster_time_limit", "100",
      "-cluster_size_limit", "200000",
      "-fflags", "+nobuffer", "-flush_packets", "1",
      "pipe:1"
    ];
  }
  FindClusterOffset(buffer) {
    for (let i = 0; i + 3 < buffer.length; i++) {
      if (buffer[i] === 0x1f && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xb6 && buffer[i + 3] === 0x75) {
        return i;
      }
    }
    return -1;
  }
  OnData(chunk) {
    if (!this.HeaderComplete) {
      this.HeaderBuffer = Buffer.concat([this.HeaderBuffer, chunk], this.HeaderBuffer.length + chunk.length);
      const clusterOffset = this.FindClusterOffset(this.HeaderBuffer);
      if (clusterOffset === -1) {
        return;
      }
      this.HeaderBytes = this.HeaderBuffer.slice(0, clusterOffset);
      this.HeaderComplete = true;
      this.Server.BroadcastBinary("opus", this.HeaderBytes);
      const remaining = this.HeaderBuffer.slice(clusterOffset);
      if (remaining.length) {
        this.Server.BroadcastBinary("opus", remaining);
      }
      this.HeaderBuffer = Buffer.alloc(0);
      return;
    }
    this.Server.BroadcastBinary("opus", chunk);
  }
  PrimeClient(client) {
    if (this.HeaderComplete && this.HeaderBytes) {
      client.SendBinary(this.HeaderBytes);
    }
  }
}

checkFFmpeg().then((resolvedPath) => {
  ffmpegPath = resolvedPath;
  const audioChannels = serverConfig.audio.audioChannels || 2;
  const Server = new StreamServer(audioChannels, 48000);
  ServerInstance = Server;
  readyResolve();
}).catch((err) => {
  logError('[Stream] Error:', err);
  readyResolve();
});

module.exports = {
  get Server() {
    return ServerInstance;
  },
  waitUntilReady
};
