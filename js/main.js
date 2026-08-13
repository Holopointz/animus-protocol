// Modern Asteroids - Main Game Engine
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

// Procedural cubemap generation for environment reflections
function createProceduralCubemap() {
    var size = 256;
    var faces = [
        { name: 'px', color1: '#001122', color2: '#002244' },
        { name: 'nx', color1: '#001122', color2: '#002244' },
        { name: 'py', color1: '#000011', color2: '#001133' },
        { name: 'ny', color1: '#000011', color2: '#001133' },
        { name: 'pz', color1: '#001122', color2: '#002244' },
        { name: 'nz', color1: '#001122', color2: '#002244' }
    ];
    var canvasMap = {};
    for (var f = 0; f < faces.length; f++) {
        var face = faces[f];
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.7);
        gradient.addColorStop(0, face.color2);
        gradient.addColorStop(1, face.color1);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        // Random bright dots for distant stars
        for (var i = 0; i < 80; i++) {
            var sx = Math.floor(Math.random() * size);
            var sy = Math.floor(Math.random() * size);
            var brightness = Math.floor(180 + Math.random() * 75);
            ctx.fillStyle = 'rgb(' + brightness + ',' + brightness + ',' + brightness + ')';
            ctx.fillRect(sx, sy, 1, 1);
        }
        canvasMap[face.name] = canvas;
    }
    var cubeTex = new THREE.CubeTexture([]);
    cubeTex.format = THREE.RGBAFormat;
    cubeTex.images = [
        canvasMap.px, canvasMap.nx,
        canvasMap.py, canvasMap.ny,
        canvasMap.pz, canvasMap.nz
    ];
    cubeTex.needsUpdate = true;
    return cubeTex;
}

