// Modern Asteroids - Asteroid Generation and Physics
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.Asteroid = class Asteroid {
    constructor(size, position, velocity) {
        const config = ASTEROIDS.CONFIG.ASTEROID;
        this.size = size; // 'large', 'medium', 'small'
        this.radius = this.getRadiusForSize(size);
        this.health = size === 'large' ? 3 : size === 'medium' ? 2 : 1;
        this.points = this.getPointsForSize(size);
        
        // Create mesh
        this.mesh = this.createMesh();
        this.mesh.position.copy(position || new THREE.Vector3());
        
        // Velocity
        this.velocity = velocity || this.randomVelocity();
        
        // Rotation (tumble)
        this.rotSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        
        // Glow ring
        this.glowPulse = Math.random() * Math.PI * 2;
    }
    
    getRadiusForSize(size) {
        const config = ASTEROIDS.CONFIG.ASTEROID;
        switch(size) {
            case 'large': return config.LARGE_RADIUS;
            case 'medium': return config.MEDIUM_RADIUS;
            case 'small': return config.SMALL_RADIUS;
            default: return 2;
        }
    }
    
    getPointsForSize(size) {
        const config = ASTEROIDS.CONFIG.ASTEROID;
        switch(size) {
            case 'large': return config.LARGE_POINTS;
            case 'medium': return config.MEDIUM_POINTS;
            case 'small': return config.SMALL_POINTS;
            default: return 50;
        }
    }
    
    createMesh() {
        let geometry;
        // Start with icosahedron for rocky shape
        if (this.size === 'large') {
            geometry = new THREE.IcosahedronGeometry(this.radius, 2);
        } else if (this.size === 'medium') {
            geometry = new THREE.IcosahedronGeometry(this.radius, 1);
        } else {
            geometry = new THREE.IcosahedronGeometry(this.radius, 0);
        }
        
        // Displace vertices with noise for irregular rocky shape
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            const noise = ASTEROIDS.Noise.fbm(x * 0.8, y * 0.8, z * 0.8, 3, 2.0, 0.6);
            const len = Math.sqrt(x*x + y*y + z*z);
            if (len > 0) {
                const scale = 1 + noise * 0.3;
                positions.setXYZ(i, x * scale, y * scale, z * scale);
            }
        }
        geometry.computeVertexNormals();
        
        // Use cached asteroid surface maps from the boot-time preloader - no
        // per-spawn TextureLoader() calls that cause network hitches mid-game.
        // Note: r128 Texture has no userData, so repeat-wrap readiness is tracked
        // in a plain ASTEROIDS map keyed by texture uuid (ES5-safe).
        var repeatReady = ASTEROIDS._asteroidTexReady = ASTEROIDS._asteroidTexReady || {};
        var diffuseTex = ASTEROIDS.Assets.textures['asteroidDiffuse'] || null;
        var normalTex = ASTEROIDS.Assets.textures['asteroidNormal'] || null;
        if (diffuseTex && !repeatReady[diffuseTex.uuid]) {
            diffuseTex.wrapS = THREE.RepeatWrapping;
            diffuseTex.wrapT = THREE.RepeatWrapping;
            diffuseTex.repeat.set(2, 2);
            repeatReady[diffuseTex.uuid] = true;
        }
        if (normalTex && !repeatReady[normalTex.uuid]) {
            normalTex.wrapS = THREE.RepeatWrapping;
            normalTex.wrapT = THREE.RepeatWrapping;
            normalTex.repeat.set(2, 2);
            repeatReady[normalTex.uuid] = true;
        }
        
        // Random roughness and metalness
        var roughness = 0.75 + Math.random() * 0.2;
        var metalness = 0.05 + Math.random() * 0.15;
        
        var mat = new THREE.MeshStandardMaterial({
            map: diffuseTex,
            normalMap: normalTex,
            normalScale: new THREE.Vector2(3.0, 3.0),
            roughness: roughness,
            metalness: metalness,
            flatShading: true
        });
        if (window.ASTEROIDS.envMap) { mat.envMap = window.ASTEROIDS.envMap; mat.envMapIntensity = 0.4; }
        
        var mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
    
    // Generate procedural diffuse and normal maps using Canvas
    generateProceduralRockTexture() {
        var size = 512;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        
        // Generate noise-like height field
        var imageData = ctx.createImageData(size, size);
        var data = imageData.data;
        
        // Simple layered sine-wave noise for rocky look
        var freq1 = 0.015;
        var freq2 = 0.04;
        var freq3 = 0.12;
        
        for (var y = 0; y < size; y++) {
            for (var x = 0; x < size; x++) {
                var freq4 = 0.25;
                var val = Math.sin(x * freq1) * Math.cos(y * freq1) * 0.5 +
                    Math.sin(x * freq2 + 1.5) * Math.cos(y * freq2 * 1.3 + 2.0) * 0.3 +
                    Math.sin(x * freq3 * 1.7) * Math.cos(y * freq3 + 0.8) * 0.2 +
                    Math.sin(x * freq4 * 2.3) * Math.cos(y * freq4 * 1.9 + 1.1) * 0.08;
                val = (val + 1) / 2; // normalize 0-1
                // Add irregular patches
                val += Math.sin(x * 0.006 + y * 0.004) * Math.cos(y * 0.005) * 0.15;
                val = Math.max(0.15, Math.min(0.85, val));
                
                var gray = Math.floor(val * 220 + 20); // 20-240 range for rock color
                var idx = (y * size + x) * 4;
                data[idx] = gray;
                data[idx + 1] = Math.floor(gray * 0.92);
                data[idx + 2] = Math.floor(gray * 0.82);
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Create normal map from height field
        var normCanvas = document.createElement('canvas');
        normCanvas.width = size;
        normCanvas.height = size;
        var nctx = normCanvas.getContext('2d');
        var normImageData = nctx.createImageData(size, size);
        var ndata = normImageData.data;
        
        for (var ny = 0; ny < size; ny++) {
            for (var nx = 0; nx < size; nx++) {
                var hCenter = data[(ny * size + nx) * 4] / 255;
                var hRight = data[(ny * size + Math.min(nx + 1, size - 1)) * 4] / 255;
                var hDown = data[(Math.min(ny + 1, size - 1) * size + nx) * 4] / 255;
                
                var dx = (hRight - hCenter) * 5.0;
                var dy = (hDown - hCenter) * 5.0;
                var dz = 1.0 / Math.sqrt(dx*dx + dy*dy + 1);
                dx *= dz;
                dy *= dz;
                
                var nidx = (ny * size + nx) * 4;
                ndata[nidx] = Math.floor((dx * 0.5 + 0.5) * 255);
                ndata[nidx + 1] = Math.floor((dy * 0.5 + 0.5) * 255);
                ndata[nidx + 2] = Math.floor((dz * 0.5 + 0.5) * 255);
                ndata[nidx + 3] = 255;
            }
        }
        nctx.putImageData(normImageData, 0, 0);
        
        var diffuseTex = new THREE.CanvasTexture(canvas);
        diffuseTex.wrapS = THREE.RepeatWrapping;
        diffuseTex.wrapT = THREE.RepeatWrapping;
        diffuseTex.repeat.set(2, 2);
        
        var normalTex = new THREE.CanvasTexture(normCanvas);
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(2, 2);
        
        return { map: diffuseTex, normalMap: normalTex };
    }
    
    randomVelocity() {
        const config = ASTEROIDS.CONFIG.ASTEROID;
        const speed = config.MIN_SPEED + Math.random() * (config.MAX_SPEED - config.MIN_SPEED);
        const angle = Math.random() * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
    }
    
    update(dt) {
        // Move
        this.mesh.position.x += this.velocity.x * dt;
        this.mesh.position.y += this.velocity.y * dt;
        
        // Keep rocks inside the visible arena: bounce off the boundary instead
        // of wrapping into the invisible off-screen zone (which made the last
        // asteroids impossible to find and finish).
        const pos = this.mesh.position;
        const bnd = ASTEROIDS.CONFIG.ASTEROID.BOUNDARY || { x: 24, y: 15 };
        if (pos.x > bnd.x) { pos.x = bnd.x; this.velocity.x = -Math.abs(this.velocity.x); }
        if (pos.x < -bnd.x) { pos.x = -bnd.x; this.velocity.x = Math.abs(this.velocity.x); }
        if (pos.y > bnd.y) { pos.y = bnd.y; this.velocity.y = -Math.abs(this.velocity.y); }
        if (pos.y < -bnd.y) { pos.y = -bnd.y; this.velocity.y = Math.abs(this.velocity.y); }
        
        // Tumble
        this.mesh.rotation.x += this.rotSpeed.x * dt;
        this.mesh.rotation.y += this.rotSpeed.y * dt;
        this.mesh.rotation.z += this.rotSpeed.z * dt;
        
        // Pulse glow
        this.glowPulse += dt * 2;
    }
    
    addToScene(scene) {
        scene.add(this.mesh);
    }
    
    removeFromScene(scene) {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
    
    getPosition() {
        return this.mesh.position;
    }
    
    getRadius() {
        return this.radius;
    }
    
    // Create child asteroids when destroyed
    createSplit() {
        const children = [];
        if (this.size === 'large') {
            for (let i = 0; i < 2; i++) {
                const child = new ASTEROIDS.Asteroid('medium', this.mesh.position.clone());
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                child.velocity = this.velocity.clone()
                    .add(new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0));
                children.push(child);
            }
        } else if (this.size === 'medium') {
            for (let i = 0; i < 2; i++) {
                const child = new ASTEROIDS.Asteroid('small', this.mesh.position.clone());
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                child.velocity = this.velocity.clone()
                    .add(new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0));
                children.push(child);
            }
        }
        return children;
    }
    
    // Determine if this asteroid should drop loot
    shouldDropLoot() {
        return Math.random() < ASTEROIDS.CONFIG.ASTEROID.LOOT_DROP_CHANCE;
    }
    
    // Get loot type based on probabilities
    static getLootType() {
        const r = Math.random();
        const config = ASTEROIDS.CONFIG.LOOT;
        if (r < config.BATTERY_CHANCE) return 'battery';
        if (r < config.BATTERY_CHANCE + config.FOOD_CHANCE) return 'food';
        return 'scrap';
    }
};

// Asteroid manager
ASTEROIDS.AsteroidManager = class AsteroidManager {
    constructor(scene) {
        this.scene = scene;
        this.asteroids = [];
    }
    
    spawn(count, speedMult) {
        const config = ASTEROIDS.CONFIG.ASTEROID;
        const margin = config.SPAWN_MARGIN;
        
        for (let i = 0; i < count; i++) {
            // Spawn at random position just outside the visible bounce boundary
            const side = Math.floor(Math.random() * 4);
            let pos;
            const bnd = ASTEROIDS.CONFIG.ASTEROID.BOUNDARY || { x: 24, y: 15 };
            switch(side) {
                case 0: pos = new THREE.Vector3(-(bnd.x + margin), (Math.random() * 2 - 1) * bnd.y, 0); break;
                case 1: pos = new THREE.Vector3((bnd.x + margin), (Math.random() * 2 - 1) * bnd.y, 0); break;
                case 2: pos = new THREE.Vector3((Math.random() * 2 - 1) * bnd.x, -(bnd.y + margin), 0); break;
                case 3: pos = new THREE.Vector3((Math.random() * 2 - 1) * bnd.x, (bnd.y + margin), 0); break;
            }
            
            // Direction toward center-ish area
            const angle = Math.atan2(-pos.y + (Math.random()-0.5)*20, -pos.x + (Math.random()-0.5)*20);
            const speed = (config.MIN_SPEED + Math.random() * (config.MAX_SPEED - config.MIN_SPEED)) * speedMult;
            const vel = new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
            
            const asteroid = new ASTEROIDS.Asteroid('large', pos, vel);
            asteroid.addToScene(this.scene);
            this.asteroids.push(asteroid);
        }
    }
    
    update(dt) {
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            this.asteroids[i].update(dt);
        }
    }
    
    removeAsteroid(index, scene) {
        this.asteroids[index].removeFromScene(scene);
        this.asteroids.splice(index, 1);
    }
    
    getAsteroids() {
        return this.asteroids;
    }
    
    count() {
        return this.asteroids.length;
    }
    
    clear(scene) {
        for (const a of this.asteroids) {
            a.removeFromScene(scene);
        }
        this.asteroids = [];
    }
};
