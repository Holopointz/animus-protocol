// Modern Asteroids - Loot System (InstancedMesh optimized)
// Loot items are pure data (position/velocity/lifetime). Rendering is done by
// InstancedMesh pools that share the master Plasma/Glass/Shell materials and a
// handful of shared food/scrap materials - zero per-spawn GLB clones, zero
// per-spawn texture loads, zero per-spawn material allocations.
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.LootItem = class LootItem {
    constructor(type, position) {
        this.type = type;
        this.x = position ? position.x : 0;
        this.y = position ? position.y : 0;
        this.z = position ? position.z : 0;
        this.lifetime = ASTEROIDS.CONFIG.LOOT.LIFETIME;
        this.maxLifetime = this.lifetime;
        this.collected = false;

        // Drift velocity
        this.vx = (Math.random() - 0.5) * ASTEROIDS.CONFIG.LOOT.DRIFT_SPEED;
        this.vy = (Math.random() - 0.5) * ASTEROIDS.CONFIG.LOOT.DRIFT_SPEED;

        // Pulse / bob animation
        this.pulseOffset = Math.random() * Math.PI * 2;
        this.bobTimer = Math.random() * Math.PI * 2;
        this.baseY = this.y;

        // Tumble rate for canister-style pickups
        this.rotX = (Math.random() - 0.5) * 2;
        this.rotY = (Math.random() - 0.5) * 2;
        this.rotZ = 0;

        // Attraction particle throttle
        this._attractTimer = Math.random() * 0.4;

        // Reusable vector for collision queries (avoids per-call allocation)
        this._vec = new THREE.Vector3(this.x, this.y, this.z);
        this._index = -1;
    }

    addToScene(scene) {
        // Rendering is centralized in LootRenderer; kept as a no-op so the
        // old manager API remains compatible with any external callers.
    }

    removeFromScene(scene) {
        // Rendering is centralized in LootRenderer; the item is freed by
        // shrinking the active list, not by scene removal.
    }

    update(dt, playerPos) {
        if (this.collected) return;

        // Drift
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Wrap around
        var size = ASTEROIDS.CONFIG.WORLD.SIZE;
        if (this.x > size) this.x = -size;
        if (this.x < -size) this.x = size;
        if (this.y > size) this.y = -size;
        if (this.y < -size) this.y = size;

        // Bobbing animation (subtle y-axis oscillation around the base)
        this.bobTimer += dt * 3;
        this.y = this.baseY + Math.sin(this.bobTimer) * 0.2;

        // Pulse + tumble
        this.pulseOffset += dt * 3;
        this.rotX += dt * 1.5;
        this.rotY += dt * 2;

        this.lifetime -= dt;
    }

    getPosition() {
        this._vec.set(this.x, this.y, this.z);
        return this._vec;
    }

    isExpired() {
        return this.lifetime <= 0 || this.collected;
    }

    getPoints() {
        var config = ASTEROIDS.CONFIG.LOOT;
        switch (this.type) {
            case 'battery': return config.BATTERY_POINTS;
            case 'food': return config.FOOD_POINTS;
            case 'scrap': return config.SCRAP_POINTS;
            default: return 0;
        }
    }

    applyEffect(player) {
        var config = ASTEROIDS.CONFIG.LOOT;
        switch (this.type) {
            case 'battery': player.repairShield(config.BATTERY_SHIELD); break;
            case 'scrap': player.heal(config.SCRAP_HEAL); break;
            case 'food': player.foodBuffTimer = config.FOOD_DURATION; break;
        }
    }
};

// Shared small sprite texture for attraction particle streams (created once).
ASTEROIDS.LootItem._smallSpriteTex = null;
ASTEROIDS.LootItem.createSmallSprite = function() {
    if (ASTEROIDS.LootItem._smallSpriteTex) return ASTEROIDS.LootItem._smallSpriteTex;
    var canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 16, 16);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    ASTEROIDS.LootItem._smallSpriteTex = tex;
    return tex;
};

