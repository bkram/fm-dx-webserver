const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { configName, serverConfig, configUpdate, configSave, configExists } = require('../server_config');
const { logDebug, logError, logInfo, logWarn, logFfmpeg } = require('../console');

function enableAudioStream() {
    var ffmpegParams, ffmpegCommand;
    serverConfig.webserver.webserverPort = Number(serverConfig.webserver.webserverPort);

    const flags = `-fflags +nobuffer+flush_packets -flags low_delay -rtbufsize 6192 -probesize 32`;
    const codec = `-acodec pcm_s16le -ar 48000 -ac ${serverConfig.audio.audioChannels}`;
    const output = `-f s16le -fflags +nobuffer+flush_packets -packetsize 384 -flush_packets 1 -bufsize 960`;

    // Identify platform and set ffmpeg input params accordingly
    if (process.platform === 'win32') {
        // Windows
        logInfo('[Audio Stream] Platform: Windows (win32). Using "dshow" input.');
        ffmpegCommand = `"${ffmpeg.replace(/\\/g, '\\\\')}"`;
        ffmpegParams  = `${flags} -f dshow -audio_buffer_size 200 -i audio="${serverConfig.audio.audioDevice}" ` +
                        `${codec} ${output} pipe:1 | node server/stream/3las.server.js -port ` +
                        `${serverConfig.webserver.webserverPort + 10} -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;

    } else if (process.platform === 'darwin') {
        // macOS (Darwin)
        logInfo('[Audio Stream] Platform: macOS (darwin). Using "avfoundation" input.');
        ffmpegCommand = `"${ffmpeg.replace(/\\/g, '\\\\')}"`;

        // Check if the device name is numeric (i.e., an index) or a literal string
        let audioDevice = serverConfig.audio.audioDevice;
        if (!isNaN(audioDevice)) {
            // Numeric index => :3
            audioDevice = `:${audioDevice}`;
        } else {
            // Device name => :USB Audio CODEC  (trailing space if necessary)
            // Make sure to include a colon at the front
            audioDevice = `:${audioDevice}`;
        }

        // Quote the entire string if it has spaces or special characters
        ffmpegParams = `${flags} -f avfoundation -i "${audioDevice}" ${codec} ${output} pipe:1 | ` +
                       `node server/stream/3las.server.js -port ` +
                       `${serverConfig.webserver.webserverPort + 10} -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;
    } else {
        // Linux
        logInfo('[Audio Stream] Platform: Linux. Using "alsa" input.');
        ffmpegCommand = 'ffmpeg';
        ffmpegParams  = `${flags} -f alsa -i "${serverConfig.audio.softwareMode && serverConfig.audio.softwareMode === true ? 'plug' : ''}${serverConfig.audio.audioDevice}" ` +
                        `${codec} ${output} pipe:1 | node server/stream/3las.server.js -port ` +
                        `${serverConfig.webserver.webserverPort + 10} -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;
    }

    // Log the device name and which port is being used for the stream
    logInfo(`Trying to start audio stream on device: \x1b[35m${serverConfig.audio.audioDevice}\x1b[0m`);
    logInfo(`Using internal audio network port: ${serverConfig.webserver.webserverPort + 10}`);

    // Show the entire ffmpeg command if you want more debugging
    logDebug(`[Audio Stream] Full FFmpeg command:\n${ffmpegCommand} ${ffmpegParams}`);

    // If an audio device is configured, start the stream
    if (serverConfig.audio.audioDevice.length > 2) {
        let startupSuccess = false;
        const childProcess = spawn(ffmpegCommand, [ffmpegParams], { shell: true });

        childProcess.stdout.on('data', (data) => {
            logFfmpeg(`[ffmpeg:stdout] ${data}`);
        });

        childProcess.stderr.on('data', (data) => {
            logFfmpeg(`[ffmpeg:stderr] ${data}`);

            // Check for specific error messages or success indicators
            if (data.includes('I/O error')) {
                logError(`[Audio Stream] Audio device "${serverConfig.audio.audioDevice}" failed to start.`);
                logError('Please start the server with: node . --ffmpegdebug for more info.');
            }
            if (data.includes('size=') && !startupSuccess) {
                logInfo('[Audio Stream] Audio stream started up successfully.');
                startupSuccess = true;
            }
        });

        // Child process event listeners
        childProcess.on('close', (code) => {
            logFfmpeg(`[Audio Stream] Child process exited with code: ${code}`);
        });

        childProcess.on('error', (err) => {
            logFfmpeg(`[Audio Stream] Error starting child process: ${err}`);
        });
    } else {
        logWarn('[Audio Stream] No valid audio device configured. Skipping audio stream initialization.');
    }
}

if (configExists()) {
    enableAudioStream();
}
