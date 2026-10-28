/*
 * Lab-only: reports which platform APIs this TV actually exposes, and tries the ones that might
 * let the screen saver turn the panel off instead of drawing a black rectangle over it.
 *
 * It enumerates rather than assuming. Samsung's web API surface is split between the standard
 * `tizen.*` namespace and Samsung's own `webapis.*`, the documentation covers several firmware
 * generations at once, and forum answers about the Power API on TV contradict each other. Asking
 * the device is the only thing that settles it — the same reason the render probe exists.
 *
 * Deliberately no new privilege in config.xml. An unrecognised privilege can fail a package at
 * install time, and there is no point risking that before knowing whether the API is even there.
 *
 * Result on the reference Q70B (T-PTMDEUC-1720.7): there is no power API at all. `tizen` exposes
 * 57 namespaces and `power` is not one of them, and neither `webapis.power` nor
 * `webapis.appcommon` exists, so a web app cannot turn this panel off and no privilege would
 * change that. The screen saver fades to black instead, and the TV's own Eco Solution ▸ Auto
 * Power Off is the real power-off.
 *
 * The same run shows what a missing privilege actually looks like, for contrast: `productinfo`
 * does exist and every one of its methods threw SecurityError. An absent API gives you nothing
 * to be refused by.
 */
(function () {
    'use strict';

    var log = DevLog.log;

    // Native bindings do not always enumerate, so known names are probed by hand as well.
    var TIZEN_NAMES = ['power', 'application', 'systeminfo', 'tvwindow', 'tvinputdevice',
        'tvaudiocontrol', 'tvdisplaycontrol', 'tvchannel', 'tvinfo', 'productinfo', 'filesystem',
        'preference', 'time', 'websetting'];

    var WEBAPIS_NAMES = ['appcommon', 'productinfo', 'network', 'avplay', 'avinfo', 'tvinfo',
        'adinfo', 'sso', 'recognition', 'tvwindow', 'power', 'display'];

    function keysOf(obj) {
        var out = [];
        try {
            Object.keys(obj).forEach(function (k) { out.push(k); });
        } catch (e) {
            // Host objects may refuse enumeration entirely.
        }
        return out;
    }

    // Reports what a namespace holds, by enumeration and by probing names it may not enumerate.
    function describe(label, obj, names) {
        if (!obj) {
            log('  ' + label + ': absent');
            return;
        }
        var enumerated = keysOf(obj);
        var probed = [];
        names.forEach(function (n) {
            if (typeof obj[n] !== 'undefined' && enumerated.indexOf(n) < 0) probed.push(n);
        });
        log('  ' + label + ': ' + (enumerated.length ? enumerated.sort().join(', ') : '(enumerates nothing)'));
        if (probed.length) log('    also present but not enumerable: ' + probed.sort().join(', '));
    }

    function describeMembers(label, obj) {
        if (!obj) {
            // Stated outright rather than left to be inferred from the namespace listing: whether
            // this exists is the question the probe is here to answer.
            log('  ' + label + ': absent');
            return;
        }
        var members = keysOf(obj);
        var fns = members.filter(function (k) {
            try {
                return typeof obj[k] === 'function';
            } catch (e) {
                return false;
            }
        });
        log('  ' + label + ' members: ' + (members.length ? members.sort().join(', ') : '(none enumerable)'));
        if (fns.length) log('    callable: ' + fns.sort().join(', '));
    }

    function errText(e) {
        if (!e) return 'no error';
        return (e.name || 'Error') + ': ' + (e.message || String(e));
    }

    // Read-only calls only; nothing here changes the state of the TV.
    function probeApis() {
        log('--- platform probe start ---');

        if (typeof window.tizen === 'undefined') {
            log('  window.tizen is absent (browser preview, or the TV denied the APIs)');
        } else {
            describe('tizen', window.tizen, TIZEN_NAMES);
            describeMembers('tizen.power', window.tizen.power);
            if (window.tizen.power && typeof window.tizen.power.isScreenOn === 'function') {
                try {
                    log('  tizen.power.isScreenOn() -> ' + window.tizen.power.isScreenOn());
                } catch (e) {
                    log('  tizen.power.isScreenOn() threw ' + errText(e));
                }
            }
        }

        describe('webapis', window.webapis, WEBAPIS_NAMES);
        if (window.webapis) {
            describeMembers('webapis.appcommon', window.webapis.appcommon);
            describeMembers('webapis.power', window.webapis.power);
        }

        /*
         * Answers the 4K question from the device rather than from Samsung's spec tables: the
         * panel can be UHD while the application surface stays 1920x1080, which is what the
         * render probe reported.
         */
        var info = (window.webapis && window.webapis.productinfo) ||
            (window.tizen && window.tizen.productinfo);
        if (info) {
            [['isUdPanelSupported', 'UHD panel'], ['is8KPanelSupported', '8K panel'],
                ['getRealModel', 'model'], ['getFirmware', 'firmware'],
                ['getSmartTVServerVersion', 'server version']].forEach(function (pair) {
                if (typeof info[pair[0]] !== 'function') return;
                try {
                    log('  productinfo.' + pair[0] + '() -> ' + info[pair[0]]() + '  (' + pair[1] + ')');
                } catch (e) {
                    log('  productinfo.' + pair[0] + '() threw ' + errText(e));
                }
            });
        } else {
            log('  productinfo: absent');
        }

        log('--- platform probe end ---');
        UI.toast('Platform probe done — see the log');
    }

    /*
     * The only call here that changes anything. It is wrapped in a timer that puts the screen
     * back on, because an unattended TV that has gone dark with no way back is indistinguishable
     * from a crash — and because if this does work, the screen saver will want to use it.
     */
    var RECOVER_MS = 5000;

    function tryScreenOff() {
        var power = (window.tizen && window.tizen.power) || (window.webapis && window.webapis.power);
        if (!power) {
            log('Screen off: no power API on this TV (neither tizen.power nor webapis.power)');
            UI.toast('No power API on this TV');
            return;
        }
        if (typeof power.turnScreenOff !== 'function') {
            log('Screen off: power API present but has no turnScreenOff(); members above');
            UI.toast('No turnScreenOff() on this TV');
            return;
        }

        log('Screen off: calling turnScreenOff(), restoring in ' + (RECOVER_MS / 1000) + ' s');
        UI.toast('Turning the screen off for ' + (RECOVER_MS / 1000) + ' seconds…');

        // Queued before the call, so the screen comes back even if the call blocks or the page
        // stops running scripts while the panel is off.
        setTimeout(function () {
            try {
                if (typeof power.turnScreenOn === 'function') {
                    power.turnScreenOn();
                    log('Screen off: turnScreenOn() returned normally');
                } else {
                    log('Screen off: no turnScreenOn() to recover with — press a key on the remote');
                }
            } catch (e) {
                log('Screen off: turnScreenOn() threw ' + errText(e));
            }
        }, RECOVER_MS);

        try {
            power.turnScreenOff();
            log('Screen off: turnScreenOff() returned normally — watch whether the panel actually went off');
        } catch (e) {
            /*
             * SecurityError here is the useful outcome: the API exists and the call is understood,
             * so adding http://tizen.org/privilege/power to config.xml is worth the install risk.
             * NotSupportedError means the TV has the binding but not the capability.
             */
            log('Screen off: turnScreenOff() threw ' + errText(e));
        }
    }

    window.PlatformProbe = {
        actions: function () {
            return [
                { label: 'Platform probe: what APIs this TV exposes', run: probeApis },
                { label: 'Platform probe: try turning the screen off (recovers after 5 s)', run: tryScreenOff }
            ];
        }
    };
})();
