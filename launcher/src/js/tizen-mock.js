/*
 * Minimal fake of the Tizen APIs the launcher uses, for desktop-browser preview.
 * Does nothing when running on the TV.
 * The app ids below are illustrative; use "All apps" on the TV for real ones.
 */
(function () {
    'use strict';
    if (window.tizen) return;
    window.__TIZEN_MOCK__ = true;

    function app(id, name, show) {
        return { id: id, name: name, show: show !== false, iconPath: '', categories: [], packageId: id.split('.')[0] };
    }

    var apps = [
        app('FrmLnchr01.Launcher', 'Frame Launcher'),
        app('111299001912', 'YouTube'),
        app('org.tizen.netflix-app', 'Netflix'),
        app('3201601007230', 'HBO Max'),
        app('rJeHak5zRg.Spotify', 'Spotify - Music and Podcasts'),
        app('MCmYXNxgcu.DisneyPlus', 'Disney+'),
        app('org.tizen.primevideo', 'Prime Video'),
        app('FrmDashbd1.FrameDashboard', 'Frame Dashboard'),
        app('3201710015037', 'Apple TV'),
        app('org.tizen.browser', 'Internet'),
        // Noise that the consumer filter should hide
        app('com.samsung.tv.ep-dataservice-app', 'ep-dataservice-app'),
        app('adplatform.ADPlayer', 'ADPlayer'),
        app('com.samsung.tv.store', 'Apps'),
        app('25emanual3.emanual', 'e-Manual'),
        app('org.tizen.volume-setting', 'Volume', false)
    ];

    var sources = {
        connected: [{ type: 'TV', number: 1 }, { type: 'HDMI', number: 1 }],
        disconnected: [{ type: 'HDMI', number: 2 }, { type: 'HDMI', number: 3 }, { type: 'HDMI', number: 4 }]
    };
    var currentSource = sources.connected[0];

    function later(fn) { setTimeout(fn, 60); }

    window.tizen = {
        application: {
            getAppsInfo: function (ok) { later(function () { ok(apps.slice()); }); },
            launch: function (id, ok, err) {
                console.log('[mock] launch', id);
                later(ok);
            },
            getCurrentApplication: function () {
                return { appInfo: { id: 'FrmLnchr01.Launcher' }, exit: function () {}, hide: function () {} };
            }
        },
        systeminfo: {
            getPropertyValue: function (prop, ok, err) {
                if (prop !== 'VIDEOSOURCE') { later(function () { err({ name: 'NotSupportedError', message: prop }); }); return; }
                later(function () { ok(sources); });
            }
        },
        tvwindow: {
            setSource: function (src, ok) { console.log('[mock] setSource', src); currentSource = src; later(function () { ok(src); }); },
            getSource: function () { return currentSource; },
            show: function (ok) { console.log('[mock] tvwindow.show'); later(ok); },
            hide: function (ok) { console.log('[mock] tvwindow.hide'); later(ok); }
        },
        tvinputdevice: {
            registerKey: function () {},
            registerKeyBatch: function () {},
            unregisterKey: function () {},
            getSupportedKeys: function () { return []; }
        }
    };
})();
