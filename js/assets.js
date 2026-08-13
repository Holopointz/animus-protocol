// Modern Asteroids - Centralized Asset Preloader + Master Materials + Instanced Pools
// Loads every GLB model and texture exactly once at boot, then hands out cached
// references so gameplay never performs a loader/create/clone hit. Canisters are
// baked into three shared material groups (Plasma, Glass, Shell) and rendered
// through ONE InstancedMesh. Bullets are pooled through InstancedMesh too.

var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

// Legacy-r128-safe geometry merge (no dependency on THREE.BufferGeometryUtils).
// Merges an array of BufferGeometries with matching attribute sets into one.
ASTEROIDS.mergeGeometries = function(geos) {
    if (!geos || !geos.length) return null;
    if (geos.length === 1) return geos[0];
    var out = new THREE.BufferGeometry();
    var attrNames = [];
    for (var name in geos[0].attributes) {
        if (geos[0].attributes.hasOwnProperty(name)) attrNames.push(name);
    }
    var merged = {};
    var indexOffsets = [];
    var totalVerts = 0;
    var maxIndex = 0;
    for (var g = 0; g < geos.length; g++) {
        totalVerts += geos[g].attributes.position.count;
        if (geos[g].index) maxIndex += geos[g].index.count;
    }
    for (var n = 0; n < attrNames.length; n++) {
        var an = attrNames[n];
        merged[an] = [];
    }
    var outIndex = [];
    var vertOffset = 0;
    for (var gi = 0; gi < geos.length; gi++) {
        var geo = geos[gi];
        for (var an2 = 0; an2 < attrNames.length; an2++) {
            var attr = geo.attributes[attrNames[an2]];
            if (!attr) continue;
            var arr = attr.array;
            for (var v = 0; v < arr.length; v++) merged[attrNames[an2]].push(arr[v]);
        }
        if (geo.index) {
            var idx = geo.index.array;
            for (var ii = 0; ii < idx.length; ii++) outIndex.push(idx[ii] + vertOffset);
        }
        vertOffset += geo.attributes.position.count;
    }
    for (var n2 = 0; n2 < attrNames.length; n2++) {
        var an3 = attrNames[n2];
        var srcAttr = geos[0].attributes[an3];
        out.setAttribute(an3, new THREE.BufferAttribute(new Float32Array(merged[an3]), srcAttr.itemSize));
    }
    if (outIndex.length) out.setIndex(new THREE.BufferAttribute(new Uint32Array(outIndex), 1));
    out.computeBoundingSphere();
    return out;
};

