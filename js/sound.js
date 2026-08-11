// ANIMUS PROTOCOL - Sound System
// Prefers assets/sounds/*.wav samples; falls back to synth stubs so new SFX can be dropped in later.
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.Sound = (function() {
    var audioCtx = null;
    var masterGain = null;
    var sfxGain = null;
    var musicGain = null;
    var initialized = false;
    var buffers = {};
    var loading = {};
    var muted = false;

    // Map logical events -> optional sample filenames under assets/sounds/
    // Missing files stay null; play() uses synth fallback so wiring is complete.
    var SAMPLE_MAP = {
        shoot: 'shoot.wav',
        boost: 'boost.wav',
        explosion: 'death_explosion.wav',
        death: 'death_explosion.wav',
        loot: 'loot.wav',
        level: 'new_level.wav',
        ambient: 'ambience.wav',
        // Stubs (add files later with these names to auto-wire):
        shield_hit: 'shield_hit.wav',
        hull_hit: 'hull_hit.wav',
        thrust: 'thrust.wav',
        engine: 'engine.wav',
        ui_start: 'ui_start.wav',
        menu_click: 'menu_click.wav',
        typing: 'typing.wav',
        ui_pause: 'ui_pause.wav',
        ui_gameover: 'ui_gameover.wav',
        ui_win: 'ui_win.wav',
        asteroid_split: 'asteroid_split.wav',
        respawn: 'respawn.wav',
        powerup_battery: 'powerup_battery.wav',
        powerup_scrap: 'powerup_scrap.wav',
        powerup_food: 'powerup_food.wav'
    };

    var SOUND_BASE = 'assets/sounds/';

    // Continuous nodes
    var engineOsc = null;
    var engineGain = null;
    var engineFilter = null;
    var ambientSource = null;
    var ambientGainNode = null;
    var ambientSynthNodes = [];
    var typingSource = null;
    var typingRequestId = 0;

    function init() {
        if (initialized) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.85;
            masterGain.connect(audioCtx.destination);

            sfxGain = audioCtx.createGain();
            sfxGain.gain.value = 0.9;
            sfxGain.connect(masterGain);

            musicGain = audioCtx.createGain();
            musicGain.gain.value = 0.35;
            musicGain.connect(masterGain);

            initialized = true;
            preloadAll();
        } catch (e) {
            console.warn('Web Audio API not available', e);
        }
    }

    function ensureContext() {
        if (!initialized) init();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function preloadAll() {
        Object.keys(SAMPLE_MAP).forEach(function(key) {
            loadBuffer(key, SAMPLE_MAP[key]);
        });
    }

    function loadBuffer(key, filename) {
        if (!filename || buffers[key] || loading[key]) return;
        loading[key] = true;
        var url = SOUND_BASE + filename;
        fetch(url).then(function(res) {
            if (!res.ok) throw new Error('missing ' + url);
            return res.arrayBuffer();
        }).then(function(ab) {
            return audioCtx.decodeAudioData(ab);
        }).then(function(buf) {
            buffers[key] = buf;
            loading[key] = false;
        }).catch(function() {
            // File not present yet — keep synth fallback
            buffers[key] = null;
            loading[key] = false;
        });
    }

    function playBuffer(key, opts) {
        opts = opts || {};
        ensureContext();
        if (!audioCtx || muted) return null;
        var buf = buffers[key];
        if (!buf) return null;

        var src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.loop = !!opts.loop;

        var gain = audioCtx.createGain();
        gain.gain.value = opts.volume != null ? opts.volume : 1.0;

        var dest = opts.music ? musicGain : sfxGain;

        if (opts.pan != null && audioCtx.createStereoPanner) {
            var panner = audioCtx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
            src.connect(gain);
            gain.connect(panner);
            panner.connect(dest);
        } else {
            src.connect(gain);
            gain.connect(dest);
        }

        if (opts.rate) src.playbackRate.value = opts.rate;

        try {
            src.start(audioCtx.currentTime + (opts.delay || 0));
        } catch (e) {}
        return { source: src, gain: gain };
    }

    function playTone(freq, duration, type, vol, detune) {
        ensureContext();
        if (!audioCtx || muted) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        if (detune) osc.detune.value = detune;
        var v = vol != null ? vol : 0.25;
        gain.gain.setValueAtTime(v, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(sfxGain || masterGain);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration);
    }

    function playNoise(duration, vol, startFreq, endFreq) {
        ensureContext();
        if (!audioCtx || muted) return;
        var bufferSize = Math.floor(audioCtx.sampleRate * duration);
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol != null ? vol : 0.35, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(startFreq || 1200, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(endFreq || 200, audioCtx.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain || masterGain);
        source.start(audioCtx.currentTime);
    }

    // --- Public SFX API (always callable; sample if present else synth) ---

    function laserFire() {
        if (playBuffer('shoot', { volume: 0.85 })) return;
        ensureContext();
        if (!audioCtx || muted) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14);
        osc.connect(gain);
        gain.connect(sfxGain || masterGain);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.14);
    }

    function boostSound() {
        if (playBuffer('boost', { volume: 0.75 })) return;
        ensureContext();
        if (!audioCtx || muted) return;
        // If the sample is still loading, wait briefly so we don't fall back to synth.
        if (loading['boost']) {
            var tries = 0;
            (function attempt() {
                if (playBuffer('boost', { volume: 0.75 })) return;
                if (loading['boost'] && tries++ < 5) setTimeout(attempt, 150);
            })();
            return;
        }
        // No synthetic fallback: if the boost sample isn't available, stay silent.
        // Previously a synth whoosh could still sound like a negative/denial tone.
    }

    function explosion() {
        if (playBuffer('explosion', { volume: 0.95 })) return;
        playNoise(0.45, 0.4, 1400, 180);
    }

    function explosionAt(x, y) {
        var worldSize = (ASTEROIDS.CONFIG && ASTEROIDS.CONFIG.WORLD && ASTEROIDS.CONFIG.WORLD.SIZE) || 100;
        var pan = Math.max(-1, Math.min(1, (x || 0) / worldSize));
        if (playBuffer('explosion', { volume: 0.9, pan: pan })) return;
        // synth with pan
        ensureContext();
        if (!audioCtx || muted) return;
        var duration = 0.45;
        var bufferSize = Math.floor(audioCtx.sampleRate * duration);
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        var source = audioCtx.createBufferSource();
        source.buffer = buffer;
        var gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.38, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1100, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(160, audioCtx.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        if (audioCtx.createStereoPanner) {
            var panner = audioCtx.createStereoPanner();
            panner.pan.value = pan;
            gain.connect(panner);
            panner.connect(sfxGain || masterGain);
        } else {
            gain.connect(sfxGain || masterGain);
        }
        source.start(audioCtx.currentTime);
    }

    function deathExplosion() {
        if (playBuffer('death', { volume: 1.0 })) return;
        explosion();
        playTone(120, 0.5, 'sawtooth', 0.15);
    }

    function shieldHit() {
        if (playBuffer('shield_hit', { volume: 0.8 })) return;
        ensureContext();
        if (!audioCtx || muted) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(480, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(sfxGain || masterGain);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.28);
    }

    function hullHit() {
        if (playBuffer('hull_hit', { volume: 0.85 })) return;
        playNoise(0.2, 0.3, 800, 120);
        playTone(90, 0.25, 'triangle', 0.2);
    }

    function lootPickup(type) {
        var key = null;
        if (type === 'battery') key = 'powerup_battery';
        else if (type === 'scrap') key = 'powerup_scrap';
        else if (type === 'food') key = 'powerup_food';
        if (key && playBuffer(key, { volume: 0.85 })) return;
        if (playBuffer('loot', { volume: 0.85 })) return;
        // synth chime
        ensureContext();
        if (!audioCtx || muted) return;
        var notes = type === 'battery' ? [660, 990] : type === 'scrap' ? [440, 550, 660] : [520, 780, 1040];
        notes.forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            var t0 = audioCtx.currentTime + i * 0.05;
            gain.gain.setValueAtTime(0.18, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
            osc.connect(gain);
            gain.connect(sfxGain || masterGain);
            osc.start(t0);
            osc.stop(t0 + 0.25);
        });
    }

    function levelComplete() {
        if (playBuffer('level', { volume: 0.9 })) return;
        ensureContext();
        if (!audioCtx || muted) return;
        var notes = [523, 659, 784, 1047];
        notes.forEach(function(freq, i) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            var startTime = audioCtx.currentTime + i * 0.14;
            gain.gain.setValueAtTime(0.22, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
            osc.connect(gain);
            gain.connect(sfxGain || masterGain);
            osc.start(startTime);
            osc.stop(startTime + 0.32);
        });
    }

    function asteroidSplit() {
        if (playBuffer('asteroid_split', { volume: 0.7, rate: 0.9 + Math.random() * 0.25 })) return;
        // lighter crack than full explosion if no dedicated sample
        if (buffers.explosion) {
            playBuffer('explosion', { volume: 0.45, rate: 1.35 + Math.random() * 0.3 });
            return;
        }
        playNoise(0.22, 0.25, 1600, 300);
    }

    function thrustPulse() {
        if (playBuffer('thrust', { volume: 0.35 })) return;
        // subtle — engine loop handles most of this
    }

    function respawn() {
        if (playBuffer('respawn', { volume: 0.7 })) return;
        playTone(300, 0.15, 'sine', 0.12);
        playTone(600, 0.2, 'sine', 0.1);
    }

    function menuClick() {
        if (playBuffer('menu_click', { volume: 0.7 })) return;
        playTone(520, 0.06, 'square', 0.1);
    }

    function uiStart() {
        if (playBuffer('ui_start', { volume: 0.75 })) return;
        if (playBuffer('menu_click', { volume: 0.7 })) return;
        playTone(440, 0.1, 'triangle', 0.15);
        playTone(660, 0.15, 'triangle', 0.12);
    }

    function uiPause() {
        if (playBuffer('ui_pause', { volume: 0.6 })) return;
        playTone(330, 0.12, 'sine', 0.12);
    }

    function uiGameOver() {
        if (playBuffer('ui_gameover', { volume: 0.8 })) return;
        playTone(220, 0.35, 'sawtooth', 0.15);
        playTone(140, 0.5, 'triangle', 0.12);
    }

    function uiWin() {
        if (playBuffer('ui_win', { volume: 0.85 })) return;
        levelComplete();
    }

    // --- Engine hum (synth loop; optional engine.wav later) ---

    function startEngine() {
        ensureContext();
        if (!audioCtx || muted) return;
        if (engineOsc) stopEngine();

        // If engine.wav exists, loop it quietly under synth
        if (buffers.engine) {
            var looped = playBuffer('engine', { volume: 0.2, loop: true });
            if (looped) {
                engineGain = looped.gain;
                engineOsc = looped.source; // reuse stop path
                return;
            }
        }

        engineOsc = audioCtx.createOscillator();
        engineGain = audioCtx.createGain();
        engineFilter = audioCtx.createBiquadFilter();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineGain.gain.value = 0.04;
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 180;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(sfxGain || masterGain);
        engineOsc.start();
    }

    function setEngineThrust(multiplier) {
        var m = Math.max(0, Math.min(1, multiplier || 0));
        if (!audioCtx) return;
        if (engineOsc && engineOsc.frequency) {
            try {
                engineOsc.frequency.linearRampToValueAtTime(55 + 110 * m, audioCtx.currentTime + 0.08);
            } catch (e) {}
        }
        if (engineFilter) {
            try {
                engineFilter.frequency.linearRampToValueAtTime(180 + 700 * m, audioCtx.currentTime + 0.08);
            } catch (e) {}
        }
        if (engineGain) {
            try {
                engineGain.gain.linearRampToValueAtTime(0.035 + 0.14 * m, audioCtx.currentTime + 0.08);
            } catch (e) {}
        }
    }

    function stopEngine() {
        if (engineOsc) {
            try { engineOsc.stop(); } catch (e) {}
            engineOsc = null;
        }
        engineGain = null;
        engineFilter = null;
    }

    // --- Ambient bed ---

    function startAmbient() {
        ensureContext();
        if (!audioCtx || muted) return;
        stopAmbient();

        if (buffers.ambient) {
            var src = audioCtx.createBufferSource();
            src.buffer = buffers.ambient;
            src.loop = true;
            ambientGainNode = audioCtx.createGain();
            ambientGainNode.gain.value = 0.45;
            src.connect(ambientGainNode);
            ambientGainNode.connect(musicGain || masterGain);
            try { src.start(); } catch (e) {}
            ambientSource = src;
            return;
        }

        // synth drone fallback
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var lfo = audioCtx.createOscillator();
        var lfoGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55;
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        lfoGain.gain.value = 2;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        gain.gain.value = 0.07;
        var filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 480;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(musicGain || masterGain);
        osc.start();
        ambientSynthNodes = [osc, gain, lfo, lfoGain, filter];
    }

    function stopAmbient() {
        if (ambientSource) {
            try { ambientSource.stop(); } catch (e) {}
            ambientSource = null;
        }
        ambientGainNode = null;
        ambientSynthNodes.forEach(function(node) {
            try { if (node.stop) node.stop(); } catch (e) {}
        });
        ambientSynthNodes = [];
    }

    function setVolume(v) {
        if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
    }

    function setMuted(m) {
        muted = !!m;
        if (masterGain) masterGain.gain.value = muted ? 0 : 0.85;
    }

    function startTyping() {
        ensureContext();
        if (!audioCtx || muted) return;
        // Ensure the typing sample kicks off even if fetch/decode is still in flight
        if (!buffers['typing'] && !loading['typing']) {
            loadBuffer('typing', SAMPLE_MAP['typing']);
        }
        var requestId = ++typingRequestId;
        var tries = 0;
        function attempt() {
            if (requestId !== typingRequestId) return; // cancelled by stopTyping()
            var h = playBuffer('typing', { loop: true, volume: 0.22 });
            if (h) {
                stopTyping();
                typingSource = h.source;
                typingSource.onended = function() { if (typingSource === h.source) typingSource = null; };
            } else if (loading['typing'] && tries++ < 5) {
                setTimeout(attempt, 200);
            }
        }
        attempt();
    }

    function stopTyping() {
        typingRequestId++; // invalidate any pending start/retry
        if (typingSource) {
            try { typingSource.stop(); } catch (e) {}
            typingSource = null;
        }
    }

    /** Drop-in helper: play any logical key from SAMPLE_MAP (for future SFX). */
    function play(key, opts) {
        return playBuffer(key, opts || {});
    }

    return {
        init: init,
        ensureContext: ensureContext,
        // combat / ship
        laserFire: laserFire,
        boostSound: boostSound,
        explosion: explosion,
        explosionAt: explosionAt,
        deathExplosion: deathExplosion,
        shieldHit: shieldHit,
        hullHit: hullHit,
        asteroidSplit: asteroidSplit,
        thrustPulse: thrustPulse,
        // loot / progression
        lootPickup: lootPickup,
        levelComplete: levelComplete,
        respawn: respawn,
        // UI
        menuClick: menuClick,
        uiStart: uiStart,
        startTyping: startTyping,
        stopTyping: stopTyping,
        uiPause: uiPause,
        uiGameOver: uiGameOver,
        uiWin: uiWin,
        // loops
        startEngine: startEngine,
        setEngineThrust: setEngineThrust,
        stopEngine: stopEngine,
        startAmbient: startAmbient,
        stopAmbient: stopAmbient,
        // util
        setVolume: setVolume,
        setMuted: setMuted,
        play: play,
        SAMPLE_MAP: SAMPLE_MAP
    };
})();
