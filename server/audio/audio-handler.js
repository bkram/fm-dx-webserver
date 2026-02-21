// audioHandler - Custom Audio Handler for FM-DX Webserver
// Replaces 3LAS with a simpler, more reliable audio streaming solution
// Eliminates audio artifacts and improves performance

const { spawn, spawnSync } = require('child_process');
const { logDebug, logError, logInfo, logWarn, logFfmpeg } = require('../console');
const { serverConfig } = require('../server_config');

class audioHandler {
    constructor() {
        this.sampleRate = 48000;  // Consistent sample rate across all platforms
        this.bufferSize = 1024;   // Fixed buffer size for predictable latency
        this.channels = Number(serverConfig.audio.audioChannels) || 2;
        this.platform = process.platform;
        this.packetSequence = 0;
        this.lastTimestamp = Date.now();
        this.clients = new Set();
        this.audioProcess = null;
        this.isReady = false;
        this.restartTimer = null;
        this.restartDelayMs = 2000;
        this.maxRestartDelayMs = 15000;
        this.packetDurationMs = 20;
        this.framesPerPacket = Math.floor((this.sampleRate * this.packetDurationMs) / 1000);
        this.packetBytes = this.framesPerPacket * this.channels * 2;
        this.pendingAudioBuffer = Buffer.alloc(0);
        const self = this;
        this.readyPromise = new Promise(function(resolve) {
            self.readyResolve = resolve;
        });
    }

    // Initialize the audio handler
    async initialize() {
        logInfo('[audioHandler] Initializing custom audio handler...');
        
        try {
            // Check for required audio utilities
            await this.checkAudioUtilities();
            
            // Start audio capture process
            await this.startAudioCapture();
            
            // Set up audio streaming (no additional setup needed)
            this.isReady = true;
            this.readyResolve();
            logInfo('[audioHandler] Custom audio handler initialized successfully');
            
        } catch (error) {
            logError(`[audioHandler] Failed to initialize: ${error.message}`);
            throw error;
        }
    }

    // Check for required audio utilities
    async checkAudioUtilities() {
        if (this.platform === 'darwin') {
            if (serverConfig.audio.ffmpeg) {
                try {
                    await this.checkFFmpeg();
                } catch (error) {
                    logError('[audioHandler] FFmpeg not found on macOS. Please install FFmpeg.');
                    throw error;
                }
            } else {
                try {
                    await this.checkSox();
                } catch (error) {
                    logError('[audioHandler] SoX not found on macOS. Please install sox.');
                    throw error;
                }
            }
        } else if (this.platform === 'linux') {
            try {
                // Check for ALSA utilities on Linux
                await this.checkALSA();
            } catch (error) {
                logError('[audioHandler] ALSA utilities not found on Linux. Please install ALSA utils.');
                throw error;
            }
        }
    }