ASTEROIDS.Game = class Game {
    constructor() {
        this.state = 'init'; // 'init', 'playing', 'paused', 'gameover', 'win'
        
        // Three.js setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.composer = null;
        this.bloomPass = null;
        
        // Game objects
        this.player = null;
        this.asteroidManager = null;
        this.lootManager = null;
        this.level = null;
        this.hud = null;
        
        // Bullets
        this.bullets = [];
        
        // Explosion particles
        this.explosionParticles = [];
        
        // Debris particles (tumbling asteroid fragments)
        this.debrisParticles = [];
        
        // Explosion flash lights
        this.explosionLights = [];
        
        // Spritesheet explosion sprites (5x5 grid, destroyed after final frame)
        this.explosionSprites = [];
        this._explosionSheetTexture = null;
        // Preload immediately - start() is never called on this page, so load the sheet here
        this._explosionSheetTexture = (ASTEROIDS.Assets && ASTEROIDS.Assets.textures && ASTEROIDS.Assets.textures['explosionSheet']) || new THREE.TextureLoader().load('assets/textures/explosion.png');
        
        // Smoke/dust particles (soft cloud sprites)
        this.smokeParticles = [];
        
        // Shield-hit visual effect (blue translucent sphere)
        this.shieldFlashes = [];
        
        // Shared canvas textures (created once)
        this._sharedSmokeTexture = null;
        this._sharedSparkTexture = null;
        
        // Post-processing shader passes
        this.vignettePass = null;
        this.chromaticAberrationPass = null;
        this.radialBlurPass = null;
        
        // Backlight following player
        this.backLight = null;
        
        // Camera idle bob timer
        this._idleBobTimer = 0;
        
        // Restart flag
        this.restartKeyPressed = false;
        
        // Sound initialized flag
        this.soundStarted = false;
        this.levelPendingSpawn = false; // guards double-nextLevel skip

        // Endless loop: number of cleared 8-sector loops (0 = first playthrough)
        this.loopLevel = 0;
        
        // Free-look camera orbit around ship
        this.lookYaw = 0;
        this.lookPitch = 0.18;
        this._lookKeys = {};
        this._mouseLook = false;
        this._lastMouse = null;
    }
    
    init() {
        this.setupScene();
        this.setupLights();
        this.setupCamera();
        
        this.setupPostProcessing();
        
        // Create environment cubemap for reflections, then push it onto the shared
        // master materials (Plasma/Glass/Shell) + shell textures once available.
        window.ASTEROIDS.envMap = createProceduralCubemap();
        if (ASTEROIDS.Materials && ASTEROIDS.Materials.refreshEnvMap) ASTEROIDS.Materials.refreshEnvMap();
        
        // Create shared textures for smoke & sparks
        this.createSharedTextures();
        
        // Initialize managers
        this.level = new ASTEROIDS.Level(this.scene);
        this.level.init();
        
        this.asteroidManager = new ASTEROIDS.AsteroidManager(this.scene);
        this.lootManager = new ASTEROIDS.LootManager(this.scene);
        // Eagerly swap in the real GLB canister meshes as soon as the model is
        // ready so shields never render as the tiny fallback placeholder.
        if (ASTEROIDS.Assets && ASTEROIDS.Assets.canisterLoaded) {
            this.lootManager.renderer._ensureBattery();
        } else if (ASTEROIDS.Assets && ASTEROIDS.Assets.loadAll) {
            // Cold boot: the GLB may still be loading; build the real canister
            // meshes the moment preload completes so no tiny placeholder shows.
            var renderer = this.lootManager.renderer;
            ASTEROIDS.Assets.loadAll(function() {
                renderer._ensureBattery();
            });
        }
        // Instanced pools: bullets + explosions share fixed objects, zero per-frame allocs.
        this.bulletPool = new ASTEROIDS.BulletPool(this.scene);
        this.explosionSpritePool = new ASTEROIDS.ExplosionSpritePool(this.scene, 24);
        if (this._explosionSheetTexture) this.explosionSpritePool.attachSheet(this._explosionSheetTexture);
        this.smokePool = new ASTEROIDS.SpritePool(this.scene, 40, this._sharedSmokeTexture);
        
        // Create player (model loads async)
        this.player = new ASTEROIDS.Player(this.scene);
        this.player.spawn(0, 0, 0);
        
        // HUD
        this.hud = new ASTEROIDS.HUD();
        
        // Input handling
        this.player.handleInput();
        this.setupInput();
        
        // Start on controls overlay; world renders behind menu
        this.state = 'menu';
        this.spawnAsteroids();
        this.hud.showStart();
        
        // Start game loop
        this.animate();
    }
    
    setupScene() {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.85;
        document.getElementById('game-container').appendChild(this.renderer.domElement);
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        // Volumetric-like fog
        var visConfig = ASTEROIDS.CONFIG.VISUAL;
        this.scene.fog = new THREE.FogExp2(visConfig.FOG_COLOR || 0x000011, visConfig.FOG_DENSITY || 0.00025);
        
        // Window resize
        var self = this;
        window.addEventListener('resize', function() {
            self.camera.aspect = window.innerWidth / window.innerHeight;
            self.camera.updateProjectionMatrix();
            self.renderer.setSize(window.innerWidth, window.innerHeight);
            if (self.composer) {
                self.composer.setSize(window.innerWidth, window.innerHeight);
            }
            // Update custom shader resolution uniforms
            if (self.radialBlurPass && self.radialBlurPass.uniforms.resolution) {
                self.radialBlurPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
            }
        });
    }
    
    setupLights() {
        var visConfig = ASTEROIDS.CONFIG.VISUAL;
        var sunDir = visConfig.SUN_DIRECTION || {x: 100, y: 50, z: 80};
        
        // Ambient light (low fill)
        var ambient = new THREE.AmbientLight(0x12122a, 0.45);
        this.scene.add(ambient);
        
        // Key directional sun light with shadows
        var sunLight = new THREE.DirectionalLight(
            visConfig.SUN_COLOR || 0xffeedd,
            visConfig.SUN_INTENSITY || 2.2
        );
        sunLight.position.set(sunDir.x, sunDir.y, sunDir.z);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 300;
        sunLight.shadow.camera.left = -50;
        sunLight.shadow.camera.right = 50;
        sunLight.shadow.camera.top = 50;
        sunLight.shadow.camera.bottom = -50;
        sunLight.shadow.bias = -0.001;
        this.scene.add(sunLight);
        
        // Secondary blue-tinted fill light
        var fillLight = new THREE.DirectionalLight(0x4466ff, 0.2);
        fillLight.position.set(-30, -10, -20);
        this.scene.add(fillLight);
        
        // Back rim light following player
        this.backLight = new THREE.PointLight(0x3366ff, 0.6, 30);
        this.scene.add(this.backLight);
    }
    
    setupCamera() {
        var visConfig = ASTEROIDS.CONFIG.VISUAL;
        this.camera = new THREE.PerspectiveCamera(
            visConfig.CAMERA_BASE_FOV || 60, window.innerWidth / window.innerHeight, 0.1, 1000
        );
        this.camera.position.set(0, 0, ASTEROIDS.CONFIG.WORLD.CAMERA_DISTANCE);
        this.camera.lookAt(0, 0, 0);
        
        // Camera shake data
        this.cameraShake = { intensity: 0, duration: 0 };
    }

    createSharedTextures() {
        // Smoke texture (soft radial cloud)
        var smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = 128;
        smokeCanvas.height = 128;
        var ctx = smokeCanvas.getContext('2d');
        var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(100,80,60,0.4)');
        grad.addColorStop(0.3, 'rgba(80,60,40,0.25)');
        grad.addColorStop(0.6, 'rgba(40,30,20,0.08)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        // Add some noise/clumps
        for (var ci = 0; ci < 60; ci++) {
            var cx = 64 + (Math.random() - 0.5) * 100;
            var cy = 64 + (Math.random() - 0.5) * 100;
            var cr = 3 + Math.random() * 20;
            var subGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
            subGrad.addColorStop(0, 'rgba(140,110,80,' + (0.15 + Math.random() * 0.2) + ')');
            subGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = subGrad;
            ctx.fillRect(0, 0, 128, 128);
        }
        this._sharedSmokeTexture = new THREE.CanvasTexture(smokeCanvas);
        this._sharedSmokeTexture.needsUpdate = true;
    }
    
    setupPostProcessing() {
        var config = ASTEROIDS.CONFIG;
        var vfx = config.VFX;
        
        // Render pass
        var renderScene = new THREE.RenderPass(this.scene, this.camera);
        
        // Vignette shader (darkens edges for depth)
        var vignetteShader = {
            uniforms: {
                tDiffuse: { value: null },
                vignetteStrength: { value: vfx.VIGNETTE_STRENGTH }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() {',
                '  vUv = uv;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D tDiffuse;',
                'uniform float vignetteStrength;',
                'varying vec2 vUv;',
                'void main() {',
                '  vec4 texel = texture2D(tDiffuse, vUv);',
                '  vec2 uv = vUv - 0.5;',
                '  float dist = length(uv) * 1.414;',
                '  float vig = 1.0 - vignetteStrength * (dist * dist);',
                '  vig = clamp(vig, 0.35, 1.0);',
                '  gl_FragColor = vec4(texel.rgb * vig, texel.a);',
                '}'
            ].join('\n')
        };
        this.vignettePass = new THREE.ShaderPass(vignetteShader, 'tDiffuse');
        this.vignettePass.renderToScreen = false;
        
        // Chromatic aberration shader
        var chromaticShader = {
            uniforms: {
                tDiffuse: { value: null },
                amount: { value: vfx.CHROMATIC_ABERRATION },
                boostAmount: { value: vfx.CHROMATIC_ABERRATION * vfx.CHROMATIC_BOOST_MULT }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() {',
                '  vUv = uv;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D tDiffuse;',
                'uniform float amount;',
                'varying vec2 vUv;',
                'void main() {',
                '  vec2 center = vUv - 0.5;',
                '  float dist = length(center);',
                '  float offset = amount * dist;',
                '  float r = texture2D(tDiffuse, vUv + center * offset).r;',
                '  float g = texture2D(tDiffuse, vUv).g;',
                '  float b = texture2D(tDiffuse, vUv - center * offset).b;',
                '  gl_FragColor = vec4(r, g, b, 1.0);',
                '}'
            ].join('\n')
        };
        this.chromaticAberrationPass = new THREE.ShaderPass(chromaticShader, 'tDiffuse');
        this.chromaticAberrationPass.renderToScreen = false;
        
        // Radial blur shader (active during boost)
        var radialBlurShader = {
            uniforms: {
                tDiffuse: { value: null },
                blurAmount: { value: 0.0 },
                centerX: { value: 0.5 },
                centerY: { value: 0.5 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() {',
                '  vUv = uv;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D tDiffuse;',
                'uniform float blurAmount;',
                'uniform vec2 center;',
                'uniform vec2 resolution;',
                'varying vec2 vUv;',
                'void main() {',
                '  vec2 centeredUV = vUv - center;',
                '  float dist = length(centeredUV);',
                '  if (blurAmount < 0.001) {',
                '    gl_FragColor = texture2D(tDiffuse, vUv);',
                '    return;',
                '  }',
                '  vec3 color = vec3(0.0);',
                '  float samples = 6.0;',
                '  for (float i = 0.0; i < 6.0; i++) {',
                '    float t = (i / 5.0) * blurAmount;',
                '    vec2 sampleUV = vUv + centeredUV * t;',
                '    sampleUV = clamp(sampleUV, 0.001, 0.999);',
                '    color += texture2D(tDiffuse, sampleUV).rgb;',
                '  }',
                '  color /= samples;',
                '  gl_FragColor = vec4(color, 1.0);',
                '}'
            ].join('\n')
        };
        this.radialBlurPass = new THREE.ShaderPass(radialBlurShader, 'tDiffuse');
        this.radialBlurPass.renderToScreen = false;
        
        // Bloom pass
        this.bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            config.bloom.strength,
            config.bloom.radius,
            config.bloom.threshold
        );
        
        // Effect composer: render -> vignette -> bloom -> chromatic -> radialBlur
        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.vignettePass);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.chromaticAberrationPass);
        this.composer.addPass(this.radialBlurPass);
        
        // Optional film grain pass
        if (config.film) {
            var filmPass = new THREE.FilmPass(0.15, 1, 2048, false);
            filmPass.renderToScreen = true;
            this.composer.addPass(filmPass);
        } else {
            this.radialBlurPass.renderToScreen = true;
        }
    }

    setupInput() {
        var self = this;
        var vis = ASTEROIDS.CONFIG.VISUAL;

        window.addEventListener('keydown', function(e) {
            var k = e.key.toLowerCase();
            self._lookKeys[k] = true;

            if (!self.soundStarted) {
                ASTEROIDS.Sound.init();
                ASTEROIDS.Sound.startEngine();
                ASTEROIDS.Sound.startAmbient();
                self.soundStarted = true;
            }

            if (e.key === 'Enter' && self.state === 'menu') {
                self.beginPlay();
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter' && self.state === 'gameover') {
                self.restart();
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter' && self.state === 'win') {
                self.continueLoop();
                e.preventDefault();
                return;
            }

            if ((e.key === 'Backspace' || k === 'backspace') && self.state === 'win') {
                self.returnToMenu();
                e.preventDefault();
                return;
            }

            if (self._controlsHeld) {
                // C-hold controls overlay: don't let P/Escape toggle the normal pause
            } else if ((k === 'p' || e.key === 'Escape') && (self.state === 'playing' || self.state === 'paused')) {
                if (self.state === 'playing') {
                    self.state = 'paused';
                    self.hud.hideControls();
                    self.hud.showPause(true);
                    if (ASTEROIDS.Sound.uiPause) ASTEROIDS.Sound.uiPause();
                } else {
                    self.state = 'playing';
                    self.hud.showPause(false);
                    self.hud.showControlsHint(true);
                    if (ASTEROIDS.Sound.menuClick) ASTEROIDS.Sound.menuClick();
                }
                e.preventDefault();
            }

            if (k === 'c' && self.state === 'playing') {
                self._controlsHeld = true;
                self.state = 'paused';
                self.hud.showControls();
                self.hud.showControlsHint(false);
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', function(e) {
            self._lookKeys[e.key.toLowerCase()] = false;
            if (e.key.toLowerCase() === 'c' && self._controlsHeld) {
                self._controlsHeld = false;
                self.hud.hideControls();
                self.hud.showControlsHint(true);
                if (self.state === 'paused') {
                    self.state = 'playing';
                }
            }
        });

        window.addEventListener('blur', function() {
            self._lookKeys = {};
            self._mouseLook = false;
            if (self._controlsHeld) {
                self._controlsHeld = false;
                self.hud.hideControls();
                if (self.state === 'paused') {
                    self.state = 'playing';
                }
            }
            if (self.hud) {
                self.hud.hideControls();
            }
        });
    }

    beginPlay() {
        this.state = 'playing';
        this.hud.hideStart();
        this.hud.hideControls();
        this.hud.showControlsHint(true);
        this.hud.showLevelName(this.level.getName(), this.level.getCurrentLevelNumber());
        this.hud.showAniIntro(this.level.getCurrentLevelNumber());
        if (!this.soundStarted) {
            ASTEROIDS.Sound.init();
            ASTEROIDS.Sound.startEngine();
            ASTEROIDS.Sound.startAmbient();
            this.soundStarted = true;
        }
        if (ASTEROIDS.Sound.uiStart) ASTEROIDS.Sound.uiStart();
        else if (ASTEROIDS.Sound.menuClick) ASTEROIDS.Sound.menuClick();
    }
    
    spawnAsteroids() {
        const baseCount = this.level.getAsteroidCount();
        const baseSpeed = this.level.getSpeedMult();
        const loop = this.loopLevel || 0;
        // Procedural difficulty: each cleared loop adds more/faster rocks
        const count = Math.min(baseCount + loop, 30);
        const speedMult = baseSpeed * (1 + loop * 0.2);
        this.asteroidManager.spawn(count, speedMult);
    }
    
    start() {
        if (!this._explosionSheetTexture) {
            this._explosionSheetTexture = new THREE.TextureLoader().load('assets/textures/explosion.png');
        }
        this.clock.start();
        this.animate();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());

        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.state === 'playing') {
            this.update(dt);
        } else if (this.state === 'menu' || this.state === 'paused' || this.state === 'gameover' || this.state === 'win') {
            if (this.level) this.level.update(dt * 0.35);
            this.updateCamera(dt);
        }

        this.render(dt);
    }
    
    update(dt) {
        // Update player
        this.player.update(dt, this.bullets);
        
        // Update bullets
        this.updateBullets(dt);
        
        // Update asteroids
        this.asteroidManager.update(dt);
        
        // Update loot (pass player for attraction particles)
        this.lootManager.update(dt, this.player);
        
        // Update level
        this.level.update(dt);
        
        // Update explosion particles
        this.updateExplosionParticles(dt);
        
        // Update debris particles
        this.updateDebrisParticles(dt);
        
        // Update explosion flash lights
        this.updateExplosionLights(dt);
        
        // Update spritesheet explosions
        this.updateExplosionSprites(dt);
        
        // Update smoke particles
        this.updateSmokeParticles(dt);
        
        // Update shield flashes
        this.updateShieldFlashes(dt);
        
        // Check bullet-asteroid collisions
        this.checkBulletAsteroidCollisions();
        
        // Check player-asteroid collisions
        this.checkPlayerAsteroidCollisions();
        
        // Check player-loot collisions
        this.lootManager.checkCollisions(this.player);
        
        // Check level progression
        if (!this.levelPendingSpawn && !this.level.isTransitioning() && this.asteroidManager.count() === 0) {
            const hasNext = this.level.nextLevel();
            if (hasNext) {
                this.levelPendingSpawn = true;
                setTimeout(() => {
                    this.levelPendingSpawn = false;
                    this.spawnAsteroids();
                    this.hud.showLevelName(this.level.getName(), this.level.getCurrentLevelNumber());
                    this.hud.showAniIntro(this.level.getCurrentLevelNumber());
                }, 2000);
            } else {
                this.win();
            }
        }
        
        // Update camera
        this.updateCamera(dt);
        
        // Update HUD
        this.hud.update(this.player, this.level, this.state);
    }
    
    updateBullets(dt) {
        for (var i = this.bullets.length - 1; i >= 0; i--) {
            var bullet = this.bullets[i];
            bullet.lifetime -= dt;
            if (bullet.lifetime <= 0) {
                this.bullets.splice(i, 1);
                continue;
            }
            bullet.position.x += bullet.velocity.x * dt;
            bullet.position.y += bullet.velocity.y * dt;
            bullet.position.z += bullet.velocity.z * dt;

            // Wrap bullets
            var size = ASTEROIDS.CONFIG.WORLD.SIZE;
            if (bullet.position.x > size) bullet.position.x = -size;
            if (bullet.position.x < -size) bullet.position.x = size;
            if (bullet.position.y > size) bullet.position.y = -size;
            if (bullet.position.y < -size) bullet.position.y = size;
        }
        // One InstancedMesh draw call per pool for every active bullet - no per-shot groups.
        if (this.bulletPool) this.bulletPool.sync(this.bullets);
    }
    
    // Recursive dispose helper for groups/meshes
    _disposeObject(obj) {
        if (!obj) return;
        obj.traverse(function(child) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(function(m) { m.dispose(); });
                } else {
                    child.material.dispose();
                }
            }
        });
    }
    
    checkBulletAsteroidCollisions() {
        const asteroids = this.asteroidManager.getAsteroids();
        
        for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
            const bullet = this.bullets[bi];
            let bulletHit = false;
            
            for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                const asteroid = asteroids[ai];
                const dist = bullet.position.distanceTo(asteroid.getPosition());
                
                if (dist < asteroid.getRadius() + 0.3) {
                    // Hit!
                    bulletHit = true;
                    
                    // Create split/children
                    const position = asteroid.getPosition().clone();
                    const children = asteroid.createSplit();
                    
                    // Add points
                    this.player.addScore(asteroid.points);
                    
                    // Loot drop check
                    if (asteroid.shouldDropLoot()) {
                        this.lootManager.spawnRandomLoot(position);
                    }
                    
                    // Explosion particles at asteroid position
                    this.createExplosion(position, asteroid.getRadius());
                    if (ASTEROIDS.Sound.asteroidSplit) ASTEROIDS.Sound.asteroidSplit();
                    else if (ASTEROIDS.Sound.explosionAt) ASTEROIDS.Sound.explosionAt(position.x, position.y);
                    
                    // Impact sparks at collision point
                    var hitNormal = bullet.velocity.clone().normalize().negate();
                    this.createImpactSparks(bullet.position.clone(), hitNormal);
                    
                    // Remove asteroid
                    this.asteroidManager.removeAsteroid(ai, this.scene);
                    
                    // Add children to scene and manager
                    for (const child of children) {
                        child.addToScene(this.scene);
                        this.asteroidManager.getAsteroids().push(child);
                    }
                    
                    break; // One bullet hits one asteroid
                }
            }
            
            if (bulletHit) {
                this.bullets.splice(bi, 1);
            }
        }
    }
    
    checkPlayerAsteroidCollisions() {
        if (this.player.dead || this.player.isInvulnerable()) return;
        
        const asteroids = this.asteroidManager.getAsteroids();
        const playerPos = this.player.getPosition();
        const playerRadius = this.player.getRadius();
        
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            const asteroid = asteroids[ai];
            const dist = playerPos.distanceTo(asteroid.getPosition());
            
            if (dist < playerRadius + asteroid.getRadius()) {
                // Impact sparks at collision point
                var collisionNormal = playerPos.clone().sub(asteroid.getPosition()).normalize();
                var impactPoint = asteroid.getPosition().clone().add(
                    collisionNormal.clone().multiplyScalar(asteroid.getRadius())
                );
                this.createImpactSparks(impactPoint, collisionNormal);
                
                // Shield-hit flash (blue translucent sphere)
                this.createShieldFlash(playerPos, playerRadius);
                
                const destroyed = this.player.takeDamage(30);
                // Push the ship away and grant a short grace window so an
                // overlapping rock can't chain 20-damage hits every frame.
                this.player.velocity.addScaledVector(collisionNormal, 10.0);
                this.player.invulnerable = Math.max(this.player.invulnerable, 0.75);
                var shakeConfig = ASTEROIDS.CONFIG.VISUAL;
                this.cameraShake.intensity = shakeConfig.CAMERA_SHAKE_INTENSITY || 1.0;
                this.cameraShake.duration = shakeConfig.CAMERA_SHAKE_DURATION || 0.3;
                
                if (destroyed) {
                    this.playerDied();
                }
                break; // Only one collision per frame
            }
        }
    }
    
    playerDied() {
        const canRespawn = this.player.die();
        
        if (!canRespawn) {
            this.gameOver();
            return;
        }
        
        // Respawn at center after short delay
        setTimeout(() => {
            this.player.spawn(0, 0, 0);
            if (ASTEROIDS.Sound.respawn) ASTEROIDS.Sound.respawn();
        }, 1500);
    }
    
    gameOver() {
        this.state = 'gameover';
        ASTEROIDS.Sound.stopEngine();
        ASTEROIDS.Sound.stopAmbient();
        if (ASTEROIDS.Sound.uiGameOver) ASTEROIDS.Sound.uiGameOver();
        this.hud.hideControls();
        this.hud.showControlsHint(false);
        this.hud.showGameOver(this.player.score);
    }
    
    win() {
        this.loopLevel = (this.loopLevel || 0) + 1;
        this.state = 'win';
        ASTEROIDS.Sound.stopEngine();
        ASTEROIDS.Sound.stopAmbient();
        if (ASTEROIDS.Sound.uiWin) ASTEROIDS.Sound.uiWin();
        this.hud.hideControls();
        this.hud.showControlsHint(false);
        this.hud.showLevelClear(this.loopLevel, this.player.score);
    }
    
    // Continue into the next difficulty loop (Enter on win screen)
    continueLoop() {
        this._cleanupEntities();
        this.level.reset();
        this.player.lives = ASTEROIDS.CONFIG.PLAYER.LIVES;
        this.player.spawn(0, 0, 0);
        this.hud.hideGameOver();
        this.hud.hideStart();
        this.hud.showPause(false);
        this.lookYaw = 0;
        this.lookPitch = 0.18;
        ASTEROIDS.Sound.stopEngine();
        ASTEROIDS.Sound.stopAmbient();
        ASTEROIDS.Sound.init();
        ASTEROIDS.Sound.startEngine();
        ASTEROIDS.Sound.startAmbient();
        this.soundStarted = true;
        this.state = 'playing';
        this.levelPendingSpawn = false;
        this.hud.hideControls();
        this.hud.showControlsHint(true);
        this.spawnAsteroids();
        var self = this;
        setTimeout(function() {
            self.hud.showLevelName(self.level.getName(), self.level.getCurrentLevelNumber());
            self.hud.showAniIntro(self.level.getCurrentLevelNumber());
        }, 400);
    }
    
    // Return to main menu from win screen (Backspace)
    returnToMenu() {
        this._cleanupEntities();
        this.loopLevel = 0;
        this.level.reset();
        this.player.lives = ASTEROIDS.CONFIG.PLAYER.LIVES;
        this.player.score = 0;
        this.player.spawn(0, 0, 0);
        this.hud.hideGameOver();
        this.hud.hideStart();
        this.hud.showPause(false);
        this.hud.showStart();
        this.hud.hideControls();
        this.hud.showControlsHint(false);
        this.lookYaw = 0;
        this.lookPitch = 0.18;
        ASTEROIDS.Sound.stopEngine();
        ASTEROIDS.Sound.stopAmbient();
        this.state = 'menu';
        this.levelPendingSpawn = false;
        this.spawnAsteroids();
    }
    
    _cleanupEntities() {
        var self = this;
        // Clean up bullets (data-only now; mesh is null, guard against remove(null))
        this.bullets.forEach(function(b) {
            if (b.mesh) { self._disposeObject(b.mesh); self.scene.remove(b.mesh); }
        });
        this.bullets = [];
        if (this.bulletPool) this.bulletPool.clear();
        
        this.asteroidManager.clear(this.scene);
        this.lootManager.clear(this.scene);
        
        // Clean up explosion particles
        this.explosionParticles.forEach(function(p) {
            self._disposeObject(p.mesh);
            self.scene.remove(p.mesh);
        });
        this.explosionParticles = [];
        
        // Clean up explosion flash lights
        this.explosionLights.forEach(function(el) {
            self.scene.remove(el.light);
        });
        this.explosionLights = [];
        
        // Clean up spritesheet explosion sprites (legacy array may hold old sprites)
        this.explosionSprites.forEach(function(es) {
            self.scene.remove(es.mesh);
            if (es.mesh.material.map) es.mesh.material.map.dispose();
            es.mesh.material.dispose();
        });
        this.explosionSprites = [];
        // Pooled sprites and smoke share one fixed object set - never remount/dispose,
        // just park them back until the next use (zero allocation after boot).
        if (this.explosionSpritePool) this.explosionSpritePool.clear();
        if (this.smokePool) this.smokePool.clear();
        if (this.player && this.player.particlePool) this.player.particlePool.clear();
        
        // Clean up debris particles
        this.debrisParticles.forEach(function(p) {
            self._disposeObject(p.mesh);
            self.scene.remove(p.mesh);
        });
        this.debrisParticles = [];
    }
    
    restart() {
        this._cleanupEntities();
        this.loopLevel = 0;
        
        this.level.reset();
        
        this.player.lives = ASTEROIDS.CONFIG.PLAYER.LIVES;
        this.player.score = 0;
        this.player.spawn(0, 0, 0);
        
        this.hud.hideGameOver();
        this.hud.hideStart();
        this.hud.showPause(false);
        this.lookYaw = 0;
        this.lookPitch = 0.18;

        ASTEROIDS.Sound.stopEngine();
        ASTEROIDS.Sound.stopAmbient();
        ASTEROIDS.Sound.init();
        ASTEROIDS.Sound.startEngine();
        ASTEROIDS.Sound.startAmbient();
        this.soundStarted = true;
        
        this.state = 'playing';
        this.levelPendingSpawn = false;
        this.hud.hideControls();
        this.hud.showControlsHint(true);
        this.spawnAsteroids();
        
        setTimeout(function() {
            self.hud.showLevelName(self.level.getName(), self.level.getCurrentLevelNumber());
            self.hud.showAniIntro(self.level.getCurrentLevelNumber());
        }, 400);
    }
    
    createExplosion(position, radius) {
        // Flash point light at explosion position
        var flashLight = new THREE.PointLight(0xffaa00, 15, 30);
        flashLight.position.copy(position);
        flashLight.position.z = 1;
        this.scene.add(flashLight);
        this.explosionLights.push({
            light: flashLight,
            life: 0.8,
            maxLife: 0.8
        });
        
        // Smoke particles (soft expanding cloud) - pooled sprites, zero per-explosion allocs.
        if (this.smokePool && this._sharedSmokeTexture) {
            var smokeCount = 12 + Math.floor(Math.random() * 8);
            for (var si = 0; si < smokeCount; si++) {
                var sp = this.smokePool.emit({
                    x: position.x + (Math.random() - 0.5) * radius,
                    y: position.y + (Math.random() - 0.5) * radius,
                    z: (position.z || 0) + (Math.random() - 0.5) * 2,
                    scale: 2 + Math.random() * 4,
                    opacity: 0.5 + Math.random() * 0.3,
                    life: 1.5 + Math.random() * 1.5,
                    maxLife: 2.0,
                    color: 0x261a0d,
                    blending: THREE.NormalBlending,
                    map: this._sharedSmokeTexture
                });
                if (sp) {
                    sp.userData.vx = (Math.random() - 0.5) * 1.5;
                    sp.userData.vy = (Math.random() - 0.5) * 1.5;
                    sp.userData.vz = (Math.random() - 0.5) * 0.3;
                }
            }
        }
        
        // Spritesheet explosion (5x5 grid, sequential frames top-left -> bottom-right)
        this._spawnExplosionSprite(position, radius);
        
        ASTEROIDS.Sound.explosion();
    }
    
    _spawnExplosionSprite(position, radius) {
        if (!this.explosionSpritePool) return;
        if (!this._explosionSheetTexture || !this._explosionSheetTexture.image) return;
        this.explosionSpritePool.sheet = this._explosionSheetTexture;
        this.explosionSpritePool.emit(position, radius);
    }

    updateExplosionSprites(dt) {
        var vfx = ASTEROIDS.CONFIG.VFX;
        var fps = vfx.EXPLOSION_SPRITE_FPS != null ? vfx.EXPLOSION_SPRITE_FPS : 45;
        if (this.explosionSpritePool) this.explosionSpritePool.update(dt, fps);
    }
    
    createImpactSparks(position, normal) {
        // Performance: mesh spark stubs were removed in favor of the spritesheet explosion.
        // Kept as a no-op to avoid touching call sites asynchronously during gameplay.
    }
    
    createShieldFlash(position, radius) {
        var shieldGeo = new THREE.SphereGeometry(radius + 1, 16, 16);
        var shieldMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        var shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.copy(position);
        shield.position.z = 0;
        this.scene.add(shield);
        this.shieldFlashes.push({
            mesh: shield,
            life: 0.3,
            maxLife: 0.3,
            baseScale: radius + 1
        });
    }
    
    updateShieldFlashes(dt) {
        for (var i = this.shieldFlashes.length - 1; i >= 0; i--) {
            var sf = this.shieldFlashes[i];
            sf.life -= dt;
            if (sf.life <= 0) {
                this.scene.remove(sf.mesh);
                sf.mesh.geometry.dispose();
                sf.mesh.material.dispose();
                this.shieldFlashes.splice(i, 1);
                continue;
            }
            var progress = sf.life / sf.maxLife;
            sf.mesh.material.opacity = progress * 0.6;
            sf.mesh.scale.setScalar(sf.baseScale + (1 - progress) * 5);
        }
    }
    
    updateExplosionParticles(dt) {
        for (var i = this.explosionParticles.length - 1; i >= 0; i--) {
            var p = this.explosionParticles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this._disposeObject(p.mesh);
                this.scene.remove(p.mesh);
                this.explosionParticles.splice(i, 1);
                continue;
            }
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = p.life / p.maxLife;
            p.mesh.scale.setScalar(p.life / p.maxLife);
        }
    }
    
    updateDebrisParticles(dt) {
        for (var i = this.debrisParticles.length - 1; i >= 0; i--) {
            var d = this.debrisParticles[i];
            d.life -= dt;
            if (d.life <= 0) {
                this._disposeObject(d.mesh);
                this.scene.remove(d.mesh);
                this.debrisParticles.splice(i, 1);
                continue;
            }
            d.mesh.position.add(d.velocity.clone().multiplyScalar(dt));
            // Tumble
            d.mesh.rotation.x += d.rotSpeed.x * dt;
            d.mesh.rotation.y += d.rotSpeed.y * dt;
            d.mesh.rotation.z += d.rotSpeed.z * dt;
            // Slow down
            d.velocity.multiplyScalar(0.98);
            // Fade out
            d.mesh.material.opacity = Math.min(1, d.life / (d.maxLife * 0.3));
            d.mesh.material.transparent = true;
        }
    }
    
    updateExplosionLights(dt) {
        for (var i = this.explosionLights.length - 1; i >= 0; i--) {
            var el = this.explosionLights[i];
            el.life -= dt;
            if (el.life <= 0) {
                this.scene.remove(el.light);
                this.explosionLights.splice(i, 1);
                continue;
            }
            // Fade intensity
            el.light.intensity = 8 * (el.life / el.maxLife);
        }
    }
    
    updateSmokeParticles(dt) {
        if (!this.smokePool) return;
        this.smokePool.update(dt, function(s, ddt) {
            s.position.x += (s.userData.vx || 0) * ddt;
            s.position.y += (s.userData.vy || 0) * ddt;
            s.position.z += (s.userData.vz || 0) * ddt;
            var fade = Math.max(0, s.userData.life / (s.userData.maxLife || 2.0));
            s.material.opacity = fade * 0.6;
            var grow = 1 + ddt * 0.8;
            s.scale.x *= grow;
            s.scale.y *= grow;
        });
    }
    
    updateCamera(dt) {
        if (!this.player) return;

        var playerPos = this.player.getPosition();
        var visConfig = ASTEROIDS.CONFIG.VISUAL;
        var worldConfig = ASTEROIDS.CONFIG.WORLD;

        // Keyboard free-look (Q/E yaw, R/F pitch)
        var lookSpeed = (visConfig.CAMERA_LOOK_SPEED || 1.6) * dt;
        var yawMax = visConfig.CAMERA_LOOK_YAW_MAX || 1.15;
        var pitchMax = visConfig.CAMERA_LOOK_PITCH_MAX || 0.65;
        if (this._lookKeys['q']) this.lookYaw += lookSpeed;
        if (this._lookKeys['e']) this.lookYaw -= lookSpeed;
        if (this._lookKeys['r']) this.lookPitch += lookSpeed * 0.85;
        if (this._lookKeys['f']) this.lookPitch -= lookSpeed * 0.85;
        this.lookYaw = Math.max(-yawMax, Math.min(yawMax, this.lookYaw));
        this.lookPitch = Math.max(-pitchMax, Math.min(pitchMax, this.lookPitch));

        // Slow auto-recenter when not actively looking
        var looking = this._mouseLook || this._lookKeys['q'] || this._lookKeys['e'] || this._lookKeys['r'] || this._lookKeys['f'];
        if (!looking && this.state === 'playing') {
            this.lookYaw *= (1 - Math.min(1, 0.65 * dt));
            this.lookPitch += (0.18 - this.lookPitch) * Math.min(1, 0.5 * dt);
        }

        var shipDir = new THREE.Vector3(0, 1, 0).applyAxisAngle(
            new THREE.Vector3(0, 0, 1), this.player.rotation || 0
        );

        // Orbit offset from ship with free-look
        var dist = worldConfig.CAMERA_DISTANCE || 28;
        var height = worldConfig.CAMERA_HEIGHT || 10;
        var offset = new THREE.Vector3(0, -dist * 0.15, dist);
        offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.lookPitch);
        offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.lookYaw + (this.player.rotation || 0) * 0.15);

        var targetPos = playerPos.clone().add(offset);
        targetPos.z = Math.max(12, targetPos.z + height * 0.15);

        var lerpFactor = Math.min(1, (visConfig.CAMERA_LERP || 4) * dt);
        this.camera.position.lerp(targetPos, lerpFactor);

        this._idleBobTimer += dt * (visConfig.CAMERA_IDLE_BOB_FREQ || 0.45);
        this.camera.position.z += Math.sin(this._idleBobTimer) * (visConfig.CAMERA_IDLE_BOB_AMP || 0.22);

        var lookTarget = playerPos.clone()
            .addScaledVector(shipDir, visConfig.CAMERA_FORWARD_OFFSET || 2);
        lookTarget.x += Math.sin(this.lookYaw) * 6;
        lookTarget.y += Math.sin(this.lookYaw * 0.5) * 2;
        lookTarget.z = Math.sin(this.lookPitch) * 8;

        this.camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);

        // Soft boost FOV: peak only during the short lunge, ease off through the
        // apex hold, then settle home. Avoids the old hard 58→78 whip.
        var baseFov = visConfig.CAMERA_BASE_FOV || 58;
        var boostFov = visConfig.CAMERA_BOOST_FOV || 64;
        var fovIn = (typeof visConfig.CAMERA_FOV_LERP_IN === 'number') ? visConfig.CAMERA_FOV_LERP_IN : 3.2;
        var fovOut = (typeof visConfig.CAMERA_FOV_LERP_OUT === 'number') ? visConfig.CAMERA_FOV_LERP_OUT : 2.4;
        var targetFov = baseFov;
        var p = this.player;
        if (p) {
            var lungeT = 0;
            var holdT = 0;
            var lungeMax = (ASTEROIDS.CONFIG.PLAYER && ASTEROIDS.CONFIG.PLAYER.BOOST_DURATION) || 0.28;
            var holdMax = (ASTEROIDS.CONFIG.PLAYER && ASTEROIDS.CONFIG.PLAYER.BOOST_HOLD_DURATION) || 0.6;
            if (p.boostActiveTime > 0 && lungeMax > 0) {
                // Full boost FOV only while lunging forward
                lungeT = Math.min(1, p.boostActiveTime / lungeMax);
                // Bias toward peak at start of lunge for a gentle punch, not a slam
                targetFov = baseFov + (boostFov - baseFov) * (0.55 + 0.45 * lungeT);
            } else if (p.boostHoldTime > 0 && holdMax > 0) {
                // Ease FOV halfway back during the apex hold so return isn't a snap
                holdT = Math.min(1, p.boostHoldTime / holdMax);
                var holdFov = baseFov + (boostFov - baseFov) * 0.35 * holdT;
                targetFov = holdFov;
            }
        }
        var fovLerp = (targetFov > this.camera.fov) ? fovIn : fovOut;
        var k = 1 - Math.exp(-fovLerp * dt);
        this.camera.fov += (targetFov - this.camera.fov) * k;
        this.camera.updateProjectionMatrix();

        if (this.backLight) {
            this.backLight.position.set(playerPos.x - shipDir.x * 4, playerPos.y - shipDir.y * 4, 6);
        }

        if (this.cameraShake && this.cameraShake.duration > 0) {
            this.cameraShake.duration -= dt;
            var shake = this.cameraShake.intensity * (this.cameraShake.duration / 0.3);
            this.camera.position.x += (Math.random() - 0.5) * shake;
            this.camera.position.y += (Math.random() - 0.5) * shake;
        }
    }
    
    render(dt) {
        // Update post-processing uniforms based on boost state
        var boosting = this.player && this.player.boostActiveTime > 0;
        if (boosting) {
            // Radial blur during boost
            if (this.radialBlurPass) {
                this.radialBlurPass.uniforms.blurAmount.value = ASTEROIDS.CONFIG.VFX.RADIAL_BLUR_BOOST;
            }
            // Chromatic aberration boost
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.uniforms.amount.value = ASTEROIDS.CONFIG.VFX.CHROMATIC_ABERRATION * ASTEROIDS.CONFIG.VFX.CHROMATIC_BOOST_MULT;
            }
        } else {
            // Reset to defaults
            if (this.radialBlurPass) {
                this.radialBlurPass.uniforms.blurAmount.value = 0;
            }
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.uniforms.amount.value = ASTEROIDS.CONFIG.VFX.CHROMATIC_ABERRATION;
            }
        }
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
};

// Entry point - wait for page load
window.addEventListener('load', () => {
    const game = new ASTEROIDS.Game();
    game.init();
    window._game = game; // For debugging
});
