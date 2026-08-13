// Modern Asteroids - Loot System
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.LootItem = class LootItem {
    constructor(type, position) {
        this.type = type;
        this.mesh = this.createMesh();
        this.mesh.position.copy(position || new THREE.Vector3());
        this.lifetime = ASTEROIDS.CONFIG.LOOT.LIFETIME;
        this.maxLifetime = this.lifetime;
        this.collected = false;
        
        // Drift velocity
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * ASTEROIDS.CONFIG.LOOT.DRIFT_SPEED,
            (Math.random() - 0.5) * ASTEROIDS.CONFIG.LOOT.DRIFT_SPEED,
            0
        );
        
        // Pulse animation
        this.pulseOffset = Math.random() * Math.PI * 2;
        this.originalScale = this.mesh.scale.clone();
        
        // Bobbing animation
        this._bobTimer = Math.random() * Math.PI * 2;
        this._baseY = this.mesh.position.y;
        
        // Attraction particle streams
        this._attractParticles = [];
        this._attractActive = false;

        // Shared shield-canister GLB (battery only)
        this._modelReady = false;
        this._modelApplied = false;
        this._usesModel = (this.type === 'battery');
        if (this._usesModel) {
            var self = this;
            ASTEROIDS.LootItem._loadCanisterModel(function() {
                self._modelReady = true;
                if (self.mesh) self._applyCanisterModel();
            });
        }
    }
    
    createMesh() {
        var group = new THREE.Group();
        
        switch(this.type) {
            case 'battery':
                // Shield canister model (Blender export). Shared GLB is loaded async and
                // swapped in via _applyCanisterModel(); until ready we show a placeholder.
                var phGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.1, 10);
                phGeo.rotateX(Math.PI / 2);
                var phMat = new THREE.MeshStandardMaterial({
                    color: 0x88bbff,
                    emissive: 0x2266cc,
                    emissiveIntensity: 2.2,
                    roughness: 0.85,
                    metalness: 0.5,
                    transparent: true,
                    opacity: 0.7
                });
                var placeholder = new THREE.Mesh(phGeo, phMat);
                placeholder.rotation.y = 0;
                group.add(placeholder);
                group.userData.emissiveMesh = placeholder;
                group.userData.placeholder = placeholder;
                group.userData.phGeo = phGeo;
                group.userData.phMat = phMat;

                // Small blue point light so the canister reads as a glowing pickup
                var canLight = new THREE.PointLight(0x66ccff, 4, 4.5);
                canLight.position.set(0, 0, 0.8);
                group.add(canLight);
                group.userData.canLight = canLight;

                // Glow sphere around it
                var glowGeo = new THREE.SphereGeometry(0.5, 8, 8);
                var glowMat = new THREE.MeshBasicMaterial({
                    color: 0x3399ff,
                    transparent: true,
                    opacity: 0.0
                });
                var glow = new THREE.Mesh(glowGeo, glowMat);

                // Shrink blue sphere to a microscopic speck and turn off rendering to hide it
                glow.scale.set(0.001, 0.001, 0.001);
                glow.visible = false; 

                group.add(glow);
                group.userData.glowMesh = glow;
                break;
                
            case 'food':
                // Sphere with torus ring (glowing energy node)
                var sphereGeo = new THREE.SphereGeometry(0.25, 12, 12);
                var sphereMat = new THREE.MeshStandardMaterial({
                    color: 0x44ff66,
                    emissive: 0x44ff66,
                    emissiveIntensity: 1.5,
                    roughness: 0.3,
                    metalness: 0.1
                });
                var sphere = new THREE.Mesh(sphereGeo, sphereMat);
                group.add(sphere);
                group.userData.emissiveMesh = sphere;
                
                // Torus ring around sphere
                var torusGeo = new THREE.TorusGeometry(0.4, 0.06, 8, 16);
                var torusMat = new THREE.MeshStandardMaterial({
                    color: 0x66ff88,
                    emissive: 0x44ff66,
                    emissiveIntensity: 1.0,
                    roughness: 0.3,
                    metalness: 0.1
                });
                var torus = new THREE.Mesh(torusGeo, torusMat);
                group.add(torus);
                
                // Glow
                var fGlowGeo = new THREE.SphereGeometry(0.6, 8, 8);
                var fGlowMat = new THREE.MeshBasicMaterial({
                    color: 0x44ff66,
                    transparent: true,
                    opacity: 0.3
                });
                var fGlow = new THREE.Mesh(fGlowGeo, fGlowMat);
                group.add(fGlow);
                group.userData.glowMesh = fGlow;
                break;
                
            case 'scrap':
                // Irregular shape - icosahedron (more irregular than dodecahedron)
                var scrapGeo = new THREE.IcosahedronGeometry(0.35, 1);
                var scrapMat = new THREE.MeshStandardMaterial({
                    color: 0xcc9944,
                    emissive: 0x442211,
                    roughness: 0.7,
                    metalness: 0.5
                });
                var scrap = new THREE.Mesh(scrapGeo, scrapMat);
                group.add(scrap);
                
                // Glow
                var sGlowGeo = new THREE.SphereGeometry(0.5, 8, 8);
                var sGlowMat = new THREE.MeshBasicMaterial({
                    color: 0xcc9944,
                    transparent: true,
                    opacity: 0.3
                });
                var sGlow = new THREE.Mesh(sGlowGeo, sGlowMat);
                group.add(sGlow);
                group.userData.glowMesh = sGlow;
                break;
        }
        
        return group;
    }
    // 3D canister model helpers ----
    _applyCanisterModel() {
        if (!ASTEROIDS.LootItem._canisterModel || this._modelApplied || !this.mesh) return;
        this._modelApplied = true;
        var clone = ASTEROIDS.LootItem._canisterModel.clone(true);
        var self = this;
        var texLoader = new THREE.TextureLoader();
        
        // Load Diffuse (Color data)
        var diffuseMap = texLoader.load('assets/textures/difuse_canister.png');
        diffuseMap.flipY = false; // CRUCIAL: Fixes the upside-down Blender texture alignment
        diffuseMap.colorSpace = THREE.SRGBColorSpace; // Keeps colors vibrant like Blender

        // Load Normal (Math data)
        var normalMap = texLoader.load('assets/textures/normal_canister.jpg');
        normalMap.flipY = false;
        normalMap.colorSpace = THREE.NoColorSpace; // Treats pixels as raw vectors

        // Load Roughness (Math data)
        var roughMap = texLoader.load('assets/textures/roughness_canister.png');
        roughMap.flipY = false;
        roughMap.colorSpace = THREE.NoColorSpace;

        clone.traverse(function(child) {
            if (!child.isMesh) return;
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            var newMats = [];
            for (var i = 0; i < mats.length; i++) {
                var m = mats[i];
                if (!m) continue;
                var matName = (m.name || '').toLowerCase();
                var childName = (child.name || '').toLowerCase();
                var cm = m.clone();
                cm.transparent = true;
                cm.toneMapped = false;
                cm.depthWrite = true;
                if (window.ASTEROIDS.envMap) {
                    cm.envMap = window.ASTEROIDS.envMap;
                }
                if (childName.indexOf('plasma') !== -1 || matName.indexOf('plasma') !== -1) {
                    // Inner plasma: animated glowing light blue
                    cm.color = new THREE.Color(0x002244);
                    cm.emissive = new THREE.Color(0x00aaff);
                    cm.emissiveIntensity = 1.2;
                    cm.roughness = 0.15;
                    cm.metalness = 0.0;
                    cm.envMapIntensity = 0.6;
                    cm.opacity = 0.95;
                    cm.depthWrite = false;
                } else if (matName.indexOf('glass') !== -1) {
                    // Glass portion: physical glass shader with faint cyan tint
                    cm.color = new THREE.Color(0xa8d8ff);
                    cm.metalness = 0.0;
                    cm.roughness = 0.12;
                    cm.transmission = 0.55;
                    cm.transparent = true;
                    cm.opacity = 0.26;
                    cm.depthWrite = false;
                    cm.envMapIntensity = 1.15;
                    cm.emissive = new THREE.Color(0x66ddff);
                    cm.emissiveIntensity = 0.2;
                } else {
                    // Canister shell
                    cm.map = diffuseMap;
                    cm.normalMap = normalMap;
                    cm.roughnessMap = roughMap;
                    cm.metalnessMap = null;
                    
                    // FIX: Allow maps to dictate values. 
                    // If you have metal caps, set metalness to 1.0 so the metal reflection math turns on.
                    cm.metalness = 0.2; 
                    cm.roughness = 1.0; // Acts as a 1:1 multiplier for your roughness map
                    
                    cm.emissive = new THREE.Color(0x000000);
                    cm.emissiveIntensity = 0.0;
                    cm.envMapIntensity = 1.0;
                    cm.opacity = 1;
                    cm.transparent = false;
                    cm.depthWrite = true;
                }
                cm.needsUpdate = true;
                newMats.push(cm);
            }
            child.material = newMats.length === 1 ? newMats[0] : newMats;
        });


        // Lay the canister sideways so it reads like a pickup in the top-down XY arena
        clone.rotation.set(Math.PI / 2, 0, 0);
        clone.scale.set(6, 6, 6);
        // Replace the placeholder with the real model
        var ph = this.mesh.userData.placeholder;
        if (ph) {
            this.mesh.remove(ph);
            if (this.mesh.userData.phGeo) this.mesh.userData.phGeo.dispose();
            if (this.mesh.userData.phMat) this.mesh.userData.phMat.dispose();
            this.mesh.userData.placeholder = null;
            this.mesh.userData.emissiveMesh = null;
        }
        this.mesh.add(clone);
        this.mesh.userData.model = clone;
        this.mesh.userData.plasmaMesh = null;
        clone.traverse(function(child) {
            if (child.isMesh && (child.name || '').toLowerCase().indexOf('plasma') !== -1) {
                self.mesh.userData.plasmaMesh = child;
            }
        });
    }

    update(dt, playerPos) {
        if (this.collected) return;
        
        // Drift
        this.mesh.position.x += this.velocity.x * dt;
        this.mesh.position.y += this.velocity.y * dt;
        
        // Wrap around
        var size = ASTEROIDS.CONFIG.WORLD.SIZE;
        var pos = this.mesh.position;
        if (pos.x > size) pos.x = -size;
        if (pos.x < -size) pos.x = size;
        if (pos.y > size) pos.y = -size;
        if (pos.y < -size) pos.y = size;
        
        // Bobbing animation (subtle y-axis oscillation)
        this._bobTimer += dt * 3;
        this.mesh.position.y = this._baseY + Math.sin(this._bobTimer) * 0.2;
        
        // Pulse glow
        this.pulseOffset += dt * 3;
        var scale = 1 + Math.sin(this.pulseOffset) * 0.2;
        if (this.mesh.userData.glowMesh) {
            this.mesh.userData.glowMesh.scale.setScalar(scale);
            this.mesh.userData.glowMesh.material.opacity = 0.2 + Math.sin(this.pulseOffset) * 0.15;
        }
        
        // Emissive intensity animation: placeholder cylinder OR loaded plasma mesh
        var emMesh = this.mesh.userData.emissiveMesh || this.mesh.userData.plasmaMesh;
        if (emMesh && emMesh.material && emMesh.material.emissiveIntensity !== undefined) {
            emMesh.material.emissiveIntensity = (this._usesModel && this._modelApplied ? 2.2 : 1.0) + Math.sin(this.pulseOffset) * 0.7;
        }
        if (this.mesh.userData.canLight) {
            this.mesh.userData.canLight.intensity = 3.0 + Math.sin(this.pulseOffset) * 1.4;
        }
        
        // Rotate
        this.mesh.rotation.y += dt * 2;
        this.mesh.rotation.x += dt * 1.5;
        if (this.mesh.userData.model) {
            this.mesh.userData.model.rotation.y += dt * 1.2;
        }
        
        // Particle attraction when player is within 8 units
        if (playerPos) {
            var dist = this.mesh.position.distanceTo(playerPos);
            if (dist < 8) {
                this._attractActive = true;
                // Spawn tiny particles streaming toward player
                if (Math.random() < 0.4) {
                    var spriteMat = new THREE.SpriteMaterial({
                        map: this._createSmallSprite(),
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        transparent: true,
                        opacity: 0.8,
                        color: 0x88ccff
                    });
                    var sprite = new THREE.Sprite(spriteMat);
                    sprite.position.copy(this.mesh.position);
                    sprite.scale.set(0.15, 0.15, 1);
                    var dir = playerPos.clone().sub(this.mesh.position).normalize().multiplyScalar(6 + Math.random() * 4);
                    this.mesh.add(sprite);
                    this._attractParticles.push({
                        mesh: sprite,
                        velocity: dir,
                        life: 0.6,
                        maxLife: 0.6
                    });
                }
            }
        }
        
        // Update attraction particles
        for (var j = this._attractParticles.length - 1; j >= 0; j--) {
            var p = this._attractParticles[j];
            p.life -= dt;
            if (p.life <= 0) {
                this.mesh.remove(p.mesh);
                if (p.mesh.material) {
                    if (p.mesh.material.map) p.mesh.material.map.dispose();
                    p.mesh.material.dispose();
                }
                this._attractParticles.splice(j, 1);
                continue;
            }
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = p.life / p.maxLife;
        }
        
        // Lifetime
        this.lifetime -= dt;
        
        // Fade out near end
        if (this.lifetime < 3) {
            this.mesh.children.forEach(function(c) {
                if (c.material && c.material.transparent !== undefined) {
                    c.material.opacity = Math.max(0.1, this.lifetime / 3);
                }
            }.bind(this));
        }
    }
    
    // Small sprite texture for attraction particles
    _createSmallSprite() {
        if (!ASTEROIDS.LootItem._smallSpriteTex) {
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
        }
        return ASTEROIDS.LootItem._smallSpriteTex;
    }
    
    addToScene(scene) {
        scene.add(this.mesh);
    }
    
    removeFromScene(scene) {
        scene.remove(this.mesh);
        this.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
    
    getPosition() {
        return this.mesh.position;
    }
    
    isExpired() {
        return this.lifetime <= 0 || this.collected;
    }
    
    getPoints() {
        const config = ASTEROIDS.CONFIG.LOOT;
        switch(this.type) {
            case 'battery': return config.BATTERY_POINTS;
            case 'food': return config.FOOD_POINTS;
            case 'scrap': return config.SCRAP_POINTS;
            default: return 0;
        }
    }
    
    applyEffect(player) {
        const config = ASTEROIDS.CONFIG.LOOT;
        switch(this.type) {
            case 'battery':
                player.repairShield(config.BATTERY_SHIELD);
                break;
            case 'scrap':
                player.heal(config.SCRAP_HEAL);
                break;
            case 'food':
                player.foodBuffTimer = config.FOOD_DURATION;
                break;
        }
    }
    // Shared shield canister model + loader (battery only)
    static _loadCanisterModel(cb) {
        if (ASTEROIDS.LootItem._canisterModel) { cb && cb(); return; }
        if (ASTEROIDS.LootItem._canisterLoading) {
            var cbs = ASTEROIDS.LootItem._canisterCbs = ASTEROIDS.LootItem._canisterCbs || [];
            cbs.push(cb);
            return;
        }
        ASTEROIDS.LootItem._canisterLoading = true;
        ASTEROIDS.LootItem._canisterCbs = [cb];
        var loader = new THREE.GLTFLoader();
        loader.load('assets/models/shield_canister.glb?v=51', function(gltf) {
            ASTEROIDS.LootItem._canisterModel = gltf.scene;
            ASTEROIDS.LootItem._canisterLoading = false;
            ASTEROIDS.LootItem._canisterCbs.forEach(function(f) { f && f(); });
            ASTEROIDS.LootItem._canisterCbs = [];
        }, undefined, function(err) {
            console.error('Error loading shield canister model:', err);
            ASTEROIDS.LootItem._canisterLoading = false;
            ASTEROIDS.LootItem._canisterCbs = [];
        });
    }

};