ASTEROIDS.Assets = {
    ready: false,
    textures: {},
    models: {},
    modelsReady: {},
    _loading: false,
    _callbacks: [],

    // Kick off every network load immediately. Non-blocking; call loadAll() as
    // early as possible so every asset is already in memory by the time the
    // player presses Start.
    loadAll: function(cb) {
        if (cb) this._callbacks.push(cb);
        if (this.ready) { this._callbacks.forEach(function(f) { f && f(); }); this._callbacks = []; return; }
        if (this._loading) return;
        this._loading = true;

        var self = this;
        var texLoader = new THREE.TextureLoader();
        var gltfLoader = new THREE.GLTFLoader();
        var pending = 0;
        var finished = false;
        var done = function() {
            pending--;
            if (pending <= 0 && !finished) {
                finished = true;
                self.ready = true;
                try {
                    ASTEROIDS.Materials._applySharedTextures();
                    self._buildCanisterParts();
                } catch (err) {
                    console.error('Asset material build failed:', err);
                }
                self._callbacks.forEach(function(f) { f && f(); });
                self._callbacks = [];
            }
        };
        var loadTex = function(key, path, opts) {
            pending++;
            opts = opts || {};
            var t = texLoader.load(path, function() {
                self.textures[key] = t;
                done();
            }, undefined, function(err) {
                console.error('Asset preload failed: ' + path, err);
                done();
            });
            if (opts.flipY === false) t.flipY = false;
            if (opts.srgb) {
                if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
                else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
            }
            if (opts.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat); }
        };
        var loadModel = function(key, path) {
            pending++;
            gltfLoader.load(path, function(gltf) {
                self.models[key] = gltf.scene;
                self.modelsReady[key] = true;
                done();
            }, undefined, function(err) {
                console.error('Asset preload failed: ' + path, err);
                done();
            });
        };

        var levels = ASTEROIDS.CONFIG ? ASTEROIDS.CONFIG.LEVELS : [];
        var planetTex = {};
        for (var i = 0; i < levels.length; i++) {
            if (levels[i].texture) planetTex[levels[i].texture] = true;
            if (levels[i].cloudTexture) planetTex[levels[i].cloudTexture] = true;
        }
        planetTex['2k_saturn_ring_alpha.png'] = true;

        // Every texture the game touches, loaded exactly once.
        loadTex('canisterDiffuse', 'assets/textures/difuse_canister.png', { flipY: false, srgb: true });
        loadTex('canisterNormal', 'assets/textures/normal_canister.jpg', { flipY: false });
        loadTex('canisterRough', 'assets/textures/roughness_canister.png', { flipY: false });
        loadTex('explosionSheet', 'assets/textures/explosion.png');
        loadTex('asteroidDiffuse', 'assets/textures/Asteroid_surface_diffuse_map.jpg', { repeat: 2 });
        loadTex('asteroidNormal', 'assets/textures/Asteroid_surface_normal_map.jpg', { repeat: 2 });
        loadTex('playerDiffuse', 'assets/textures/Diffuse_animus_hull.jpeg');
        loadTex('playerNormal', 'assets/textures/Normal_animus_hull.jpg');
        loadTex('playerSpecular', 'assets/textures/Specular_animus_hull.jpg');
        for (var key in planetTex) {
            if (planetTex.hasOwnProperty(key)) loadTex('planet_' + key, 'assets/textures/' + key);
        }

        // GLB models, loaded exactly once at boot.
        loadModel('canister', 'assets/models/shield_canister.glb?v=51');
        loadModel('ship', 'assets/models/spaceship.glb');
    },

    texture: function(key) {
        return this.textures[key] || null;
    },

    // Build the three baked canister geometries from the loaded GLB. Parts are
    // indexed to match masterMaterials: 0 plasma, 1 glass, 2 shell.
    canisterParts: [null, null, null],
    canisterLoaded: false,
    _buildCanisterParts: function() {
        if (this.canisterLoaded || !this.modelsReady['canister']) return;
        var root = this.models['canister'];
        var parts = [[], [], []];
        root.traverse(function(child) {
            if (!child.isMesh || !child.geometry) return;
            var name = ((child.name || '') + ' ' + ((child.material && child.material.name) || '')).toLowerCase();
            var idx;
            if (name.indexOf('plasma') !== -1) idx = 0;
            else if (name.indexOf('glass') !== -1) idx = 1;
            else idx = 2;
            var g = child.geometry.clone();
            g.applyMatrix4(child.matrixWorld);
            // Bake the 'lay it sideways' orientation into the geometry itself.
            // Rotating the InstancedMesh object instead would rotate the shared
            // translation space and collapse every instance's world Y to ~0.
            g.rotateX(Math.PI / 2);
            g.computeBoundingSphere();
            parts[idx].push(g);
        });
        this.canisterParts = parts.map(function(arr) {
            return ASTEROIDS.mergeGeometries(arr);
        });
        this.canisterLoaded = true;
    }
};