    async checkSox() {
        return new Promise(function(resolve, reject) {
            const soxCheck = spawn('which', ['sox']);
            soxCheck.on('close', function(code) {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error('SoX not found'));
                }
            });
        });
    }

    // Check for FFmpeg availability
    async checkFFmpeg() {
        return new Promise(function(resolve, reject) {
            const { spawn } = require('child_process');
            const ffmpegCheck = spawn('ffmpeg', ['-version']);
            
        ffmpegCheck.on('error', function(error) {
            reject(new Error('FFmpeg not found'));
        });
            
        ffmpegCheck.on('close', function(code) {
            if (code === 0) {
                resolve(true);
            } else {
                reject(new Error('FFmpeg check failed'));
            }
        });
        });
    }

    // Check for ALSA utilities
    async checkALSA() {
        return new Promise(function(resolve, reject) {
            const { spawn } = require('child_process');
            const alsaCheck = spawn('which', ['arecord']);
            
            alsaCheck.on('close', function(code) {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error('ALSA utilities not found'));
                }
            });
        });
    }

    // Start audio capture process
    async startAudioCapture() {
        if (this.audioProcess) {
            return;
        }

        const { command, args } = this.getCaptureCommand();
        this.captureCommand = command;
        const self = this;

        logDebug(`[audioHandler] Starting audio capture: ${command} ${args.join(' ')}`);

        this.audioProcess = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.restartDelayMs = 2000;
        
        // Handle audio data from capture process
        this.audioProcess.stdout.on('data', function(data) {
            this.handleAudioData(data);
        }.bind(this));
        
        // Handle capture-process errors
        this.audioProcess.stderr.on('data', function(data) {
            logFfmpeg(`[audioHandler ${self.captureCommand} stderr]: ${data}`);
        });
        
        // Handle capture-process exit
        this.audioProcess.on('exit', function(code, signal) {
            self.audioProcess = null;
            if (code !== 0) {
                logWarn(`[audioHandler] ${self.captureCommand} exited with code ${code}`);
                self.scheduleRestart();
            }
        });
        
        // Handle capture-process spawn errors
        this.audioProcess.on('error', function(error) {
            logError(`[audioHandler] ${self.captureCommand} process error: ${error.message}`);
            self.audioProcess = null;
            self.scheduleRestart();
        });
    }

    scheduleRestart() {
        if (this.restartTimer) {
            return;
        }

        const delay = this.restartDelayMs;
        this.restartDelayMs = Math.min(this.restartDelayMs * 2, this.maxRestartDelayMs);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.startAudioCapture();
        }, delay);
    }

    // Get platform-specific FFmpeg arguments
    getCaptureCommand() {
        const audioChannels = serverConfig.audio.audioChannels || 2;
        const audioDevice = serverConfig.audio.audioDevice;
        const audioBoost = serverConfig.audio.audioBoost;

        const outputArgs = [
            '-acodec', 'pcm_s16le',
            '-ar', String(this.sampleRate),
            '-ac', String(audioChannels),
            '-f', 's16le',
            'pipe:1'
        ];

        if (audioBoost) {
            outputArgs.unshift('volume=1.7');
            outputArgs.unshift('-af');
        }

        switch (this.platform) {
            case 'win32':
                logInfo('[audioHandler] Platform: Windows (win32). Using "dshow" input.');
                return {
                    command: 'ffmpeg',
                    args: [
                        '-fflags', 'nobuffer',
                        '-flags', 'low_delay',
                        '-rtbufsize', '64M',
                        '-probesize', '32',
                        '-analyzeduration', '0',
                        '-f', 'dshow',
                        '-audio_buffer_size', '200',
                        '-i', `audio=${audioDevice || 'Stereo Mix'}`,
                        ...outputArgs
                    ]
                };
            
            case 'darwin':
                if (serverConfig.audio.ffmpeg) {
                    logInfo('[audioHandler] Platform: macOS (darwin). Using "avfoundation" direct input.');
                    const macInput = this.resolveMacInput(audioDevice);
                    return {
                        command: 'ffmpeg',
                        args: [
                            '-flags', 'low_delay',
                            '-thread_queue_size', '1024',
                            '-probesize', '32',
                            '-analyzeduration', '0',
                            '-f', 'avfoundation',
                            '-i', macInput,
                            ...outputArgs
                        ]
                    };
                }

                logInfo('[audioHandler] Platform: macOS (darwin). Using "sox coreaudio" input.');
                const soxDevice = this.resolveMacSoxInput(audioDevice);
                const soxArgs = [
                    '-q',
                    '-t', 'coreaudio', soxDevice,
                    '-b', '16',
                    '-e', 'signed-integer',
                    '-r', String(this.sampleRate),
                    '-c', String(audioChannels),
                    '-t', 'raw',
                    '-'
                ];
                if (audioBoost) {
                    soxArgs.push('vol', '1.7');
                }
                return {
                    command: 'sox',
                    args: soxArgs
                };
            
            case 'linux':
                logInfo('[audioHandler] Platform: Linux. Using "alsa" input.');
                return {
                    command: 'ffmpeg',
                    args: [
                        '-fflags', 'nobuffer',
                        '-flags', 'low_delay',
                        '-probesize', '32',
                        '-analyzeduration', '0',
                        '-f', 'alsa',
                        '-i', audioDevice || 'default',
                        ...outputArgs
                    ]
                };
            
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }

    resolveMacInput(audioDevice) {
        if (!audioDevice || typeof audioDevice !== 'string') {
            return ':0';
        }
        const trimmed = audioDevice.trim();
        if (!trimmed) {
            return ':0';
        }
        if (/^:\d+$/.test(trimmed)) {
            return trimmed;
        }
        if (/^\d+$/.test(trimmed)) {
            return `:${trimmed}`;
        }
        return ':0';
    }

    resolveMacSoxInput(audioDevice) {
        if (!audioDevice || typeof audioDevice !== 'string') {
            return 'default';
        }

        const trimmed = audioDevice.trim();
        if (!trimmed) {
            return 'default';
        }

        if (/^:\d+$/.test(trimmed)) {
            const idx = Number(trimmed.slice(1));
            const name = this.lookupMacAudioDeviceNameByIndex(idx);
            return name || 'default';
        }

        if (/^\d+$/.test(trimmed)) {
            const idx = Number(trimmed);
            const name = this.lookupMacAudioDeviceNameByIndex(idx);
            return name || 'default';
        }

        return trimmed;
    }

    lookupMacAudioDeviceNameByIndex(idx) {
        const probe = spawnSync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { encoding: 'utf8' });
        const output = `${probe.stderr || ''}\n${probe.stdout || ''}`;
        const lines = output.split('\n');

        let inAudioSection = false;

        for (const line of lines) {
            if (line.includes('AVFoundation audio devices:')) {
                inAudioSection = true;
                continue;
            }
            if (line.includes('AVFoundation video devices:')) {
                inAudioSection = false;
                continue;
            }
            if (!inAudioSection) {
                continue;
            }

            const m = line.match(/\[(\d+)\]\s+(.+)$/);
            if (!m) {
                continue;
            }
            const foundIdx = Number(m[1]);
            const name = m[2].trim();
            if (foundIdx === idx) {
                return name;
            }
        }

        logWarn(`[audioHandler] Could not map macOS device index ${idx} to a name for SoX; using default input.`);
        return null;
    }

    // Handle audio data from FFmpeg
    handleAudioData(data) {
        if (!this.isReady) return;

        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.pendingAudioBuffer = Buffer.concat([this.pendingAudioBuffer, chunk]);

        while (this.pendingAudioBuffer.length >= this.packetBytes) {
            const packetData = this.pendingAudioBuffer.subarray(0, this.packetBytes);
            this.pendingAudioBuffer = this.pendingAudioBuffer.subarray(this.packetBytes);
            const packet = this.createAudioPacket(packetData);
            this.broadcastPacket(packet);
        }
    }

    // Create audio packet with sequence and timestamp
    createAudioPacket(audioData) {
        const packet = {
            sequence: this.packetSequence++,
            timestamp: Date.now(),
            sampleRate: this.sampleRate,
            channels: this.channels,
            data: audioData
        };
        return packet;
    }

    // Broadcast packet to all connected clients
    broadcastPacket(packet) {
        const binaryPacket = this.serializePacket(packet);
        this.clients.forEach(function(client) {
            try {
                client.send(binaryPacket, { binary: true });
            } catch (error) {
                logError(`[audioHandler] Failed to send packet to client: ${error.message}`);
            }
        });
    }

    // Serialize packet to binary format
    serializePacket(packet) {
        // Custom binary protocol for efficiency
        const header = new ArrayBuffer(16);
        const view = new DataView(header);
        
        view.setUint32(0, packet.sequence, true);
        view.setFloat64(4, packet.timestamp, true);
        view.setUint16(12, packet.sampleRate, true);
        view.setUint8(14, packet.channels);
        
        const audioBuffer = packet.data;
        const totalLength = header.byteLength + audioBuffer.length;
        
        const finalBuffer = new Uint8Array(totalLength);
        finalBuffer.set(new Uint8Array(header));
        finalBuffer.set(new Uint8Array(audioBuffer), header.byteLength);
        
        return finalBuffer.buffer;
    }

    // Add WebSocket client
    addClient(client) {
        this.clients.add(client);
        logDebug(`[audioHandler] Client connected. Total clients: ${this.clients.size}`);
        
        // Clean up when client disconnects
        client.on('close', function() {
            this.clients.delete(client);
        }.bind(this));
        
        // Handle client errors
        client.on('error', function(error) {
            logError(`[audioHandler] Client error: ${error.message}`);
        });
    }

    // Get ready promise
    getReadyPromise() {
        return this.readyPromise;
    }

    // Stop the audio handler
    async stop() {
        logInfo('[audioHandler] Stopping audio handler...');
        
        if (this.audioProcess) {
            this.audioProcess.kill('SIGINT');
            this.audioProcess = null;
        }

        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        
        this.clients.clear();
        this.isReady = false;
        this.pendingAudioBuffer = Buffer.alloc(0);
        
        logInfo('[audioHandler] Audio handler stopped');
    }

    // Get status information
    getStatus() {
        return {
            ready: this.isReady,
            clients: this.clients.size,
            platform: this.platform,
            sampleRate: this.sampleRate,
            bufferSize: this.bufferSize,
            channels: this.channels
        };
    }
}

// Export the audioHandler class
module.exports = audioHandler;
