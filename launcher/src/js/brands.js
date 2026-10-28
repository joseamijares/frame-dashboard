/*
 * Brand marks per app. `match` is tested against "<name> <id>" of an installed app.
 * `mark` is a file in img/marks/; the build prints it in ink (img/tiles/<key>.svg).
 * `text` instead of `mark` draws a typographic logo (for brands without an available mark).
 * `pad` optionally overrides the mark's [vertical, horizontal] inset in % of the tile (default [26, 22]).
 *
 * Every tile is the same bone label card with the mark printed in ink, like the placard on the
 * dashboard's day screen, so the row reads as one set rather than a strip of brand colours.
 * The card colour lives in style.css (--card); TILE_INK must match --card-ink there.
 */
window.TILE_INK = '#1e1a14';

window.BRANDS = [
    { key: 'youtube', match: /youtube|tizentube|cobalt-yt/i, mark: 'youtube' },
    { key: 'netflix', match: /netflix/i, mark: 'netflix' },
    { key: 'primevideo', match: /prime ?video/i, mark: 'primevideo', pad: [14, 12] },
    { key: 'disneyplus', match: /disney/i, mark: 'disneyplus', pad: [20, 20] },
    { key: 'appletv', match: /apple ?tv|aria-video/i, mark: 'appletv' },
    { key: 'spotify', match: /spotify/i, mark: 'spotify' },
    { key: 'movistar', match: /movistar/i, mark: 'movistar' },
    { key: 'hbomax', match: /\bhbo\b/i, text: 'HBO Max' },
    { key: 'max', match: /(^|\s)max(\s|$)/i, mark: 'max' },
    { key: 'dazn', match: /dazn/i, mark: 'dazn' },
    { key: 'plex', match: /plex/i, mark: 'plex' },
    { key: 'twitch', match: /twitch/i, mark: 'twitch' },
    { key: 'tf1', match: /tf1/i, text: 'TF1+' },
    { key: 'crunchyroll', match: /crunchyroll/i, mark: 'crunchyroll' },

    // This repo's own dashboard app (tizen/config.xml)
    { key: 'frame', match: /frame ?dashboard|FrmDashbd1/i, mark: 'frame' },

    // Inputs (used by inputs in config.js)
    { key: 'hdmi', mark: 'hdmi' },
    { key: 'playstation', mark: 'playstation' },
    { key: 'xbox', mark: 'xbox' },
    { key: 'switch', mark: 'nintendoswitch' }
];

window.findBrand = function (keyOrApp) {
    if (typeof keyOrApp === 'string') {
        return window.BRANDS.find(function (b) { return b.key === keyOrApp; }) || null;
    }
    var text = (keyOrApp.name || '') + ' ' + (keyOrApp.id || '');
    return window.BRANDS.find(function (b) { return b.match && b.match.test(text); }) || null;
};
