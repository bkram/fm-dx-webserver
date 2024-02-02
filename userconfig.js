const webServerHost = '0.0.0.0'; // IP of the web server
const webServerPort = 8080; // web server port
const webServerName = "Noobish's Server"; // web server name (will be displayed in title, bookmarks...)

const audioDeviceName = "alsa_input.usb-Burr-Brown_from_TI_USB_Audio_CODEC-00.analog-stereo-input"; // Audio device name in your OS 
const audioPort = 8081;

const xdrdServerHost = '127.0.0.1'; // xdrd server IP (if it's running on the same machine, use 127.0.0.1)
const xdrdServerPort = 7373; // xdrd server port
const xdrdPassword = 'kaas'; // xdrd password (optional)

const qthLatitude = '52.0376'; // your latitude, useful for maps.fmdx.pl integration
const qthLongitude = '4.3213'; // your longitude, useful for maps.fmdx.pl integration

const verboseMode = true; // if true, console will display extra messages

// DO NOT MODIFY ANYTHING BELOW THIS LINE
module.exports = {
    webServerHost, webServerPort, webServerName, audioDeviceName, audioPort, xdrdServerHost, xdrdServerPort, xdrdPassword, qthLatitude, qthLongitude, verboseMode
};