// Master material registry: [ Plasma, Glass, Shell ]. These exact THREE
// material references are shared by EVERY canister mesh instance - no clones,
// no per-spawn material creation.
ASTEROIDS.Materials = {
    master: [null, null, null],
    food: null,
    scrap: null,
    bulletCyl: null,
    bulletTip: null,

    // Synchronous: builds the shared materials immediately so pools can exist
    // before async textures finish. Missing maps are applied by
    // _applySharedTextures once Assets.loadAll completes.
    _ensureBasic: function() {
        var plasma = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x00aaff,
            emissiveIntensity: 1.6,
            roughness: 0.15,
            metalness: 0.0,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            toneMapped: false
        });
        plasma.name = 'plasma_master';

        var glass = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            emissive: 0x66ddff,
            emissiveIntensity: 0.2,
            metalness: 0.0,
            roughness: 0.12,
            transmission: 0.55,
            transparent: true,
            opacity: 0.26,
            depthWrite: false,
            toneMapped: false
        });
        glass.name = 'glass_master';

        var shell = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: null,
            normalMap: null,
            roughnessMap: null,
            normalScale: new THREE.Vector2(1, 1),
            metalness: 0.2,
            roughness: 1.0,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            toneMapped: false,
            depthWrite: true
        });
        shell.name = 'shell_master';

        this.master = [plasma, glass, shell];

        // Food / scrap body materials - shared, never recreated per spawn.
        this.food = new THREE.MeshStandardMaterial({
            color: 0x44ff66,
            emissive: 0x44ff66,
            emissiveIntensity: 1.5,
            roughness: 0.3,
            metalness: 0.1
        });
        this.scrap = new THREE.MeshStandardMaterial({
            color: 0xcc9944,
            emissive: 0x442211,
            emissiveIntensity: 0.4,
            roughness: 0.7,
            metalness: 0.5
        });

        this.bulletCyl = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 2.4,
            roughness: 0.15,
            metalness: 0.1
        });
        this.bulletTip = new THREE.MeshBasicMaterial({ color: 0xffffff });

        if (window.ASTEROIDS.envMap) this.refreshEnvMap();
    },

    refreshEnvMap: function() {
        var env = window.ASTEROIDS.envMap;
        if (!env || !this.master) return;
        var m = this.master;
        if (m[0]) { m[0].envMap = env; m[0].envMapIntensity = 0.6; }
        if (m[1]) { m[1].envMap = env; m[1].envMapIntensity = 1.15; }
        if (m[2]) { m[2].envMap = env; m[2].envMapIntensity = 1.0; }
        for (var i = 0; i < m.length; i++) if (m[i]) m[i].needsUpdate = true;
    },

    // Called once after Assets preload completes: binds the cached canister
    // textures onto the SAME shared materials, never recreating them.
    _applySharedTextures: function() {
        if (!this.master || !this.master[2]) this._ensureBasic();
        var A = ASTEROIDS.Assets;
        var shell = this.master[2];
        shell.map = A.textures['canisterDiffuse'] || shell.map;
        shell.normalMap = A.textures['canisterNormal'] || shell.normalMap;
        shell.roughnessMap = A.textures['canisterRough'] || shell.roughnessMap;
        shell.needsUpdate = true;
        if (window.ASTEROIDS.envMap) this.refreshEnvMap();
    }
};

