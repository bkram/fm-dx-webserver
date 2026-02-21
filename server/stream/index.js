const { execSync } = require('child_process');
const { serverConfig } = require('../server_config');
const { logError, logInfo } = require('../console');
const checkFFmpeg = require('./checkFFmpeg');

const consoleLogTitle = '[Audio Stream]';

function checkAudioUtilities() {
    if (process.platform === 'darwin') {
        try {
            execSync('which sox');
        } catch (error) {
            logError(`${consoleLogTitle} Error: SoX ("sox") not found, Please install sox.`);
            process.exit(1);
        }
    } else if (process.platform === 'linux') {
        try {
            execSync('which arecord');
        } catch (error) {
            logError(`${consoleLogTitle} Error: ALSA ("arecord") not found. Please install ALSA utils.`);
            process.exit(1);
        }
    }
}

checkFFmpeg().then((ffmpegPath) => {
    if (!serverConfig.audio.ffmpeg) checkAudioUtilities();

    logInfo(`${consoleLogTitle} Using`, ffmpegPath === 'ffmpeg' ? 'system-installed FFmpeg' : 'ffmpeg-static');

    if (process.platform !== 'darwin') {
        logInfo(`${consoleLogTitle} Starting audio stream on device: \x1b[35m${serverConfig.audio.audioDevice}\x1b[0m`);
    } else {
        logInfo(`${consoleLogTitle} Starting audio stream on default input device.`);
    }
}).catch((err) => {
    logError(`${consoleLogTitle} Error: ${err.message}`);
});