// InstancedMesh renderer for every loot type. The canister (battery) shares the
// master Plasma/Glass/Shell materials on baked GLB geometry; food/scrap use a
// handful of shared materials. Attraction streams reuse a SpritePool.
ASTEROIDS.LootRenderer = class LootRenderer {
    constructor(scene) {
        this.scene = scene;
        // Fixed InstancedMesh buffer cap. Three.js r128 Cannot resize buffers in
        // place, so we allocate generously and clamp indices instead of growing.
        this.capacity = 256;
        this.group = new THREE.Group();
        scene.add(this.group);

        this.batteries = [];   // InstancedMeshes aligned with Materials.master
        this.batteryBuilt = false;
        this.foodMeshes = {};
        this.scrapMeshes = {};
        this._instanced = [];  // every InstancedMesh owned by this renderer (for resize)

        this._dummy = new THREE.Object3D();
        this._dummy.scale.set(0, 0, 0);

        this.attractPool = null;

        this._buildCommon();
    }

    _inst(geo, mat, capacity, isBattery) {
        var rec = {
            geo: geo,
            mat: mat,
            battery: !!isBattery,
            mesh: null
        };
        rec.mesh = this._createInst(rec, capacity || this.capacity);
        this._instanced.push(rec);
        return rec.mesh;
    }

    _createInst(rec, capacity) {
        var mesh = new THREE.InstancedMesh(rec.geo, rec.mat, capacity);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (rec.battery) {
            mesh.rotation.set(Math.PI / 2, 0, 0);
            mesh.scale.set(6, 6, 6);
        }
        this.group.add(mesh);
        return mesh;
    }

    // Note: InstancedMesh buffers are fixed in r128 and never resized. sync()
    // clamps the active draw count to this.capacity instead of growing buffers.

    _buildCommon() {
        var foodGeo = new THREE.SphereGeometry(0.25, 12, 12);
        var torusGeo = new THREE.TorusGeometry(0.4, 0.06, 8, 16);
        var glowGeo = new THREE.SphereGeometry(0.6, 8, 8);
        var scrapGeo = new THREE.IcosahedronGeometry(0.35, 1);
        var scrapGlowGeo = new THREE.SphereGeometry(0.5, 8, 8);
        this._geos = { foodGeo: foodGeo, torusGeo: torusGeo, glowGeo: glowGeo, scrapGeo: scrapGeo, scrapGlowGeo: scrapGlowGeo };

        // Shared food/scrap part materials (created once, shared by every item).
        var foodRingMat = new THREE.MeshStandardMaterial({
            color: 0x66ff88,
            emissive: 0x44ff66,
            emissiveIntensity: 1.0,
            roughness: 0.3,
            metalness: 0.1
        });
        var foodGlowMat = new THREE.MeshBasicMaterial({
            color: 0x44ff66,
            transparent: true,
            opacity: 0.3
        });
        var scrapGlowMat = new THREE.MeshBasicMaterial({
            color: 0xcc9944,
            transparent: true,
            opacity: 0.3
        });
        this._foodRingMat = foodRingMat;
        this._foodGlowMat = foodGlowMat;
        this._scrapGlowMat = scrapGlowMat;

        this.foodMeshes = {
            body: this._inst(foodGeo, ASTEROIDS.Materials.food),
            ring: this._inst(torusGeo, foodRingMat),
            glow: this._inst(glowGeo, foodGlowMat)
        };
        this.scrapMeshes = {
            body: this._inst(scrapGeo, ASTEROIDS.Materials.scrap),
            glow: this._inst(scrapGlowGeo, scrapGlowMat)
        };

        // Placeholder battery (cylinder) used until the canister GLB parts are
        // baked. Reuses the shared plasma master material - no per-item alloc.
        var phGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.1, 10);
        phGeo.rotateX(Math.PI / 2);
        this.placeholder = this._inst(phGeo, ASTEROIDS.Materials.master[0]);

        this.attractPool = new ASTEROIDS.SpritePool(this.group, 16, ASTEROIDS.LootItem.createSmallSprite());
    }

    _ensureBattery() {
        if (this.batteryBuilt || !ASTEROIDS.Assets.canisterLoaded) return false;
        var parts = ASTEROIDS.Assets.canisterParts;
        var masters = ASTEROIDS.Materials.master;
        for (var i = 0; i < 3; i++) {
            if (!parts[i] || !masters[i]) {
                this.batteries.push(null);
                continue;
            }
            var m = new THREE.InstancedMesh(parts[i], masters[i], this.capacity);
            m.frustumCulled = false;
            m.count = 0;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // Match the original loader: lay canister sideways + 6x pickup scale.
            m.rotation.set(Math.PI / 2, 0, 0);
            m.scale.set(6, 6, 6);
            this.group.add(m);
            this.batteries.push(m);
        }
        this.group.remove(this.placeholder);
        this.placeholder = null;
        this.batteryBuilt = true;
        return true;
    }

    _apply(item, mesh) {
        if (!mesh || item._index >= this.capacity) return;
        var d = this._dummy;
        d.position.set(item.x, item.y, item.z || 0);
        d.rotation.set(item.rotX, item.rotY, item.rotZ);
        var s = 1 + Math.sin(item.pulseOffset) * 0.2;
        if (mesh === this.placeholder) s *= 1.6; // placeholder reads closer to model size
        d.scale.set(s, s, s);
        d.updateMatrix();
        mesh.setMatrixAt(item._index, d.matrix);
    }

    _hide(mesh, index) {
        var d = this._dummy;
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        mesh.setMatrixAt(index, d.matrix);
    }

    _shrink(mesh, count, capacity) {
        if (!mesh) return;
        mesh.count = Math.max(0, Math.min(count, capacity));
        for (var i = mesh.count; i < capacity; i++) this._hide(mesh, i);
        mesh.instanceMatrix.needsUpdate = true;
    }

    _syncGroup(items, meshes, capacity) {
        var count = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            it._index = count;
            for (var mi = 0; mi < meshes.length; mi++) {
                if (meshes[mi]) this._apply(it, meshes[mi]);
            }
            count++;
        }
        for (var mi2 = 0; mi2 < meshes.length; mi2++) {
            if (meshes[mi2]) this._shrink(meshes[mi2], count, capacity);
        }
        return count;
    }

    sync(items) {
        var batteries = [];
        var foods = [];
        var scraps = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'battery') batteries.push(it);
            else if (it.type === 'food') foods.push(it);
            else scraps.push(it);
        }
        // Fixed r128 InstancedMesh buffers: clamp draw slots to this.capacity.
        // Items beyond the cap are simply not rendered (gameplay lists stay small).
        var maxNeeded = Math.max(batteries.length, foods.length, scraps.length, 1);
        var cap = Math.min(maxNeeded, this.capacity);

        this._ensureBattery();
        if (this.batteryBuilt && this.batteries.length) {
            this._syncGroup(batteries, this.batteries, cap);
        } else {
            this._syncGroup(batteries, [this.placeholder], cap);
        }
        this._syncGroup(foods, [this.foodMeshes.body, this.foodMeshes.ring, this.foodMeshes.glow], cap);
        this._syncGroup(scraps, [this.scrapMeshes.body, this.scrapMeshes.glow], cap);
    }
    update(dt, items, playerPos) {
        var pool = this.attractPool;
        if (pool && playerPos) {
            // Player objects expose getPosition(); plain Vector3 callers work too.
            var pp = playerPos.getPosition ? playerPos.getPosition() : playerPos;
            var dir = this._scratchDir || (this._scratchDir = new THREE.Vector3());
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.isExpired()) continue;
                it._attractTimer -= dt;
                if (it._attractTimer <= 0) {
                    it._attractTimer = 0.15 + Math.random() * 0.2;
                    dir.copy(pp);
                    dir.x -= it.x; dir.y -= it.y; dir.z -= it.z || 0;
                    var len = dir.length();
                    if (len > 0.01 && len < 20) {
                        dir.divideScalar(len);
                        var sp = pool.emit({
                            x: it.x + dir.x * 1.2,
                            y: it.y + dir.y * 1.2,
                            z: (it.z || 0) + dir.z * 1.2,
                            scale: 0.3 + Math.random() * 0.25,
                            opacity: 0.6 + Math.random() * 0.4,
                            life: 0.35 + Math.random() * 0.15,
                            color: it.type === 'battery' ? 0x66ccff : (it.type === 'food' ? 0x44ff66 : 0xccaa66)
                        });
                        if (sp) {
                            sp.userData.vx = dir.x * 4;
                            sp.userData.vy = dir.y * 4;
                            sp.userData.vz = dir.z * 4;
                        }
                    }
                }
            }
            pool.update(dt, function(s, ddt) {
                s.position.x += (s.userData.vx || 0) * ddt;
                s.position.y += (s.userData.vy || 0) * ddt;
                s.position.z += (s.userData.vz || 0) * ddt;
                var m = s.material;
                m.opacity = Math.max(0, m.opacity - ddt * 2.2);
            });
        }
    }
};

