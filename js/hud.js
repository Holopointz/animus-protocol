// Modern Asteroids - HUD System
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.HUD = class HUD {
    constructor(container) {
        this.container = container || document.body;
        this.createDOM();
    }

    createDOM() {
        var font = "'Orbitron', 'Rajdhani', 'Segoe UI', system-ui, sans-serif";

        this.hudDiv = document.createElement('div');
        this.hudDiv.id = 'hud';
        this.hudDiv.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
            'pointer-events:none', 'z-index:10',
            'font-family:' + font,
            'color:#7dffef',
            'text-shadow:0 0 12px rgba(0,255,220,0.55), 0 0 2px rgba(0,0,0,0.9)',
            'letter-spacing:0.06em'
        ].join(';');
        this.container.appendChild(this.hudDiv);

        // Score
        this.scoreEl = this.createText('score', '18px', '22px', 'left', '22px');
        this.scoreEl.style.fontWeight = '700';

        // Lives
        this.livesEl = this.createText('lives', '18px', '22px', 'right', '22px');
        this.livesEl.style.fontWeight = '700';

        // Level chip top-center
        this.levelChip = document.createElement('div');
        this.levelChip.id = 'level-chip';
        this.levelChip.style.cssText = [
            'position:absolute', 'top:18px', 'left:50%', 'transform:translateX(-50%)',
            'padding:6px 16px', 'border:1px solid rgba(0,255,220,0.35)',
            'background:rgba(0,12,24,0.55)', 'border-radius:999px',
            'font-size:13px', 'font-weight:600', 'color:#cffff7',
            'backdrop-filter:blur(6px)', 'letter-spacing:0.14em', 'text-transform:uppercase'
        ].join(';');
        this.levelChip.textContent = 'SECTOR 01';
        this.hudDiv.appendChild(this.levelChip);

        // Bars
        this.shieldContainer = this.createBarContainer('shield-container', null, '28px', '24px', null, 'left', 'bottom');
        this.shieldFill = this.createBarFill('shield-fill', 'linear-gradient(90deg,#0066aa,#00d4ff)');
        this.shieldLabel = this.createBarLabel('shield-label', 'SHIELD');
        this.shieldContainer.appendChild(this.shieldLabel);
        this.shieldContainer.appendChild(this.shieldFill);
        this.hudDiv.appendChild(this.shieldContainer);

        this.hullContainer = this.createBarContainer('hull-container', null, '28px', null, '24px', 'right', 'bottom');
        this.hullFill = this.createBarFill('hull-fill', 'linear-gradient(90deg,#aa2200,#ff5555)');
        this.hullLabel = this.createBarLabel('hull-label', 'HULL');
        this.hullContainer.appendChild(this.hullLabel);
        this.hullContainer.appendChild(this.hullFill);
        this.hudDiv.appendChild(this.hullContainer);

        this.boostContainer = this.createBarContainer('boost-container', null, '70px', null, null, 'center', 'bottom');
        this.boostContainer.style.left = '50%';
        this.boostContainer.style.transform = 'translateX(-50%)';
        this.boostContainer.style.width = '260px';
        this.boostFill = this.createBarFill('boost-fill', 'linear-gradient(90deg,#aa5500,#ffcc33)');
        this.boostLabel = this.createBarLabel('boost-label', 'BOOST');
        this.boostContainer.appendChild(this.boostLabel);
        this.boostContainer.appendChild(this.boostFill);
        this.hudDiv.appendChild(this.boostContainer);

        // Effects
        this.effectsEl = document.createElement('div');
        this.effectsEl.id = 'effects';
        this.effectsEl.style.cssText = [
            'position:absolute', 'top:56px', 'left:50%', 'transform:translateX(-50%)',
            'display:flex', 'gap:14px', 'font-size:14px', 'font-weight:600'
        ].join(';');
        this.hudDiv.appendChild(this.effectsEl);

        // Level name splash
        this.levelEl = document.createElement('div');
        this.levelEl.id = 'level-name';
        this.levelEl.style.cssText = [
            'position:absolute', 'top:38%', 'left:50%', 'transform:translate(-50%,-50%)',
            'font-size:52px', 'font-weight:800', 'color:#ffffff',
            'text-shadow:0 0 40px rgba(0,220,255,0.85), 0 0 80px rgba(0,120,255,0.45)',
            'opacity:0', 'transition:opacity 0.55s ease', 'text-align:center',
            'letter-spacing:0.12em', 'text-transform:uppercase', 'line-height:1.15',
            'white-space:pre-line'
        ].join(';');
        this.hudDiv.appendChild(this.levelEl);

        // Start / controls overlay
        this.startEl = document.createElement('div');
        this.startEl.id = 'start-overlay';
        this.startEl.style.cssText = [
            'position:absolute', 'inset:0', 'display:flex', 'align-items:center',
            'justify-content:center', 'pointer-events:auto',
            'background:radial-gradient(ellipse at center, rgba(0,20,40,0.72) 0%, rgba(0,0,0,0.88) 70%)',
            'z-index:20', 'backdrop-filter:blur(4px)'
        ].join(';');
        this.startEl.innerHTML = [
            '<div style="max-width:720px;width:92%;text-align:center;padding:36px 28px;',
            'border:1px solid rgba(0,255,220,0.28);border-radius:18px;',
            'background:linear-gradient(160deg,rgba(4,18,36,0.92),rgba(2,8,18,0.94));',
            'box-shadow:0 0 60px rgba(0,180,255,0.18), inset 0 0 40px rgba(0,80,140,0.12);">',
            '<div style="font-size:13px;letter-spacing:0.35em;color:#6fefff;margin-bottom:10px;font-weight:600">ANIMUS PROTOCOL</div>',
            '<div style="font-size:48px;font-weight:800;color:#fff;letter-spacing:0.08em;margin-bottom:6px;',
            'text-shadow:0 0 30px rgba(0,220,255,0.7)">ANIMUS PROTOCOL</div>',
            '<div style="font-size:15px;color:#9ad8ff;margin-bottom:28px;letter-spacing:0.08em">Animus Deepspace Looter / Shooter</div>',
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;text-align:left;',
            'font-size:14px;color:#d7f7ff;margin:0 auto 28px;max-width:520px;line-height:1.55">',
            this._ctrlRow('A / ←', 'Rotate left'),
            this._ctrlRow('D / →', 'Rotate right'),
            this._ctrlRow('W / ↑', 'Thrust'),
            this._ctrlRow('S / ↓', 'Brake'),
            this._ctrlRow('SPACE', 'Fire lasers'),
            this._ctrlRow('SHIFT / B', 'Boost lunge'),
            this._ctrlRow('Q / E', 'Look yaw'),
            this._ctrlRow('R / F', 'Look pitch'),
            this._ctrlRow('MOUSE DRAG', 'Free-look camera'),
            this._ctrlRow('C', 'Hold for controls'),
            this._ctrlRow('P / ESC', 'Pause'),
            this._ctrlRow('ENTER', 'Start / Restart'),
            '</div>',
            '<div style="font-size:13px;color:#8ec8e8;margin-bottom:18px;line-height:1.6;max-width:540px;margin-left:auto;margin-right:auto">',
            'Destroy asteroids into smaller rocks. Boost to dodge or scoop floating powerups.<br>',
            '<span style="color:#5ad4ff">Battery</span> repairs shields · ',
            '<span style="color:#ffb45a">Scrap</span> repairs hull · ',
            '<span style="color:#7dff8a">Food</span> grants speed. ',
            'Each sector orbits a different planet.',
            '</div>',
            '<div id="start-prompt" style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.22em;',
            'animation:a0pulse 1.4s ease-in-out infinite">PRESS ENTER TO LAUNCH</div>',
            '</div>',
            '<style>@keyframes a0pulse{0%,100%{opacity:0.55}50%{opacity:1}}</style>'
        ].join('');
        this.hudDiv.appendChild(this.startEl);

        // In-game "C FOR CONTROLS" hint (bottom center, same bottom offset as Shield/Hull)
        this.controlsHintEl = document.createElement('div');
        this.controlsHintEl.id = 'controls-hint';
        this.controlsHintEl.textContent = 'C FOR CONTROLS';
        this.controlsHintEl.style.cssText = [
            'position:absolute', 'bottom:28px', 'left:50%', 'transform:translateX(-50%)',
            'font-size:12px', 'color:#ffffff', 'opacity:0.5', 'letter-spacing:0.14em',
            'font-weight:600', 'text-shadow:0 0 8px rgba(0,0,0,0.8)',
            'z-index:14', 'pointer-events:none', 'display:none'
        ].join(';');
        this.hudDiv.appendChild(this.controlsHintEl);

        // In-game controls overlay (same panel as main menu; no pause), shown while C is held
        this.controlsEl = document.createElement('div');
        this.controlsEl.id = 'controls-overlay';
        this.controlsEl.style.cssText = [
            'position:absolute', 'inset:0', 'display:none', 'align-items:center',
            'justify-content:center', 'pointer-events:none',
            'background:rgba(0,0,0,0.55)',
            'z-index:16'
        ].join(';');
        this.controlsEl.innerHTML = [
            '<div style="max-width:720px;width:92%;text-align:center;padding:36px 28px;',
            'border:1px solid rgba(0,255,220,0.28);border-radius:18px;',
            'background:linear-gradient(160deg,rgba(4,18,36,0.92),rgba(2,8,18,0.94));',
            'box-shadow:0 0 60px rgba(0,180,255,0.18), inset 0 0 40px rgba(0,80,140,0.12);">',
            '<div style="font-size:13px;letter-spacing:0.35em;color:#6fefff;margin-bottom:10px;font-weight:600">ANIMUS PROTOCOL</div>',
            '<div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:0.08em;margin-bottom:18px;',
            'text-shadow:0 0 30px rgba(0,220,255,0.7)">CONTROLS</div>',
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;text-align:left;',
            'font-size:14px;color:#d7f7ff;margin:0 auto 8px;max-width:520px;line-height:1.55">',
            this._ctrlRow('A / ←', 'Rotate left'),
            this._ctrlRow('D / →', 'Rotate right'),
            this._ctrlRow('W / ↑', 'Thrust'),
            this._ctrlRow('S / ↓', 'Brake'),
            this._ctrlRow('SPACE', 'Fire lasers'),
            this._ctrlRow('SHIFT / B', 'Boost lunge'),
            this._ctrlRow('Q / E', 'Look yaw'),
            this._ctrlRow('R / F', 'Look pitch'),
            this._ctrlRow('MOUSE DRAG', 'Free-look camera'),
            this._ctrlRow('C', 'Hold for controls'),
            this._ctrlRow('P / ESC', 'Pause'),
            this._ctrlRow('ENTER', 'Start / Restart'),
            '</div>',
            '<div style="font-size:13px;color:#8ec8e8;margin-top:12px;opacity:0.85">RELEASE C TO CLOSE</div>',
            '</div>'
        ].join('');
        this.hudDiv.appendChild(this.controlsEl);

        // Pause overlay
        this.pauseEl = document.createElement('div');
        this.pauseEl.id = 'pause-overlay';
        this.pauseEl.style.cssText = [
            'position:absolute', 'inset:0', 'display:none', 'align-items:center',
            'justify-content:center', 'background:rgba(0,0,0,0.55)', 'z-index:15',
            'font-size:42px', 'font-weight:800', 'letter-spacing:0.2em', 'color:#fff'
        ].join(';');
        this.pauseEl.innerHTML = '<div>PAUSED<br><span style="font-size:16px;letter-spacing:0.18em;color:#9ad8ff;font-weight:600">Press P or ESC</span></div>';
        this.hudDiv.appendChild(this.pauseEl);

        // Game over / win
        this.gameOverEl = document.createElement('div');
        this.gameOverEl.id = 'game-over';
        this.gameOverEl.style.cssText = [
            'position:absolute', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
            'text-align:center', 'font-size:36px', 'display:none',
            'padding:32px 40px', 'border-radius:16px',
            'background:rgba(0,8,18,0.82)', 'border:1px solid rgba(0,255,220,0.25)',
            'box-shadow:0 0 50px rgba(0,120,255,0.2)'
        ].join(';');
        this.hudDiv.appendChild(this.gameOverEl);

        // Crosshair / center pip
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = [
            'position:absolute', 'left:50%', 'top:50%', 'width:10px', 'height:10px',
            'margin:-5px 0 0 -5px', 'border:1px solid rgba(0,255,220,0.35)',
            'border-radius:50%', 'opacity:0.5'
        ].join(';');
        this.hudDiv.appendChild(this.crosshair);

        // Ani intro dialogue (lower-left avatar + typewriter)
        this.aniIntroEl = document.createElement('div');
        this.aniIntroEl.id = 'ani-intro';
        this.aniIntroEl.style.cssText = [
            'position:absolute', 'left:28px', 'bottom:96px', 'display:none',
            'align-items:flex-end', 'gap:16px', 'max-width:580px',
            'z-index:18', 'pointer-events:none',
            'opacity:1', 'transition:opacity 0.45s ease'
        ].join(';');
        var avatarWrap = document.createElement('div');
        avatarWrap.style.cssText = [
            'width:176px', 'height:176px', 'border-radius:18px', 'overflow:hidden',
            'border:2px solid rgba(0,255,220,0.75)',
            'box-shadow:0 0 22px rgba(0,220,255,0.45), inset 0 0 18px rgba(0,80,120,0.25)',
            'background:rgba(0,10,20,0.8)', 'flex:0 0 auto'
        ].join(';');
        var avatarImg = document.createElement('img');
        avatarImg.src = 'assets/textures/ani.gif?v=18';
        avatarImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        avatarWrap.appendChild(avatarImg);
        this.aniIntroEl.appendChild(avatarWrap);

        this.aniBubbleEl = document.createElement('div');
        this.aniBubbleEl.style.cssText = [
            'position:relative', 'max-width:360px', 'padding:18px 22px',
            'border-radius:18px',
            'border:1px solid rgba(0,255,220,0.55)',
            'background:linear-gradient(160deg, rgba(0,16,30,0.88), rgba(0,8,16,0.9))',
            'box-shadow:0 0 30px rgba(0,180,255,0.2), inset 0 0 22px rgba(0,80,140,0.12)',
            'backdrop-filter:blur(6px)'
        ].join(';');
        var aniName = document.createElement('div');
        aniName.style.cssText = [
            'font-size:12px', 'font-weight:700', 'letter-spacing:0.22em',
            'color:#7dffef', 'margin-bottom:8px', 'text-transform:uppercase'
        ].join(';');
        aniName.textContent = 'ANI';
        this.aniBubbleEl.appendChild(aniName);
        this.aniText = document.createElement('div');
        this.aniText.style.cssText = [
            'font-size:15px', 'line-height:1.6', 'color:#dff9ff',
            'font-weight:500', 'text-shadow:0 0 8px rgba(0,0,0,0.8)'
        ].join(';');
        this.aniBubbleEl.appendChild(this.aniText);
        this.aniIntroEl.appendChild(this.aniBubbleEl);
        this.hudDiv.appendChild(this.aniIntroEl);
        this._aniIntroTimer = null;
    }

    _ctrlRow(key, label) {
        return [
            '<div style="display:flex;gap:10px;align-items:center">',
            '<span style="min-width:110px;padding:4px 8px;border-radius:6px;',
            'background:rgba(0,255,220,0.08);border:1px solid rgba(0,255,220,0.22);',
            'color:#7dffef;font-weight:700;font-size:12px;letter-spacing:0.06em;text-align:center">',
            key, '</span>',
            '<span style="color:#cfefff">', label, '</span></div>'
        ].join('');
    }

    createText(id, top, side, align, fontSize) {
        var el = document.createElement('div');
        el.id = id;
        el.style.cssText = [
            'position:absolute', 'top:' + top, align + ':' + side,
            'font-size:' + fontSize, 'font-weight:700'
        ].join(';');
        this.hudDiv.appendChild(el);
        return el;
    }

    createBarContainer(id, top, bottom, left, right, align, vpos) {
        var el = document.createElement('div');
        el.id = id;
        var css = [
            'position:absolute',
            (vpos === 'bottom' ? 'bottom' : 'top') + ':' + (bottom || top),
            'width:200px', 'height:20px',
            'background:rgba(0,8,16,0.72)',
            'border:1px solid rgba(0,255,220,0.45)',
            'border-radius:4px', 'overflow:hidden',
            'box-shadow:0 0 18px rgba(0,180,255,0.12)'
        ];
        if (align === 'left') css.push('left:' + left);
        if (align === 'right') css.push('right:' + right);
        if (align === 'center') css.push('left:50%');
        el.style.cssText = css.join(';');
        return el;
    }

    createBarFill(id, color) {
        var el = document.createElement('div');
        el.id = id;
        el.style.cssText = [
            'height:100%', 'width:100%',
            'background:' + color,
            'box-shadow:0 0 12px rgba(0,200,255,0.35)',
            'transition:width 0.15s linear'
        ].join(';');
        return el;
    }

    createBarLabel(id, text) {
        var el = document.createElement('div');
        el.style.cssText = [
            'position:absolute', 'top:0', 'left:8px', 'font-size:11px',
            'line-height:20px', 'color:#fff', 'z-index:1',
            'text-shadow:0 0 6px rgba(0,0,0,0.9)', 'font-weight:700',
            'letter-spacing:0.12em'
        ].join(';');
        el.textContent = text;
        return el;
    }

    update(player, level, gameState) {
        if (!player) return;

        this.scoreEl.textContent = 'SCORE  ' + player.score;
        this.livesEl.textContent = 'LIVES  ' + player.lives;

        if (level && level.getName) {
            var n = level.getCurrentLevelNumber ? level.getCurrentLevelNumber() : 1;
            this.levelChip.textContent = level.getName().toUpperCase() + '  ·  SECTOR ' + String(n).padStart(2, '0');
        }

        var shieldPercent = (player.shield / ASTEROIDS.CONFIG.PLAYER.SHIELD_MAX) * 100;
        this.shieldFill.style.width = Math.max(0, Math.min(100, shieldPercent)) + '%';
        this.shieldLabel.textContent = 'SHIELD  ' + Math.round(player.shield);

        var hullPercent = (player.hull / ASTEROIDS.CONFIG.PLAYER.HULL_MAX) * 100;
        this.hullFill.style.width = Math.max(0, Math.min(100, hullPercent)) + '%';
        this.hullLabel.textContent = 'HULL  ' + Math.round(player.hull);

        var boostPercent = player.getBoostCooldownPercent() * 100;
        this.boostFill.style.width = Math.max(0, Math.min(100, boostPercent)) + '%';
        this.boostLabel.textContent = player.boostCooldown > 0
            ? ('BOOST  ' + player.boostCooldown.toFixed(1) + 's')
            : 'BOOST  READY';

        var effectsHTML = '';
        if (player.foodBuffTimer > 0) {
            effectsHTML += '<span style="color:#66cc44">SPEED ' + player.foodBuffTimer.toFixed(1) + 's</span>';
        }
        if (player.isBoosting && player.isBoosting()) {
            effectsHTML += '<span style="color:#ffaa00">BOOSTING</span>';
        }
        if (player.isInvulnerable && player.isInvulnerable()) {
            effectsHTML += '<span style="color:#ffff66">INVULN ' + player.invulnerable.toFixed(1) + 's</span>';
        }
        this.effectsEl.innerHTML = effectsHTML;
    }

    showAniIntro(sector) {
        var self = this;
        if (!this.aniIntroEl) return;
        var ANI_DIALOGUES = {
            1: "This is the ANIMUS, is anybody out there? Current trajectory is an asteroid field, I've got no choice but to try to navigate through it.",
            2: "Still no response on any frequency. Sensors are picking up a debris field ahead, looks like something didn't survive whatever's out here.",
            3: "Three days of silence now. I'm rerouting power to long-range comms, but honestly, I don't know if anyone's listening anymore.",
            4: "Fuel reserves are lower than I'd like and I still don't have a fix on where 'home' even is from here. One system at a time, Ani. One system at a time.",
            5: "I talked to my own ship for six hours straight yesterday just to hear a voice. That's probably not a good sign.",
            6: "Something's wrong with the hull integrity readings—minor for now, but I don't have the parts to fix it if it gets worse. I need to keep my eyes peeled for metals.",
            7: "I don't remember the last time I slept properly. If anyone out there can hear this, please, I just need a response—anyone!",
            8: "The nav computer just went dark! I'm flying blind now. If I can just get through this damn asteroid field, I can reroute power from shields to boost the signal."
        };
        var message = ANI_DIALOGUES[sector] || ANI_DIALOGUES[1];
        clearTimeout(this._aniIntroTimer);
        if (ASTEROIDS.Sound && ASTEROIDS.Sound.stopTyping) ASTEROIDS.Sound.stopTyping();
        this.aniText.textContent = '';
        this.aniIntroEl.style.display = 'flex';
        this.aniIntroEl.style.opacity = '1';
        if (ASTEROIDS.Sound && ASTEROIDS.Sound.startTyping) ASTEROIDS.Sound.startTyping();
        var i = 0;
        (function typeNext() {
            if (i <= message.length) {
                self.aniText.textContent = message.substring(0, i);
                i += 1;
                self._aniIntroTimer = setTimeout(typeNext, 44);
            } else {
                if (ASTEROIDS.Sound && ASTEROIDS.Sound.stopTyping) ASTEROIDS.Sound.stopTyping();
                self._aniIntroTimer = setTimeout(function() {
                    self.hideAniIntro();
                }, 1500);
            }
        })();
    }

    hideAniIntro() {
        var self = this;
        if (!this.aniIntroEl) return;
        clearTimeout(this._aniIntroTimer);
        if (ASTEROIDS.Sound && ASTEROIDS.Sound.stopTyping) ASTEROIDS.Sound.stopTyping();
        this.aniIntroEl.style.opacity = '0';
        setTimeout(function() {
            self.aniIntroEl.style.display = 'none';
        }, 460);
    }

    showStart() {
        this.startEl.style.display = 'flex';
    }

    hideStart() {
        this.startEl.style.display = 'none';
    }

    showControls() {
        if (this.controlsEl) this.controlsEl.style.display = 'flex';
    }

    hideControls() {
        if (this.controlsEl) this.controlsEl.style.display = 'none';
    }

    showControlsHint(show) {
        if (this.controlsHintEl) this.controlsHintEl.style.display = show ? 'block' : 'none';
    }

    showPause(show) {
        this.pauseEl.style.display = show ? 'flex' : 'none';
    }

    showLevelName(name, levelNum) {
        this.levelEl.textContent = name + '\nSECTOR ' + levelNum;
        this.levelEl.style.opacity = '1';
        var self = this;
        setTimeout(function() {
            self.levelEl.style.opacity = '0';
        }, 2600);
    }

    showGameOver(finalScore) {
        this.gameOverEl.innerHTML = [
            '<div style="font-size:48px;font-weight:800;color:#ff5555;',
            'text-shadow:0 0 30px #ff0000;letter-spacing:0.12em">GAME OVER</div>',
            '<div style="margin-top:18px;color:#fff;font-size:22px">Final Score: ' + finalScore + '</div>',
            '<div style="margin-top:22px;font-size:15px;color:#9ad8ff;letter-spacing:0.16em">PRESS ENTER TO RESTART</div>'
        ].join('');
        this.gameOverEl.style.display = 'block';
    }

    hideGameOver() {
        this.gameOverEl.style.display = 'none';
    }

    showLevelClear(loopLevel, finalScore) {
        var n = loopLevel || 1;
        this.gameOverEl.innerHTML = [
            '<div style="font-size:48px;font-weight:800;color:#00ffcc;',
            'text-shadow:0 0 30px #00ffcc;letter-spacing:0.12em">LEVEL ' + n + ' CLEARED</div>',
            '<div style="margin-top:18px;color:#fff;font-size:22px">Final Score: ' + finalScore + '</div>',
            '<div style="margin-top:22px;font-size:15px;color:#9ad8ff;letter-spacing:0.16em">PRESS ENTER TO CONTINUE</div>',
            '<div style="margin-top:6px;font-size:13px;color:#7d9bb5;letter-spacing:0.14em">BACKSPACE TO EXIT</div>'
        ].join('');
        this.gameOverEl.style.display = 'block';
    }
};
