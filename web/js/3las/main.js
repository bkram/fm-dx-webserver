let Stream;
let shouldReconnect = true;
let newVolumeGlobal = 1;
let preferredAudioFormat = 'auto';

function Init(_ev) {
    $(".playbutton").off('click').on('click', OnPlayButtonClick);  // Ensure only one event handler is attached
    $("#volumeSlider").off("input").on("input", updateVolume);  // Ensure only one event handler is attached
    $(".audio-format-select").off("change").on("change", onAudioFormatChange);
}

function applyAudioFormatPreference(settings) {
    if (preferredAudioFormat === 'wav') {
        settings.Fallback.Formats = [
            { "Mime": "audio/wave", "Name": "wav" },
            { "Mime": "audio/mpeg", "Name": "mp3" }
        ];
    } else if (preferredAudioFormat === 'mp3') {
        settings.Fallback.Formats = [
            { "Mime": "audio/mpeg", "Name": "mp3" },
            { "Mime": "audio/wave", "Name": "wav" }
        ];
    }
}

function createStream() {
    try {
        const settings = new _3LAS_Settings();
        applyAudioFormatPreference(settings);
        Stream = new _3LAS(null, settings);
        Stream.Volume = $('#volumeSlider').val();
        Stream.ConnectivityCallback = OnConnectivityCallback;
    } catch (error) {
        console.error("Initialization Error: ", error);
    }
}

function destroyStream() {
    if (Stream) {
        Stream.Stop();
        Stream = null;
    }
}

function OnConnectivityCallback(isConnected) {
    console.log("Connectivity changed:", isConnected);
    if (Stream) {
        Stream.Volume = $('#volumeSlider').val();
    } else {
        console.warn("Stream is not initialized.");
    }
}


function OnPlayButtonClick(_ev) {
    const $playbutton = $('.playbutton');
    const isAppleiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (Stream) {
        console.log("Stopping stream...");
        shouldReconnect = false;
        destroyStream();
        $playbutton.find('.fa-solid').toggleClass('fa-stop fa-play');
        if (isAppleiOS && 'audioSession' in navigator) {
            navigator.audioSession.type = "none";
        }
    } else {
        console.log("Starting stream...");
        shouldReconnect = true;
        createStream();
        Stream.Start();
        $playbutton.find('.fa-solid').toggleClass('fa-play fa-stop');
        if (isAppleiOS && 'audioSession' in navigator) {
            navigator.audioSession.type = "playback";
        }
    }

    $playbutton.addClass('bg-gray').prop('disabled', true);
    setTimeout(() => {
        $playbutton.removeClass('bg-gray').prop('disabled', false);
    }, 3000);
}

function updateVolume() {
    if (Stream) {
        const newVolume = $(this).val();
        newVolumeGlobal = newVolume;
        console.log("Volume updated to:", newVolume);
        Stream.Volume = newVolume;
    } else {
        console.warn("Stream is not initialized.");
    }
}

function onAudioFormatChange() {
    const selectedFormat = $(this).val() || 'auto';
    preferredAudioFormat = selectedFormat;
    $(".audio-format-select").val(selectedFormat);
    console.log("Audio format preference:", selectedFormat);
    if (Stream) {
        shouldReconnect = true;
        destroyStream();
        createStream();
        Stream.Start();
    }
}

$(document).ready(Init);
