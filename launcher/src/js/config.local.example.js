/*
 * Copy this to js/config.local.js and put your own values in it. That file is gitignored, so
 * anything here stays out of the repository while still reaching both `npm run preview` and the
 * packaged .wgt — nothing to strip before a push, nothing to put back before a build.
 *
 * Keys are merged over js/config.js one level deep, so you can set weather.latitude without
 * restating the rest of the block. Arrays (apps, inputs) replace the default wholesale.
 */
window.LAUNCHER_LOCAL = {
    // Open-Meteo needs coordinates; two decimals is about a kilometre, which is finer than its grid.
    // weather: { latitude: 20, longitude: 2 },

    // Receives Lab logs; see scripts/devlog-server.mjs.
    // devLogUrl: null,

    // locale: 'fr-FR',
};