// Instanced bullet pool. One draw call for every active bullet; data-only
// bullets live in Game.bullets. Body and white tip are separate InstancedMeshes
// so we keep the original two-material look without per-shot allocations.
ASTEROIDS.BulletPool = class BulletPool {
    constructor(scene) {
        this.scene = scene;
        this.capacity = 256;

        var cyl = new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6);
        var tip = new THREE.SphereGeometry(0.11, 6, 6);
        tip.translate(0, 0.4, 0);
        this.cylGeo = cyl;
        this.tipGeo = tip;

        this.mesh = new THREE.InstancedMesh(cyl, ASTEROIDS.Materials.bulletCyl, this.capacity);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);

        this.tipMesh = new THREE.InstancedMesh(tip, ASTEROIDS.Materials.bulletTip, this.capacity);
        this.tipMesh.frustumCulled = false;
        this.tipMesh.count = 0;
        this.tipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.tipMesh);

        this._dummy = new THREE.Object3D();
        this._dummy.scale.set(0, 0, 0);
        this._clearAll();
    }

    _clearAll() {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        for (var i = 0; i < this.capacity; i++) {
            this.mesh.setMatrixAt(i, this._dummy.matrix);
            this.tipMesh.setMatrixAt(i, this._dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.tipMesh.instanceMatrix.needsUpdate = true;
    }

    ensure(capacity) {
        if (capacity <= this.capacity) return;
        var old = this.mesh;
        var oldTip = this.tipMesh;
        this.capacity = Math.max(this.capacity * 2, capacity);
        this.mesh = new THREE.InstancedMesh(this.cylGeo, ASTEROIDS.Materials.bulletCyl, this.capacity);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.tipMesh = new THREE.InstancedMesh(this.tipGeo, ASTEROIDS.Materials.bulletTip, this.capacity);
        this.tipMesh.frustumCulled = false;
        this.tipMesh.count = 0;
        this.tipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.remove(old);
        this.scene.remove(oldTip);
        this.scene.add(this.mesh);
        this.scene.add(this.tipMesh);
        this._clearAll();
    }

    sync(bullets) {
        var n = bullets.length;
        this.ensure(n);
        this.mesh.count = n;
        this.tipMesh.count = n;
        var d = this._dummy;
        for (var i = 0; i < n; i++) {
            var b = bullets[i];
            d.position.copy(b.position);
            d.rotation.set(0, 0, Math.atan2(-b.velocity.x, b.velocity.y));
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            this.mesh.setMatrixAt(i, d.matrix);
            this.tipMesh.setMatrixAt(i, d.matrix);
        }
        for (var j = n; j < this.capacity; j++) {
            d.scale.set(0, 0, 0);
            d.updateMatrix();
            this.mesh.setMatrixAt(j, d.matrix);
            this.tipMesh.setMatrixAt(j, d.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.tipMesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
        this.mesh.count = 0;
        this.tipMesh.count = 0;
        this._clearAll();
    }
};

// Pooled sprites for trails/particles/smoke. Sprites and their materials are
// created once up to `capacity`, then reused - zero per-frame allocations.
ASTEROIDS.SpritePool = class SpritePool {
    constructor(scene, capacity, texture) {
        this.scene = scene;
        this.capacity = capacity || 256;
        this.free = [];
        this.active = [];
        this.baseTexture = texture || null;
        this.group = new THREE.Group();
        scene.add(this.group);
        for (var i = 0; i < this.capacity; i++) {
            this.free.push(this._create());
        }
    }

    _create() {
        var mat = new THREE.SpriteMaterial({
            map: this.baseTexture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0,
            color: 0xffffff
        });
        var sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        this.group.add(sprite);
        return sprite;
    }

    // Reuse a hidden sprite. Returns null when exhausted (caller can skip).
    emit(opts) {
        if (!this.free.length) return null;
        var sprite = this.free.pop();
        var mat = sprite.material;
        mat.map = opts.map || this.baseTexture || mat.map;
        mat.blending = opts.blending !== undefined ? opts.blending : THREE.AdditiveBlending;
        mat.opacity = opts.opacity !== undefined ? opts.opacity : 1;
        mat.color.setHex(opts.color !== undefined ? opts.color : 0xffffff);
        mat.needsUpdate = true;
        sprite.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
        var s = opts.scale !== undefined ? opts.scale : 1;
        sprite.scale.set(s, s, 1);
        sprite.visible = true;
        sprite.userData.life = opts.life !== undefined ? opts.life : 0;
        sprite.userData.maxLife = opts.maxLife !== undefined ? opts.maxLife : opts.life || 1;
        this.active.push(sprite);
        return sprite;
    }

    release(sprite) {
        sprite.visible = false;
        sprite.material.opacity = 0;
        var idx = this.active.indexOf(sprite);
        if (idx !== -1) this.active.splice(idx, 1);
        this.free.push(sprite);
    }

    update(dt, cb) {
        for (var i = this.active.length - 1; i >= 0; i--) {
            var s = this.active[i];
            if (s.userData.life <= 0) { this.release(s); continue; }
            s.userData.life -= dt;
            if (cb) cb(s, dt);
            if (s.userData.life <= 0) { this.release(s); }
        }
    }

    clear() {
        for (var i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]);
    }

    dispose() {
        this.clear();
        this.scene.remove(this.group);
        for (var i = 0; i < this.free.length; i++) {
            if (this.free[i].material.map) this.free[i].material.map.dispose();
            this.free[i].material.dispose();
        }
    }
};

// Pooled spritesheet explosions. Each slot keeps its own Texture built from the
// shared sheet image so simultaneous blasts have independent frame offsets,
// but no texture/material/sprite object is allocated per explosion.
ASTEROIDS.ExplosionSpritePool = class ExplosionSpritePool {
    constructor(scene, slots) {
        this.scene = scene;
        this.slots = slots || 24;
        this.pool = [];
        this.active = [];
        this.group = new THREE.Group();
        scene.add(this.group);
        this.cols = 5;
        this.rows = 5;
        this.sheet = null;
    }

    attachSheet(tex) {
        this.sheet = tex;
        if (!tex || !tex.image || this.pool.length) return;
        for (var i = 0; i < this.slots; i++) {
            var map = new THREE.Texture(tex.image);
            map.needsUpdate = true;
            map.wrapS = THREE.ClampToEdgeWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.magFilter = THREE.LinearFilter;
            map.minFilter = THREE.LinearFilter;
            map.generateMipmaps = false;
            map.repeat.set(1 / this.cols, 1 / this.rows);
            map.offset.set(0, 0);
            var mat = new THREE.SpriteMaterial({
                map: map,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true
            });
            var sprite = new THREE.Sprite(mat);
            sprite.visible = false;
            this.group.add(sprite);
            this.pool.push(sprite);
        }
    }

    emit(position, radius, baseScale) {
        this.attachSheet(this.sheet);
        if (!this.pool.length) return;
        var sprite = this.pool.pop();
        sprite.visible = true;
        sprite.position.copy(position);
        sprite.position.z += 2;
        var size = (baseScale || 10) * 0.6 + radius * 0.8;
        sprite.scale.set(size, size, 1);
        // Start on the top-left frame of the 5x5 sheet.
        sprite.material.map.offset.set(0, 1 - 1 / this.rows);
        sprite.userData.frame = 0;
        sprite.userData.timer = 0;
        this.active.push(sprite);
    }

    update(dt, fps) {
        var totalFrames = this.cols * this.rows;
        var dur = 1 / (fps || 45);
        for (var i = this.active.length - 1; i >= 0; i--) {
            var s = this.active[i];
            s.userData.timer += dt;
            var advanced = false;
            while (s.userData.timer >= dur) {
                s.userData.timer -= dur;
                s.userData.frame++;
                advanced = true;
                if (s.userData.frame >= totalFrames) { advanced = false; break; }
            }
            if (advanced) {
                var col = s.userData.frame % this.cols;
                var row = Math.floor(s.userData.frame / this.cols);
                s.material.map.offset.set(col / this.cols, 1 - (row + 1) / this.rows);
            } else if (s.userData.frame >= totalFrames) {
                s.visible = false;
                this.active.splice(i, 1);
                this.pool.push(s);
            }
        }
    }

    clear() {
        for (var i = this.active.length - 1; i >= 0; i--) {
            this.active[i].visible = false;
            this.pool.push(this.active[i]);
        }
        this.active = [];
    }

    dispose() {
        this.clear();
        this.scene.remove(this.group);
        for (var i = 0; i < this.pool.length; i++) {
            if (this.pool[i].material.map) this.pool[i].material.map.dispose();
            this.pool[i].material.dispose();
        }
    }
};

// Build shared materials immediately (synchronously) so BulletPool and loot
// pools can be created before async textures finish.
ASTEROIDS.Materials._ensureBasic();

// Start the global preload at boot: all GLBs + textures load exactly once.
if (typeof window !== 'undefined' && ASTEROIDS.CONFIG) {
    ASTEROIDS.Assets.loadAll();
}
