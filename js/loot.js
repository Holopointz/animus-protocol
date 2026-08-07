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
    }
    
    createMesh() {
        var group = new THREE.Group();
        
        switch(this.type) {
            case 'battery':
                // Glowing cylinder with emissive animation
                var cylGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
                var cylMat = new THREE.MeshStandardMaterial({
                    color: 0x3399ff,
                    emissive: 0x3399ff,
                    emissiveIntensity: 1.0,
                    roughness: 0.3,
                    metalness: 0.6
                });
                var cylinder = new THREE.Mesh(cylGeo, cylMat);
                cylinder.rotation.x = Math.PI / 2;
                group.add(cylinder);
                group.userData.emissiveMesh = cylinder;
                
                // Glow sphere around it
                var glowGeo = new THREE.SphereGeometry(0.5, 8, 8);
                var glowMat = new THREE.MeshBasicMaterial({
                    color: 0x3399ff,
                    transparent: true,
                    opacity: 0.3
                });
                var glow = new THREE.Mesh(glowGeo, glowMat);
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
        
        // Emissive intensity animation (pulse 0.5-1.5)
        if (this.mesh.userData.emissiveMesh && this.mesh.userData.emissiveMesh.material.emissiveIntensity !== undefined) {
            this.mesh.userData.emissiveMesh.material.emissiveIntensity = 1.0 + Math.sin(this.pulseOffset) * 0.5;
        }
        
        // Rotate
        this.mesh.rotation.y += dt * 2;
        this.mesh.rotation.x += dt * 1.5;
        
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
