var audioPlayer = null;
var preferredAudioCodec = 'opus';
var audioCodecSupport = window.audioCodecFormats || { mp3: true, opus: false };
var codecMime = {
    mp3: 'audio/mpeg',
    opus: 'audio/webm; codecs=opus'
};

function isMseSupported(codec) {
    if (typeof MediaSource === 'undefined')
        return false;
    var mime = codecMime[codec];
    if (!mime)
        return false;
    return MediaSource.isTypeSupported(mime);
}

function getEnabledFormats() {
    var enabled = [];
    Object.keys(audioCodecSupport).forEach(function (codec) {
        if (audioCodecSupport[codec] && isMseSupported(codec)) {
            enabled.push(codec);
        }
    });
    return enabled;
}

function getAudioCodecLabel(codec) {
    switch (codec) {
        case 'opus':
            return 'OPUS';
        case 'mp3':
        default:
            return 'MP3';
    }
}

function normalizePreferredAudioCodec() {
    var enabled = getEnabledFormats();
    if (enabled.length === 0) {
        preferredAudioCodec = 'mp3';
        return;
    }
    if (!enabled.includes(preferredAudioCodec)) {
        preferredAudioCodec = enabled[0];
    }
}

function ensureOption($dropdown, value, enabled) {
    var existing = $dropdown.find(".option[data-value=\"" + value + "\"]");
    if (enabled) {
        if (existing.length === 0) {
            var label = getAudioCodecLabel(value);
            $dropdown.find('ul.options').append("<li class=\"option\" tabindex=\"0\" data-value=\"" + value + "\">" + label + "</li>");
        }
    }
    else {
        existing.remove();
    }
}

function syncAudioCodecDropdowns() {
    var enabled = getEnabledFormats();
    $(".audio-codec-dropdown").each(function () {
        var $dropdown = $(this);
        ensureOption($dropdown, 'mp3', audioCodecSupport.mp3 && isMseSupported('mp3'));
        ensureOption($dropdown, 'opus', audioCodecSupport.opus && isMseSupported('opus'));
    });
    normalizePreferredAudioCodec();
    $(".audio-codec-dropdown input")
        .val(getAudioCodecLabel(preferredAudioCodec))
        .attr('data-value', preferredAudioCodec);
    $(".audio-codec-dropdown").toggle(enabled.length > 1);
}

function createPlayer() {
    if (!isMseSupported(preferredAudioCodec)) {
        console.warn("Selected codec not supported by MSE:", preferredAudioCodec);
        return;
    }
    var mime = codecMime[preferredAudioCodec];
    console.log("Audio codec selected:", preferredAudioCodec, "(" + mime + ")");
    audioPlayer = new AudioSsePlayer(preferredAudioCodec, mime, console);
    audioPlayer.Volume = $('#volumeSlider').val();
    audioPlayer.Start();
}

function destroyPlayer() {
    if (audioPlayer) {
        audioPlayer.Reset();
        audioPlayer = null;
    }
}

function onPlayButtonClick() {
    var $playbutton = $('.playbutton');
    if (audioPlayer) {
        destroyPlayer();
        $playbutton.find('.fa-solid').toggleClass('fa-stop fa-play');
    }
    else {
        createPlayer();
        $playbutton.find('.fa-solid').toggleClass('fa-play fa-stop');
    }
    $playbutton.addClass('bg-gray').prop('disabled', true);
    setTimeout(function () {
        $playbutton.removeClass('bg-gray').prop('disabled', false);
    }, 3000);
}

function updateVolume() {
    if (audioPlayer) {
        var newVolume = $(this).val();
        audioPlayer.Volume = newVolume;
    }
}

function onAudioCodecOptionClick(event) {
    var selectedCodec = $(event.currentTarget).data('value') || 'mp3';
    preferredAudioCodec = selectedCodec;
    normalizePreferredAudioCodec();
    $(".audio-codec-dropdown input")
        .val(getAudioCodecLabel(preferredAudioCodec))
        .attr('data-value', preferredAudioCodec);
    console.log("Audio codec changed:", preferredAudioCodec);
    if (audioPlayer) {
        destroyPlayer();
        createPlayer();
        $('.playbutton').find('.fa-solid').removeClass('fa-play').addClass('fa-stop');
    }
}

function initAudioControls() {
    $(".playbutton").off('click').on('click', onPlayButtonClick);
    $("#volumeSlider").off("input").on("input", updateVolume);
    $(document).off('click', '.audio-codec-dropdown .option', onAudioCodecOptionClick)
        .on('click', '.audio-codec-dropdown .option', onAudioCodecOptionClick);
    syncAudioCodecDropdowns();
}

$(document).ready(initAudioControls);
