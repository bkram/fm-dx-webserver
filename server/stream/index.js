const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { configName, serverConfig, configUpdate, configSave, configExists } = require('../server_config');
const { logDebug, logError, logInfo, logWarn, logFfmpeg } = require('../console');

function enableAudioStream() {
    serverConfig.webserver.webserverPort = Number(serverConfig.webserver.webserverPort);
    let command = '';
    let startupSuccess = false;

    if (process.platform === 'win32') {
        // Windows
        logInfo('[Audio Stream] Platform: Windows (win32). Using "dshow" input.');
        const ffmpegCommand = `"${ffmpeg.replace(/\\/g, '\\\\')}"`;
        const flags = `-fflags +nobuffer+flush_packets -flags low_delay -rtbufsize 6192 -probesize 32`;
        const codec = `-acodec pcm_s16le -ar 48000 -ac ${serverConfig.audio.audioChannels}`;
        const output = `-f s16le -fflags +nobuffer+flush_packets -packetsize 384 -flush_packets 1 -bufsize 960`;
        command = `${ffmpegCommand} ${flags} -f dshow -audio_buffer_size 200 -i audio="${serverConfig.audio.audioDevice}" ` +
            `${codec} ${output} pipe:1 | node server/stream/3las.server.js -port ` +
            `${serverConfig.webserver.webserverPort + 10} -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;
    } else if (process.platform === 'darwin') {
        // macOS
        // Use SoX's "rec" with the coreaudio driver.
        // Install `sox` with brew.
        // It would appear assigning a specific audio device does not work with Sox
        // Set up the correct audio device in the System preferences and
        // Use the Audio MIDI Setup app to select the correct input for your card
        logInfo('[Audio Stream] Platform: macOS (darwin). Using "rec" (SoX) input from default audio device.');
        const recCommand = `rec -t coreaudio -b 32 -r 48000 -c 2 -t raw -b 16 -r 48000 -c ${serverConfig.audio.audioChannels} -`;
        command = `${recCommand} | node server/stream/3las.server.js -port ${serverConfig.webserver.webserverPort + 10}` +
            ` -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;
    } else {
        // Linux
        logInfo('[Audio Stream] Platform: Linux. Using "alsa" input.');
        const flags = `-fflags +nobuffer+flush_packets -flags low_delay -rtbufsize 6192 -probesize 32`;
        const codec = `-acodec pcm_s16le -ar 48000 -ac ${serverConfig.audio.audioChannels}`;
        const output = `-f s16le -fflags +nobuffer+flush_packets -packetsize 384 -flush_packets 1 -bufsize 960`;
        command = `ffmpeg ${flags} -f alsa -i "${serverConfig.audio.softwareMode && serverConfig.audio.softwareMode === true ? 'plug' : ''}${serverConfig.audio.audioDevice}" ` +
            `${codec} ${output} pipe:1 | node server/stream/3las.server.js -port ` +
            `${serverConfig.webserver.webserverPort + 10} -samplerate 48000 -channels ${serverConfig.audio.audioChannels}`;
    }

    if ( process.platform != 'darwin') {
        logInfo(`Trying to start audio stream on device: \x1b[35m${serverConfig.audio.audioDevice}\x1b[0m`);
    }
    logInfo(`Using internal audio network port: ${serverConfig.webserver.webserverPort + 10}`);
    logDebug(`[Audio Stream] Full command:\n${command}`);

    // Only start the stream if an audio device is configured.
    if (serverConfig.audio.audioDevice && serverConfig.audio.audioDevice.length > 2) {
        const childProcess = spawn(command, { shell: true });

        childProcess.stdout.on('data', (data) => {
            logFfmpeg(`[stream:stdout] ${data}`);
        });

        childProcess.stderr.on('data', (data) => {
            logFfmpeg(`[stream:stderr] ${data}`);

            if (data.includes('I/O error')) {
                logError(`[Audio Stream] Audio device "${serverConfig.audio.audioDevice}" failed to start.`);
                logError('Please start the server with: node . --ffmpegdebug for more info.');
            }
            if (data.includes('size=') && !startupSuccess) {
                logInfo('[Audio Stream] Audio stream started up successfully.');
                startupSuccess = true;
            }
        });

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
