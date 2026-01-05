let Stream;
let shouldReconnect = true;
let newVolumeGlobal = 1;
let preferredAudioFormat = 'mp3';
const audioFormatSupport = window.audioFallbackFormats || { mp3: true, wav: true };

function Init(_ev) {
    $(".playbutton").off('click').on('click', OnPlayButtonClick);  // Ensure only one event handler is attached
    $("#volumeSlider").off("input").on("input", updateVolume);  // Ensure only one event handler is attached
    $(document).off('click', '.audio-format-dropdown .option', onAudioFormatOptionClick)
        .on('click', '.audio-format-dropdown .option', onAudioFormatOptionClick);
    syncAudioFormatSelects();
}

function getEnabledFormats() {
    const enabled = [];
    if (audioFormatSupport.wav) enabled.push('wav');
    if (audioFormatSupport.mp3) enabled.push('mp3');
    return enabled;
}

function normalizePreferredAudioFormat() {
    const enabled = getEnabledFormats();
    if (enabled.length === 0) {
        preferredAudioFormat = 'mp3';
        return;
    }
    if (!enabled.includes(preferredAudioFormat)) {
        preferredAudioFormat = enabled[0];
    }
}

function ensureOption($dropdown, value, enabled) {
    const existing = $dropdown.find(`.option[data-value="${value}"]`);
    if (enabled) {
        if (existing.length === 0) {
            const label = getAudioFormatLabel(value);
            $dropdown.find('ul.options').append(`<li class="option" tabindex="0" data-value="${value}">${label}</li>`);
        }
    } else {
        existing.remove();
    }
}

function getAudioFormatLabel(format) {
    switch (format) {
        case 'wav':
            return 'WAV';
        case 'mp3':
        default:
            return 'MP3';
    }
}

function syncAudioFormatSelects() {
    const enabled = getEnabledFormats();
    $(".audio-format-dropdown").each(function () {
        const $dropdown = $(this);
        ensureOption($dropdown, 'wav', audioFormatSupport.wav);
        ensureOption($dropdown, 'mp3', audioFormatSupport.mp3);
    });
    normalizePreferredAudioFormat();
    $(".audio-format-dropdown input")
        .val(getAudioFormatLabel(preferredAudioFormat))
        .attr('data-value', preferredAudioFormat);
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

function onAudioFormatOptionClick(event) {
    const selectedFormat = $(event.currentTarget).data('value') || 'auto';
    preferredAudioFormat = selectedFormat;
    normalizePreferredAudioFormat();
    $(".audio-format-dropdown input")
        .val(getAudioFormatLabel(preferredAudioFormat))
        .attr('data-value', preferredAudioFormat);
    console.log("Audio format preference:", preferredAudioFormat);
    if (Stream) {
        shouldReconnect = true;
        destroyStream();
        createStream();
        Stream.Start();
    }
}

$(document).ready(Init);
