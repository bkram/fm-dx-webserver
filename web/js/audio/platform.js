/*
    Minimal platform flags for UI logic
*/
var isAndroid;
var isIOS;
var isIPadOS;
{
    var ua = navigator.userAgent.toLowerCase();
    isAndroid = (ua.indexOf('android') !== -1);
    isIOS = (/iphone|ipod/.test(ua));
    isIPadOS = (ua.indexOf('ipad') !== -1) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
