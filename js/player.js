// Modern Asteroids - Player Ship (Animus)
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.Player = class Player {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.group = new THREE.Group();
        scene.add(this.group);

        // State
        this.velocity = new THREE.Vector3();
        this.rotation = 0; // Z-axis heading (0 = +Y)
        this.shield = ASTEROIDS.CONFIG.PLAYER.SHIELD_MAX;
        this.hull = ASTEROIDS.CONFIG.PLAYER.HULL_MAX;
        this.lives = ASTEROIDS.CONFIG.PLAYER.LIVES;
        this.dead = false;
        this.score = 0;

        // Timers
        this.shootCooldown = 0;
        this.boostCooldown = 0;
        this.invulnerable = 0;
        this.foodBuffTimer = 0;

        // Boost / rubberband state
        this.boosting = false;
        this.boostActiveTime = 0;
        this.homePosition = new THREE.Vector3(0, 0, 0);
        this._boostLungeRemaining = 0;

        // Engine particles
        this.engineParticles = [];
        this.particleGroup = new THREE.Group();
        scene.add(this.particleGroup);

        this.spriteTexture = this.createSpriteTexture();
        this.engineGlowSprite = this.createEngineGlowSprite();

        // Motion trail
        this.trailPositions = [];
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);
        this._trailTimer = 0;

        // Thruster glow
        this.thrusterLight = new THREE.PointLight(0x00aaff, 0, 8);
        this.group.add(this.thrusterLight);

        // Input map
        this.keys = {};
        this._inputBound = false;

        this.ready = false;
        this.loadModel();
    }

    createSpriteTexture() {
        var canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');
        var gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.15, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(0.7, 'rgba(255,255,255,0.1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    createEngineGlowSprite() {
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        var gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(0,170,255,0.85)');
        gradient.addColorStop(0.2, 'rgba(0,170,255,0.55)');
        gradient.addColorStop(0.5, 'rgba(0,100,255,0.2)');
        gradient.addColorStop(1, 'rgba(0,50,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var spriteMat = new THREE.SpriteMaterial({
            map: tex,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.55
        });
        var sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(6, 6, 1);
        this.group.add(sprite);
        return sprite;
    }

    loadModel() {
        var self = this;
        var loader = new THREE.GLTFLoader();
        var textureLoader = new THREE.TextureLoader();
        var texPath = 'assets/textures/';

        var diffuseMap = textureLoader.load(texPath + 'Diffuse_animus_hull.jpeg');
        var normalMap = textureLoader.load(texPath + 'Normal_animus_hull.jpg');
        var specularMap = textureLoader.load(texPath + 'Specular_animus_hull.jpg');

        loader.load('assets/models/spaceship.glb', function(gltf) {
            self.mesh = gltf.scene;

            self.mesh.traverse(function(child) {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.map = diffuseMap;
                    child.material.normalMap = normalMap;
                    child.material.roughnessMap = specularMap;
                    child.material.metalnessMap = specularMap;
                    child.material.roughness = 0.70;
                    child.material.metalness = 0.35;
                    child.material.emissive = new THREE.Color(0x1a3344);
                    child.material.emissiveIntensity = 0.55;
                    if (window.ASTEROIDS.envMap) {
                        child.material.envMap = window.ASTEROIDS.envMap;
                        child.material.envMapIntensity = 0.55;
                    }
                    child.material.needsUpdate = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            self.mesh.scale.set(0.85, 0.85, 0.85);
            // Model nose points +Z in many GLBs; rotate so nose faces +Y (our forward)
            // Top-down XY: nose along +Y (matches projectiles/boost facing)
            self.mesh.rotation.set(-Math.PI / 1, 1.5, -Math.PI / 2);
            self.group.add(self.mesh);
            self.ready = true;
        }, undefined, function(error) {
            console.error('Error loading spaceship model:', error);
            // Fallback placeholder so game stays playable
            var geo = new THREE.ConeGeometry(0.8, 2.4, 6);
            var mat = new THREE.MeshStandardMaterial({
                color: 0x8899aa,
                metalness: 0.7,
                roughness: 0.35,
                emissive: 0x112233,
                emissiveIntensity: 0.1
            });
            self.mesh = new THREE.Mesh(geo, mat);
            self.mesh.rotation.set(0, 0, 0);
            self.group.add(self.mesh);
            self.ready = true;
        });
    }

    spawn(x, y, z) {
        this.group.position.set(x || 0, y || 0, z || 0);
        this.homePosition.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.rotation = 0;
        this.group.rotation.set(0, 0, 0);
        this.shield = ASTEROIDS.CONFIG.PLAYER.SHIELD_MAX;
        this.hull = ASTEROIDS.CONFIG.PLAYER.HULL_MAX;
        this.invulnerable = ASTEROIDS.CONFIG.PLAYER.RESPAWN_INVULNERABILITY;
        this.dead = false;
        this.boostCooldown = 0;
        this.foodBuffTimer = 0;
        this.boosting = false;
        this.boostActiveTime = 0;
        this._boostLungeRemaining = 0;
        this.thrusterLight.intensity = 0;
        this.trailPositions = [];
    }

    handleInput() {
        if (this._inputBound) return;
        this._inputBound = true;
        var self = this;

        window.addEventListener('keydown', function(e) {
            var k = e.key.toLowerCase();
            self.keys[k] = true;
            // Also track code-based aliases for space/shift
            if (e.code === 'Space') self.keys[' '] = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') self.keys['shift'] = true;
            if (e.key === ' ' || e.code === 'Space') e.preventDefault();
            if (['arrowup','arrowdown','arrowleft','arrowright'].indexOf(k) >= 0) e.preventDefault();
        });

        window.addEventListener('keyup', function(e) {
            var k = e.key.toLowerCase();
            self.keys[k] = false;
            if (e.code === 'Space') self.keys[' '] = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') self.keys['shift'] = false;
        });

        // Lose focus clears stuck keys
        window.addEventListener('blur', function() {
            self.keys = {};
        });
    }

    isKey(name) {
        return !!this.keys[name];
    }

    getFacingDir() {
        return new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), this.rotation);
    }

    update(dt, bullets) {
        if (!this.ready) return;

        var cfg = ASTEROIDS.CONFIG.PLAYER;
        var rotateLeft = this.isKey('a') || this.isKey('arrowleft');
        var rotateRight = this.isKey('d') || this.isKey('arrowright');
        var thrust = this.isKey('w') || this.isKey('arrowup');
        var reverse = this.isKey('s') || this.isKey('arrowdown');
        var shooting = this.isKey(' ') || this.isKey('space');
        var boostKey = this.isKey('shift') || this.isKey('b');

        // Rotate ship facing
        if (rotateLeft) this.rotation += cfg.ROTATION_SPEED * dt;
        if (rotateRight) this.rotation -= cfg.ROTATION_SPEED * dt;
        this.group.rotation.z = this.rotation;

        var dir = this.getFacingDir();
        var thrustLevel = 0;

        // Mild manual thrust (scaled) — primary mobility is BOOST + rubberband
        if (thrust) {
            this.velocity.addScaledVector(dir, cfg.THRUST_POWER * cfg.MANUAL_THRUST_SCALE * dt);
            thrustLevel = 1;
        }
        if (reverse) {
            this.velocity.addScaledVector(dir, -cfg.THRUST_POWER * cfg.MANUAL_THRUST_SCALE * 0.45 * dt);
            thrustLevel = Math.max(thrustLevel, 0.4);
        }

        // Boost trigger
        if (boostKey && !this.boosting && this.boostCooldown <= 0) {
            this.boost();
        }

        // Active boost lunge (short high impulse window)
        if (this.boostActiveTime > 0) {
            this.boostActiveTime -= dt;
            // Keep pushing slightly during the lunge for snappy feel
            this.velocity.addScaledVector(dir, cfg.BOOST_BURST * 0.35 * dt / Math.max(cfg.BOOST_DURATION, 0.05));
            if (this.boostActiveTime <= 0) {
                this.boosting = false;
                this.boostActiveTime = 0;
            }
        }

        // Rubberband spring back to home (screen center)
        // Disabled only during the brief boost lunge peak so dodge lands first
        var rubberbandActive = this.boostActiveTime <= 0;
        if (rubberbandActive) {
            var toHome = this.homePosition.clone().sub(this.group.position);
            var distHome = toHome.length();
            if (distHome > cfg.CENTER_HOLD_RADIUS) {
                // Spring force toward center
                var spring = toHome.multiplyScalar(cfg.RUBBERBAND_STRENGTH * dt);
                this.velocity.add(spring);
            } else {
                // Soft settle near center
                this.velocity.multiplyScalar(0.92);
                this.group.position.lerp(this.homePosition, 0.08);
            }
        }

        // Extra damping while returning from a boost
        if (!this.boosting && this.boostCooldown > 0) {
            this.velocity.multiplyScalar(cfg.RUBBERBAND_DAMPING);
        } else {
            this.velocity.multiplyScalar(cfg.DRAG);
        }

        // Timers
        this.shootCooldown = Math.max(0, this.shootCooldown - dt);
        this.boostCooldown = Math.max(0, this.boostCooldown - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        if (this.foodBuffTimer > 0) this.foodBuffTimer -= dt;

        // Shield regen
        if (this.shield < cfg.SHIELD_MAX) {
            this.shield = Math.min(cfg.SHIELD_MAX, this.shield + cfg.SHIELD_REGEN * dt);
        }

        // Speed cap
        var speedMult = this.foodBuffTimer > 0 ? ASTEROIDS.CONFIG.LOOT.FOOD_SPEED_BUFF : 1;
        var maxSpeed = cfg.MAX_SPEED * speedMult;
        if (this.boostActiveTime > 0) maxSpeed *= cfg.BOOST_MULTIPLIER * 1.8;
        if (this.velocity.length() > maxSpeed) {
            this.velocity.setLength(maxSpeed);
        }

        // Integrate position
        this.group.position.x += this.velocity.x * dt;
        this.group.position.y += this.velocity.y * dt;

        // Clamp max offset from center (no wrap — ship lives near center)
        var maxOff = cfg.MAX_OFFSET;
        var px = this.group.position.x;
        var py = this.group.position.y;
        var plen = Math.sqrt(px * px + py * py);
        if (plen > maxOff) {
            var s = maxOff / plen;
            this.group.position.x *= s;
            this.group.position.y *= s;
            // Kill outward velocity component
            var radial = new THREE.Vector3(this.group.position.x, this.group.position.y, 0).normalize();
            var outward = this.velocity.dot(radial);
            if (outward > 0) this.velocity.addScaledVector(radial, -outward);
        }

        // Shooting
        if (shooting && this.shootCooldown <= 0) {
            this.shoot(bullets);
            this.shootCooldown = cfg.SHOOT_COOLDOWN;
        }

        // VFX
        this.updateParticles(dt, thrustLevel);
        this.thrusterLight.intensity = thrustLevel * 1.5 + (this.boostActiveTime > 0 ? 3.5 : 0);

        if (this.engineGlowSprite) {
            this.engineGlowSprite.position.set(0, -2.5, 0);
            if (this.boostActiveTime > 0) {
                this.engineGlowSprite.material.opacity = 1.0;
                this.engineGlowSprite.scale.set(11, 11, 1);
                this.engineGlowSprite.material.color.setHex(0xff6622);
            } else {
                this.engineGlowSprite.material.opacity = thrustLevel > 0 ? 0.85 : 0.28;
                this.engineGlowSprite.scale.set(6, 6, 1);
                this.engineGlowSprite.material.color.setHex(0x00aaff);
            }
        }

        // Motion trail
        this._trailTimer += dt;
        if (this._trailTimer > 0.03) {
            this._trailTimer = 0;
            this.trailPositions.push(this.group.position.clone());
            if (this.trailPositions.length > 28) this.trailPositions.shift();
        }
        while (this.trailGroup.children.length > 0) {
            var child = this.trailGroup.children[0];
            this.trailGroup.remove(child);
            if (child.material) {
                child.material.dispose();
            }
        }
        for (var ti = 0; ti < this.trailPositions.length; ti++) {
            var alpha = (ti / this.trailPositions.length) * 0.65;
            var trailSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.spriteTexture,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true,
                opacity: alpha,
                color: this.boostActiveTime > 0 ? 0xff6622 : 0x00aaff
            }));
            trailSprite.position.copy(this.trailPositions[ti]);
            trailSprite.position.z = -0.5;
            trailSprite.scale.set(1.4, 1.4, 1);
            this.trailGroup.add(trailSprite);
        }

        // Damage FX
        var hullPercent = this.hull / cfg.HULL_MAX;
        if (hullPercent < 0.5) {
            var vfx = ASTEROIDS.CONFIG.VFX;
            var sparkRate = hullPercent < 0.25 ? vfx.DAMAGE_SPARK_RATE_25 : vfx.DAMAGE_SPARK_RATE_50;
            if (Math.random() < sparkRate) this.createDamageSpark();
            if (hullPercent < 0.25 && Math.random() < vfx.DAMAGE_SMOKE_RATE) this.createDamageSmoke();
        }

        // Blink when invulnerable
        if (this.mesh) {
            if (this.invulnerable > 0) {
                this.mesh.visible = (Math.floor(this.invulnerable * 10) % 2) === 0;
            } else {
                this.mesh.visible = true;
            }
        }

        if (ASTEROIDS.Sound && ASTEROIDS.Sound.setEngineThrust) {
            // Engine hum follows manual thrust only — boost must produce no synth tone.
            ASTEROIDS.Sound.setEngineThrust(thrustLevel > 0 ? 1 : 0);
            if (thrustLevel > 0 && ASTEROIDS.Sound.thrustPulse && Math.random() < 0.02) ASTEROIDS.Sound.thrustPulse();
        }
    }

    boost() {
        var cfg = ASTEROIDS.CONFIG.PLAYER;
        this.boosting = true;
        this.boostActiveTime = cfg.BOOST_DURATION;
        this.boostCooldown = cfg.BOOST_COOLDOWN;

        var dir = this.getFacingDir();
        // Strong impulse in facing direction (~25% playfield reach via burst + spring)
        var burst = cfg.BOOST_BURST;
        this.velocity.addScaledVector(dir, burst);

        // Instant positional nudge so dodge/loot feels immediate
        var worldSize = ASTEROIDS.CONFIG.WORLD.SIZE;
        var lunge = worldSize * cfg.BOOST_DISTANCE_FRACTION * 0.35;
        this.group.position.addScaledVector(dir, lunge);

        for (var i = 0; i < 48; i++) {
            this.createParticle(0xff4400, 3.2);
        }

        if (ASTEROIDS.Sound && ASTEROIDS.Sound.boostSound) {
            ASTEROIDS.Sound.boostSound();
        }
    }

    shoot(bullets) {
        var dir = this.getFacingDir();
        var pos = this.group.position.clone().addScaledVector(dir, 2.2);

        var bulletVel = dir.clone().multiplyScalar(ASTEROIDS.CONFIG.PLAYER.BULLET_SPEED);
        // Carry a bit of ship velocity so shots feel physical
        bulletVel.x += this.velocity.x * 0.35;
        bulletVel.y += this.velocity.y * 0.35;

        var bullet = {
            position: pos,
            velocity: bulletVel,
            lifetime: ASTEROIDS.CONFIG.PLAYER.BULLET_LIFETIME,
            mesh: this.createBulletMesh(pos, dir)
        };
        bullets.push(bullet);

        if (ASTEROIDS.Sound && ASTEROIDS.Sound.laserFire) {
            ASTEROIDS.Sound.laserFire();
        }
    }

    createBulletMesh(pos, dir) {
        var cylGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6);
        var cylMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 2.4,
            roughness: 0.15,
            metalness: 0.1
        });
        var group = new THREE.Group();
        var cylinder = new THREE.Mesh(cylGeo, cylMat);
        group.add(cylinder);

        var tipGeo = new THREE.SphereGeometry(0.11, 6, 6);
        var tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        var tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.set(0, 0.4, 0);
        group.add(tip);

        // Soft glow sprite
        var glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.spriteTexture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.7,
            color: 0x00ffff
        }));
        glow.scale.set(1.2, 1.2, 1);
        group.add(glow);

        group.position.copy(pos);
        var ndir = dir.clone().normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ndir);
        this.scene.add(group);
        return group;
    }

    updateParticles(dt, thrustLevel) {
        if (thrustLevel > 0 || this.boostActiveTime > 0) {
            var count = this.boostActiveTime > 0 ? 4 : 1;
            for (var i = 0; i < count; i++) {
                var color = this.boostActiveTime > 0 ? 0xff6600 : 0x00aaff;
                this.createParticle(color, this.boostActiveTime > 0 ? 2.2 : 0.9);
            }
        }

        for (var j = this.engineParticles.length - 1; j >= 0; j--) {
            var p = this.engineParticles[j];
            p.life -= dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                if (p.mesh.material) p.mesh.material.dispose();
                this.engineParticles.splice(j, 1);
                continue;
            }
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
            var sc = 0.25 + (p.life / p.maxLife) * 0.9;
            p.mesh.scale.setScalar(sc);
        }
    }

    createParticle(color, speed) {
        var spriteMat = new THREE.SpriteMaterial({
            map: this.spriteTexture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 1,
            color: color
        });
        var sprite = new THREE.Sprite(spriteMat);

        var back = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), this.rotation);
        var perpX = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), this.rotation);

        var spawnPos = this.group.position.clone()
            .addScaledVector(back, 1.5)
            .addScaledVector(perpX, (Math.random() - 0.5) * 0.55);
        sprite.position.copy(spawnPos);
        sprite.scale.set(0.35, 0.35, 1);

        var vel = back.clone().multiplyScalar(speed * (Math.random() * 0.5 + 0.5))
            .add(perpX.clone().multiplyScalar((Math.random() - 0.5) * speed * 0.5));

        this.scene.add(sprite);
        this.engineParticles.push({
            mesh: sprite, velocity: vel, life: 0.55, maxLife: 0.55
        });
    }

    takeDamage(amount) {
        if (this.invulnerable > 0) return false;

        if (ASTEROIDS.Sound && ASTEROIDS.Sound.shieldHit) ASTEROIDS.Sound.shieldHit();

        if (this.shield > 0) {
            var shieldDmg = Math.min(this.shield, amount);
            this.shield -= shieldDmg;
            amount -= shieldDmg;
        }

        if (amount > 0) {
            if (ASTEROIDS.Sound && ASTEROIDS.Sound.hullHit) ASTEROIDS.Sound.hullHit();
            this.hull -= amount;
            if (this.hull <= 0) {
                this.hull = 0;
                return true;
            }
        }
        return false;
    }

    heal(amount) {
        this.hull = Math.min(ASTEROIDS.CONFIG.PLAYER.HULL_MAX, this.hull + amount);
    }

    repairShield(amount) {
        this.shield = Math.min(ASTEROIDS.CONFIG.PLAYER.SHIELD_MAX, this.shield + amount);
    }

    applyFoodBuff() {
        this.foodBuffTimer = ASTEROIDS.CONFIG.LOOT.FOOD_DURATION;
    }

    getPosition() {
        return this.group.position;
    }

    getRadius() {
        return 1.5;
    }

    isInvulnerable() {
        return this.invulnerable > 0;
    }

    isBoosting() {
        return this.boosting || this.boostActiveTime > 0;
    }

    getBoostCooldownPercent() {
        if (this.boostCooldown <= 0) return 1;
        return 1 - (this.boostCooldown / ASTEROIDS.CONFIG.PLAYER.BOOST_COOLDOWN);
    }

    getFoodBuffRemaining() {
        return this.foodBuffTimer > 0 ? this.foodBuffTimer : 0;
    }

    addScore(points) {
        this.score += points;
    }

    die() {
        this.lives--;
        this.dead = true;
        for (var i = 0; i < 36; i++) {
            var color = Math.random() > 0.5 ? 0xff6600 : 0xffff00;
            this.createParticleDead(color);
        }
        if (ASTEROIDS.Sound) { if (ASTEROIDS.Sound.deathExplosion) ASTEROIDS.Sound.deathExplosion(); else if (ASTEROIDS.Sound.explosion) ASTEROIDS.Sound.explosion(); }
        return this.lives > 0;
    }

    createParticleDead(color) {
        var spriteMat = new THREE.SpriteMaterial({
            map: this.spriteTexture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 1,
            color: color
        });
        var sprite = new THREE.Sprite(spriteMat);
        sprite.position.copy(this.group.position);
        sprite.scale.set(0.55, 0.55, 1);
        var vel = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 4
        );
        this.scene.add(sprite);
        this.engineParticles.push({ mesh: sprite, velocity: vel, life: 1.0, maxLife: 1.0 });
    }

    createDamageSpark() {
        var sparkMat = new THREE.SpriteMaterial({
            map: this.spriteTexture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.85,
            color: 0xff6600
        });
        var spark = new THREE.Sprite(sparkMat);
        spark.position.copy(this.group.position);
        spark.position.x += (Math.random() - 0.5) * 2;
        spark.position.y += (Math.random() - 0.5) * 2;
        spark.scale.set(0.3, 0.3, 1);
        var vel = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1
        );
        this.scene.add(spark);
        this.engineParticles.push({ mesh: spark, velocity: vel, life: 0.35 + Math.random() * 0.35, maxLife: 0.5 });
    }

    createDamageSmoke() {
        var smokeMat = new THREE.SpriteMaterial({
            map: this.spriteTexture,
            blending: THREE.NormalBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.35,
            color: 0x554433
        });
        var smoke = new THREE.Sprite(smokeMat);
        smoke.position.copy(this.group.position);
        smoke.position.x += (Math.random() - 0.5) * 1.5;
        smoke.position.y += (Math.random() - 0.5) * 1.5;
        smoke.scale.set(1.6, 1.6, 1);
        var vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.3
        );
        this.scene.add(smoke);
        this.engineParticles.push({ mesh: smoke, velocity: vel, life: 1.0 + Math.random(), maxLife: 1.5 });
    }
};