// LootManager keeps the same public API as the original game so main.js builds
// untouched: data-only items + InstancedMesh renderer + pooling.
ASTEROIDS.LootManager = class LootManager {
    constructor(scene) {
        this.scene = scene;
        this.items = [];
        this.renderer = new ASTEROIDS.LootRenderer(scene);
    }

    getLoot() { return this.items; }
    count() { return this.items.length; }

    addItem(item) {
        this.items.push(item);
        return item;
    }

    spawnLoot(type, position) {
        var item = new ASTEROIDS.LootItem(type, position);
        return this.addItem(item);
    }

    spawnRandomLoot(position) {
        var config = ASTEROIDS.CONFIG.LOOT;
        var weights = [
            ['battery', config.BATTERY_WEIGHT],
            ['food', config.FOOD_WEIGHT],
            ['scrap', config.SCRAP_WEIGHT]
        ];
        var total = 0, i;
        for (i = 0; i < weights.length; i++) total += weights[i][1];
        var roll = Math.random() * total;
        var acc = 0, type = 'scrap';
        for (i = 0; i < weights.length; i++) {
            acc += weights[i][1];
            if (roll <= acc) { type = weights[i][0]; break; }
        }
        return this.spawnLoot(type, position);
    }

    update(dt, playerPos) {
        var i;
        for (i = this.items.length - 1; i >= 0; i--) {
            var it = this.items[i];
            it.update(dt, playerPos);
            if (it.isExpired()) {
                it.collected = true;
                this.items.splice(i, 1);
            }
        }
        this.renderer.sync(this.items);
        this.renderer.update(dt, this.items, playerPos);
    }

    checkCollisions(player) {
        if (!player) return;
        var i;
        for (i = this.items.length - 1; i >= 0; i--) {
            var it = this.items[i];
            if (it.isExpired() || it.collected) continue;
            var pp = player.getPosition ? player.getPosition() : player;
            var dx = it.x - pp.x;
            var dy = it.y - pp.y;
            var dz = (it.z || 0) - pp.z;
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            var radius = it.type === 'battery' ? 2.0 : 1.0;
            if (dist < radius) {
                it.collected = true;
                if (ASTEROIDS.Sound && ASTEROIDS.Sound.playLoot) {
                    try { ASTEROIDS.Sound.playLoot(); } catch (e) {}
                }
                var pts = it.getPoints();
                if (pts && player.addScore) player.addScore(pts);
                it.applyEffect(player);
                this.items.splice(i, 1);
            }
        }
    }

    clear() {
        this.items = [];
        if (this.renderer) {
            try { this.renderer.sync([]); } catch (e) {}
        }
    }
};
