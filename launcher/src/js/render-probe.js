/*
 * Render probe: measures what this TV's compositor can actually afford.
 *
 * The performance rules in css/style.css (no blur, filters or blurred shadows) were written
 * defensively, without a measurement. These probes replace that guess with numbers.
 *
 * Each probe builds a full-screen stage, walks a focus ring along a row of tiles the way Home
 * does, and records requestAnimationFrame deltas. Moving the ring invalidates two tiles per
 * frame, so the cost of whatever those tiles carry (a blurred shadow, a gradient behind them)
 * shows up in the frame times. Results go to the log, and to the Mac if devLogUrl is set.
 *
 * Lab screen only; nothing here runs during normal use.
 */
(function () {
    'use strict';

    var FRAMES = 90;    // frames recorded per probe
    var WARMUP = 12;    // leading frames discarded while the compositor settles
    var TILES = 8;      // same as a full apps row

    // Filled in by the baseline probe; 60 Hz until we know better.
    var frameBudget = 1000 / 60;

    function log(message, data) {
        DevLog.log(message, data);
    }

    // ---------- stage

    function buildStage(opts) {
        var host = document.createElement('div');
        host.className = 'probe-stage';

        if (opts.gradients) {
            for (var g = 0; g < 3; g++) {
                var glow = document.createElement('div');
                glow.className = 'probe-glow probe-glow-' + g;
                host.appendChild(glow);
            }
        }

        var row = document.createElement('div');
        row.className = 'probe-row';
        var tiles = [];
        for (var i = 0; i < TILES; i++) {
            var tile = document.createElement('div');
            tile.className = 'probe-tile' + (opts.shadows ? ' probe-shadow' : '');
            row.appendChild(tile);
            tiles.push(tile);
        }
        host.appendChild(row);
        document.body.appendChild(host);

        /*
         * Self-check. The first version of this file sized the stage with `inset: 0`, which this
         * engine does not support, so the stage had no dimensions and the probes timed a page
         * with nothing to repaint. Measuring the stage is how that stops being a silent failure.
         */
        var w = host.offsetWidth;
        var h = host.offsetHeight;
        var glowArea = 0;
        var glows = host.getElementsByClassName('probe-glow');
        for (var k = 0; k < glows.length; k++) {
            glowArea += glows[k].offsetWidth * glows[k].offsetHeight;
        }
        var ok = w >= window.innerWidth && h >= window.innerHeight &&
            tiles[0].offsetWidth > 0 &&
            (!opts.gradients || glowArea > 0);
        if (!ok) {
            log('  stage check FAILED: ' + w + 'x' + h + ', tile ' + tiles[0].offsetWidth +
                'px, glow area ' + glowArea + ' — measurement below is meaningless');
        }

        return { host: host, tiles: tiles, ok: ok, size: w + 'x' + h, glowArea: glowArea };
    }

    function destroyStage(s) {
        if (s && s.host && s.host.parentNode) s.host.parentNode.removeChild(s.host);
    }

    // ---------- measuring

    function percentile(sorted, p) {
        if (!sorted.length) return 0;
        var i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
        return sorted[i];
    }

    function summarise(deltas, elapsed) {
        var sorted = deltas.slice().sort(function (a, b) { return a - b; });
        var dropped = 0;
        for (var i = 0; i < deltas.length; i++) {
            // A frame that took more than 1.5 budgets means at least one was missed.
            if (deltas[i] > frameBudget * 1.5) dropped++;
        }
        var round = function (n) { return Math.round(n * 10) / 10; };
        var median = percentile(sorted, 0.5);

        /*
         * Frames per second of wall-clock time. Intervals alone are not enough: this engine
         * (Chromium 85) stops throttling requestAnimationFrame to vsync when a frame runs long
         * and then fires callbacks back to back, which reads as absurdly fast intervals. Counting
         * frames against the clock cannot be fooled that way.
         */
        var fps = elapsed > 0 ? (deltas.length / (elapsed / 1000)) : 0;

        /*
         * Only a median *below* the refresh period invalidates the intervals: that means frames
         * were being batched rather than presented, so they describe nothing. A median far above
         * it is not an error — it is a slow renderer, which is exactly what we came to measure.
         */
        var locked = median > frameBudget * 0.6;

        return {
            frames: deltas.length,
            median: round(median),
            p95: round(percentile(sorted, 0.95)),
            worst: round(sorted[sorted.length - 1] || 0),
            dropped: dropped,
            fps: round(fps),
            locked: locked
        };
    }

    /*
     * Runs `paint(frame)` once per animation frame and records the intervals between them.
     * paint() must mutate the stage, or the browser has nothing to redraw and we would be
     * timing an idle loop rather than the compositor.
     */
    function record(paint, done) {
        var deltas = [];
        var frame = 0;
        var last = 0;
        /*
         * Wall clock, read with Date.now() rather than taken from the timestamp the engine
         * passes in. When rAF stops tracking vsync both that timestamp and the intervals derived
         * from it are wrong together, so measuring elapsed time from them would be fooled in
         * exactly the same way. Date.now() is the one number here the engine cannot distort.
         */
        var wallStart = 0;

        function step(now) {
            if (frame === WARMUP) wallStart = Date.now();
            if (last && frame > WARMUP) deltas.push(now - last);
            last = now;

            if (frame >= FRAMES + WARMUP) {
                done(summarise(deltas, Date.now() - wallStart));
                return;
            }
            paint(frame);
            frame++;
            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    // Walks the focus ring along the row, one tile per frame, wrapping at the end.
    function focusWalker(tiles) {
        var previous = null;
        return function (frame) {
            var tile = tiles[frame % tiles.length];
            if (previous) previous.className = previous.className.replace(' probe-focus', '');
            tile.className += ' probe-focus';
            previous = tile;
        };
    }

    function runStageProbe(name, opts, done) {
        var s = buildStage(opts);
        // One frame of grace so the stage is composited before we start timing.
        requestAnimationFrame(function () {
            record(focusWalker(s.tiles), function (result) {
                var ok = s.ok;
                destroyStage(s);
                result.stageOk = ok;
                log(name + ': ' + result.fps + ' fps, median ' + result.median +
                    'ms, p95 ' + result.p95 + 'ms, worst ' + result.worst + 'ms, ' +
                    result.dropped + ' dropped' + (result.locked ? '' : '  [NOT FRAME-LOCKED]'),
                    result);
                if (!result.locked) {
                    /*
                     * Above the refresh rate means the engine was not presenting frames at all,
                     * so there was nothing to measure. Below it means real, severe slowness.
                     */
                    log('  ^ ' + (result.fps > 1000 / frameBudget * 1.2
                        ? 'faster than the panel refreshes: the compositor was not presenting ' +
                          'frames, so this is a render-path failure rather than a speed'
                        : 'intervals unreliable; read the fps figure, not the median'));
                }
                if (done) done(result);
            });
        });
    }

    // ---------- probes

    function probeBaseline(done) {
        var s = buildStage({});
        requestAnimationFrame(function () {
            record(focusWalker(s.tiles), function (result) {
                destroyStage(s);
                // The median interval of a plain repaint is this panel's refresh period.
                if (result.median > 4 && result.median < 60) frameBudget = result.median;
                log('Baseline (no shadows): ' + result.fps + ' fps, median ' + result.median +
                    'ms, p95 ' + result.p95 + 'ms, worst ' + result.worst + 'ms  →  treating ' +
                    (Math.round(1000 / frameBudget)) + ' Hz as the target', result);
                if (done) done(result);
            });
        });
    }

    function probeShadows(done) {
        runStageProbe('Blurred shadows (8 tiles, 0 40px 100px)', { shadows: true }, done);
    }

    function probeGradients(done) {
        runStageProbe('Large radial gradients (3 layers)', { gradients: true }, done);
    }

    function probeBoth(done) {
        runStageProbe('Shadows + gradients together', { shadows: true, gradients: true }, done);
    }

    // ---------- environment

    var FEATURES = [
        ['display: grid', 'grid'],
        ['gap: 1px', 'flex/grid gap'],
        ['position: sticky', 'sticky'],
        ['aspect-ratio: 1', 'aspect-ratio'],
        ['inset: 0', 'inset'],
        ['overflow: clip', 'overflow: clip'],
        ['translate: 1px', 'individual transforms'],
        ['width: clamp(1px, 2px, 3px)', 'clamp()'],
        ['color: color-mix(in srgb, red, blue)', 'color-mix()'],
        ['filter: blur(1px)', 'filter: blur'],
        ['backdrop-filter: blur(1px)', 'backdrop-filter'],
        ['container-type: inline-size', 'container queries']
    ];

    function probeEnvironment() {
        var ua = navigator.userAgent || '(none)';
        log('User agent: ' + ua);

        /*
         * Samsung's TV agent has no "Chrome/" token; it reports the Chromium version bare,
         * e.g. "... 85.0.4183.93/6.5 TV Safari/537.36". Try the desktop form, then that one.
         */
        var chrome = /Chrome\/(\d+)/.exec(ua) || /\b(\d{2,3})\.\d+\.\d{3,}\.\d+/.exec(ua);
        var tizen = /Tizen ?([\d.]+)/.exec(ua);
        log('Engine: Chromium ' + (chrome ? chrome[1] : 'unknown') +
            ', Tizen ' + (tizen ? tizen[1] : 'unknown'));

        log('Stage: ' + window.innerWidth + 'x' + window.innerHeight +
            ', screen ' + screen.width + 'x' + screen.height +
            ', dpr ' + (window.devicePixelRatio || 1));

        var cores = navigator.hardwareConcurrency;
        var mem = navigator.deviceMemory;
        log('Hardware: ' + (cores ? cores + ' cores' : 'cores unknown') +
            ', ' + (mem ? mem + ' GB' : 'memory unknown'));

        if (!window.CSS || !CSS.supports) {
            log('CSS.supports unavailable: cannot feature-detect');
            return;
        }
        var yes = [];
        var no = [];
        FEATURES.forEach(function (f) {
            (CSS.supports(f[0]) ? yes : no).push(f[1]);
        });
        log('CSS yes: ' + yes.join(', '));
        log('CSS no: ' + (no.length ? no.join(', ') : 'nothing on the list'));

        // :has() needs the selector() form, which older engines reject outright.
        var has = false;
        try {
            has = CSS.supports('selector(:has(*))');
        } catch (e) {
            has = false;
        }
        log('CSS :has() — ' + (has ? 'yes' : 'no'));
    }

    // ---------- everything, in order

    function probeAll() {
        log('--- render probe start ---');
        probeEnvironment();
        probeBaseline(function (base) {
            probeShadows(function (shadow) {
                probeGradients(function (grad) {
                    probeBoth(function (both) {
                        // Compared on sustained frame rate, which batching cannot inflate.
                        var cost = function (r) {
                            if (!base.fps || !r.fps) return '?';
                            return r.fps + ' fps (' + Math.round(r.fps / base.fps * 100) + '% of baseline)';
                        };
                        log('Verdict vs baseline ' + base.fps + ' fps —');
                        log('  blurred shadows: ' + cost(shadow));
                        log('  large gradients: ' + cost(grad));
                        log('  both together:   ' + cost(both));
                        log('--- render probe end ---');
                        UI.toast('Render probe done — see the log');
                    });
                });
            });
        });
    }

    window.RenderProbe = {
        actions: function () {
            return [
                { label: 'Render probe: everything (about 8 s)', run: probeAll },
                { label: 'Render probe: environment and CSS support', run: probeEnvironment },
                { label: 'Render probe: baseline frame cost', run: function () { probeBaseline(); } },
                { label: 'Render probe: blurred shadows', run: function () { probeShadows(); } },
                { label: 'Render probe: large gradients', run: function () { probeGradients(); } }
            ];
        }
    };
})();
