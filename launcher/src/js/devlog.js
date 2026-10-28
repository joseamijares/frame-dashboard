/* Development log: shown in the Lab screen and, if configured, sent to `npm run devlog` on the Mac. */
(function () {
    'use strict';

    var lines = [];
    var listeners = [];

    function send(entry) {
        var url = window.LAUNCHER_CONFIG && window.LAUNCHER_CONFIG.devLogUrl;
        if (!url) return;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            // text/plain avoids a CORS preflight
            xhr.setRequestHeader('Content-Type', 'text/plain');
            xhr.send(JSON.stringify(entry));
        } catch (e) {
            // Logging must never break the launcher.
        }
    }

    function errorText(err) {
        if (!err) return String(err);
        return (err.name ? err.name + ': ' : '') + (err.message || String(err));
    }

    function log(message, data) {
        var entry = { t: new Date().toISOString(), message: message };
        if (data !== undefined) entry.data = data;
        lines.push(message);
        if (lines.length > 200) lines.shift();
        console.log('[launcher]', message, data === undefined ? '' : data);
        listeners.forEach(function (fn) { fn(message); });
        send(entry);
    }

    window.DevLog = {
        log: log,
        errorText: errorText,
        lines: function () { return lines.slice(); },
        onLine: function (fn) { listeners.push(fn); }
    };
})();
