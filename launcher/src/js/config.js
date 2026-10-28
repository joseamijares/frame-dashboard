/*
 * Home screen content.
 *
 * apps: each entry picks the first installed app matching it:
 *   { id: 'org.tizen.netflix-app' }   exact app id (most reliable; see "All apps", the id of
 *                                     the focused app is shown at the bottom)
 *   { match: 'netflix' }              case-insensitive regex on id or name; with `id` too, it is
 *                                     the fallback when that id isn't installed
 *   label                             optional display name
 *   brand                             optional key from js/brands.js (otherwise guessed from the name)
 * Entries that match nothing are skipped.
 *
 * inputs: HDMI ports shown in the second row. Set `hdmi` to the port each device is plugged into.
 *
 * The ids below were read from the Frame (QN50LS03B) on 2026-10-27. If an app is reinstalled
 * under a new id, press Red (All apps): the id of the focused app is shown bottom right.
 */
window.LAUNCHER_CONFIG = {
    apps: [
        { id: '9Ur5IzDKqV.TizenYouTube', match: '^youtube$', label: 'YouTube', brand: 'youtube' },
        { id: 'org.tizen.netflix-app', match: '^netflix$', label: 'Netflix', brand: 'netflix' },
        { id: '5b8c3eb16b.BeamCTVDev', match: '^(hbo ?)?max$', label: 'HBO Max', brand: 'hbomax' },
        { id: 'rJeHak5zRg.Spotify', match: '^spotify', label: 'Spotify', brand: 'spotify' },
        { id: 'MCmYXNxgcu.DisneyPlus', match: '^disney', label: 'Disney+', brand: 'disneyplus' },
        { id: 'org.tizen.primevideo', match: '^prime ?video', label: 'Prime Video', brand: 'primevideo' },
        // The dashboard in this repo (tizen/config.xml)
        { id: 'FrmDashbd1.FrameDashboard', label: 'Dashboard', brand: 'frame' }
    ],

    inputs: [
        { hdmi: 1, label: 'HDMI 1', brand: 'hdmi' }
    ],

    // How an input tile switches the TV. See README "HDMI inputs".
    //   'switch+viewer'  set the TV source, then open Samsung's TV viewer (default)
    //   'switch'         only set the TV source
    //   'inapp'          show the input full screen inside the launcher (Back returns)
    inputMethod: 'switch+viewer',

    locale: 'es-MX',

    theme: {
        // Starting painting (key from js/wallpapers.js, made by scripts/paintings.mjs), or null
        // for the plain salon wall. `rotate` hangs the next painting on that interval (a key from
        // Wallpaper.INTERVALS; '1d' = a painting of the day), or null to keep this one.
        // Changed from Settings → Background; the TV remembers the choice.
        wallpaper: 'hokusai-the-great-wave-off-kanagawa',
        rotate: '1d'
    },

    /*
     * Weather shown in the screen saver's corner, from Open-Meteo. No API key and nothing to
     * keep secret, so this is the whole setup: put your own coordinates here (two decimals is
     * plenty, and is also about as precise as you want a public request to be). Leave them null
     * and the widget never appears.
     *
     * There is no Settings page for this on purpose — the TV does not move, and coordinates are
     * not something you type with a remote.
     */
    weather: {
        latitude: null,
        longitude: null,
        unit: 'celsius'         // 'celsius' | 'fahrenheit'
    },

    /*
     * EXPERIMENTAL navigation sound. Synthesised, so there is no audio file. `move` plays when
     * focus changes, `edge` when it cannot (the end of a row). Tune by ear in the browser
     * preview; `volume` is 0–1 and sits on top of the TV's own volume.
     *
     * Whether this is worth keeping depends on the TV's audio latency: run
     * "Sound: report audio latency" in the Lab screen. Set enabled to false to silence it.
     */
    sound: {
        enabled: true,
        preset: 'soft',
        volume: 0.08,
        minGapMs: 45,
        presets: {
            soft: { label: 'Soft', freq: 620, ms: 30, type: 'sine' },
            warm: { label: 'Warm', freq: 520, ms: 44, type: 'triangle' },
            bright: { label: 'Bright', freq: 1040, ms: 30, type: 'triangle' }
        },
        move: { freq: 880, ms: 38, type: 'triangle' },
        edge: { freq: 200, ms: 70, type: 'sine' },
        select: { freq: 1320, ms: 55, type: 'triangle' }
    },

    // Development only: where the Lab screen sends its logs (npm run devlog on your computer).
    // null disables it; set it to http://<your-computer-ip>:8099/log while debugging.
    devLogUrl: null
};

/*
 * Local overrides from js/config.local.js, which is gitignored and loaded just before this file.
 * That is where values specific to one TV belong — coordinates, a devlog address — so this file
 * can stay in the repository with nulls in it. Nothing to strip before a push, nothing to put
 * back before a build, and the overlay reaches the browser preview and the .wgt alike.
 *
 * Merged one level deep, so a local file can set weather.latitude without restating the rest of
 * the block. Arrays (apps, inputs) and plain values replace the default outright.
 */
(function () {
    'use strict';

    var local = window.LAUNCHER_LOCAL;
    if (!local) return;

    function plainObject(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    Object.keys(local).forEach(function (key) {
        if (plainObject(local[key]) && plainObject(window.LAUNCHER_CONFIG[key])) {
            Object.keys(local[key]).forEach(function (inner) {
                window.LAUNCHER_CONFIG[key][inner] = local[key][inner];
            });
        } else {
            window.LAUNCHER_CONFIG[key] = local[key];
        }
    });
})();