// Loot manager
ASTEROIDS.LootManager = class LootManager {
    constructor(scene) {
        this.scene = scene;
        this.loot = [];
    }
    
    spawnLoot(type, position) {
        const item = new ASTEROIDS.LootItem(type, position);
        item.addToScene(this.scene);
        this.loot.push(item);
    }
    
    spawnRandomLoot(position) {
        const type = ASTEROIDS.Asteroid.getLootType();
        this.spawnLoot(type, position);
    }
    
    update(dt, player) {
        var playerPos = player ? player.getPosition() : null;
        for (var i = this.loot.length - 1; i >= 0; i--) {
            var item = this.loot[i];
            item.update(dt, playerPos);
            if (item.isExpired()) {
                item.removeFromScene(this.scene);
                this.loot.splice(i, 1);
            }
        }
    }
    
    checkCollisions(player) {
        const playerPos = player.getPosition();
        const playerRadius = player.getRadius();
        const collisionRadius = ASTEROIDS.CONFIG.LOOT.COLLISION_RADIUS;
        
        for (let i = this.loot.length - 1; i >= 0; i--) {
            const item = this.loot[i];
            const dist = playerPos.distanceTo(item.getPosition());
            if (dist < playerRadius + collisionRadius) {
                item.applyEffect(player);
                player.addScore(item.getPoints());
                item.collected = true;
                item.removeFromScene(this.scene);
                this.loot.splice(i, 1);
                ASTEROIDS.Sound.lootPickup(item.type);
                return item.type;
            }
        }
        return null;
    }
    
    getLoot() {
        return this.loot;
    }
    
    count() {
        return this.loot.length;
    }
    
    clear(scene) {
        for (const item of this.loot) {
            item.removeFromScene(scene);
        }
        this.loot = [];
    }
};
