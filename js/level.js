// Modern Asteroids - Level System
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.Level = class Level {
    constructor(scene) {
        this.scene = scene;
        this.currentLevelIndex = 0;
        this.levelTransitioning = false;
        this.transitionTimer = 0;
        
        // Planet background
        this.planetSphere = null;
        this.planetTexture = null;
        
        // Skybox nebula sphere
        this.skyboxSphere = null;
        
        // Starfield (parallax layers)
        this.starfield = null;
        this.starfieldInner = null;
        this.starfieldInnermost = null;
        
        // Saturn ring (for Saturn level)
        this.saturnRing = null;
        
        // Bloom transition state
        this._originalBloomStrength = null;
        this._bloomTransitionTimer = 0;
        
        // Star twinkle timer
        this._twinkleTimer = 0;
        
        // Skybox animation timer
        this._skyboxTime = 0;
    }
    
    getConfig() {
        return ASTEROIDS.CONFIG.LEVELS[this.currentLevelIndex];
    }
    
    init() {
        this.createSkybox();
        this.createStarfield();
        this.loadPlanet();
    }
    
    createSkybox() {
        var visConfig = ASTEROIDS.CONFIG.VISUAL;
        var skyboxRadius = visConfig.SKYBOX_RADIUS || 500;
        
        // Dispose old skybox
        if (this.skyboxSphere) {
            this.scene.remove(this.skyboxSphere);
            this.skyboxSphere.geometry.dispose();
            if (this.skyboxSphere.material.uniforms) {
                // ShaderMaterial cleanup
                this.skyboxSphere.material.dispose();
            } else if (this.skyboxSphere.material.map) {
                this.skyboxSphere.material.map.dispose();
                this.skyboxSphere.material.dispose();
            } else {
                this.skyboxSphere.material.dispose();
            }
        }
        
        // Volumetric nebula shader with simplex noise
        var vertexShader = [
            'varying vec3 vWorldPosition;',
            'void main() {',
            '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
            '  vWorldPosition = worldPos.xyz;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n');
        
        // Compact 3D simplex noise (Ashima Arts / Stefan Gustavson)
        var noiseGLSL = [
            'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
            'vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
            'vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }',
            'vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }',
            'float snoise(vec3 v) {',
            '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
            '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
            '  vec3 i = floor(v + dot(v, C.yyy));',
            '  vec3 x0 = v - i + dot(i, C.xxx);',
            '  vec3 g = step(x0.yzx, x0.xyz);',
            '  vec3 l = 1.0 - g;',
            '  vec3 i1 = min(g.xyz, l.zxy);',
            '  vec3 i2 = max(g.xyz, l.zxy);',
            '  vec3 x1 = x0 - i1 + C.xxx;',
            '  vec3 x2 = x0 - i2 + C.yyy;',
            '  vec3 x3 = x0 - D.yyy;',
            '  i = mod289(i);',
            '  vec4 p = permute(permute(permute(',
            '    i.z + vec4(0.0, i1.z, i2.z, 1.0))',
            '    + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
            '    + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
            '  float n_ = 0.142857142857;',
            '  vec3 ns = n_ * D.wyz - D.xzx;',
            '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
            '  vec4 x_ = floor(j * ns.z);',
            '  vec4 y_ = floor(j - 7.0 * x_);',
            '  vec4 x = x_ *ns.x + ns.yyyy;',
            '  vec4 y = y_ *ns.x + ns.yyyy;',
            '  vec4 h = 1.0 - abs(x) - abs(y);',
            '  vec4 b0 = vec4(x.xy, y.xy);',
            '  vec4 b1 = vec4(x.zw, y.zw);',
            '  vec4 s0 = floor(b0)*2.0 + 1.0;',
            '  vec4 s1 = floor(b1)*2.0 + 1.0;',
            '  vec4 sh = -step(h, vec4(0.0));',
            '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
            '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
            '  vec3 p0 = vec3(a0.xy, h.x);',
            '  vec3 p1 = vec3(a0.zw, h.y);',
            '  vec3 p2 = vec3(a1.xy, h.z);',
            '  vec3 p3 = vec3(a1.zw, h.w);',
            '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
            '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
            '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
            '  m = m * m;',
            '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
            '}'
        ].join('\n');
        
        var fragmentShader = [
            'varying vec3 vWorldPosition;',
            'uniform float uTime;',
            noiseGLSL,
            'void main() {',
            '  vec3 dir = normalize(vWorldPosition);',
            '  float scale = 1.8;',
            '  float n1 = snoise(dir * scale * 3.0 + vec3(uTime * 0.02, 0.0, uTime * 0.01));',
            '  float n2 = snoise(dir * scale * 6.0 + vec3(uTime * 0.015, uTime * 0.02, 0.0));',
            '  float n3 = snoise(dir * scale * 10.0 + vec3(0.0, uTime * 0.025, uTime * 0.018));',
            '  float n4 = snoise(dir * scale * 15.0 + vec3(uTime * 0.03, 0.0, 0.0));',
            '  float nebula = n1 * 0.5 + n2 * 0.3 + n3 * 0.15 + n4 * 0.05;',
            '  // Localized nebula washes (blue/teal) over deep black',
            '  float density = smoothstep(0.40, 0.78, nebula);',
            '  vec3 nebulaBlue = vec3(0.02, 0.04, 0.15) * density * 0.9;',
            '  vec3 nebulaTeal = vec3(0.01, 0.10, 0.12) * density * 0.8;',
            '  vec3 nebulaMagenta = vec3(0.10, 0.02, 0.14) * density * 0.5;',
            '  vec3 color = nebulaBlue;',
            '  float tealMask = smoothstep(0.35, 0.6, snoise(dir * 9.0 + 21.0));',
            '  color = mix(color, nebulaTeal, tealMask * density);',
            '  float magentaMask = smoothstep(0.55, 0.8, snoise(dir * 7.0 + 43.0));',
            '  color = mix(color, nebulaMagenta, magentaMask * density * 0.6);',
            '  // Crisp parallax stars (several noise octaves for density and variety)',
            '  float s1 = snoise(dir * 60.0 + 13.7);',
            '  float s2 = snoise(dir * 120.0 + 57.3);',
            '  float s3 = snoise(dir * 240.0 + 91.1);',
            '  float starNoise = max(s1, max(s2, s3));',
            '  float stars = smoothstep(0.70, 0.95, starNoise);',
            '  color += vec3(0.9, 0.95, 1.0) * stars * 1.2;',
            '  float blueStar = smoothstep(0.82, 1.0, snoise(dir * 150.0 + 3.0));',
            '  color += vec3(0.4, 0.6, 1.0) * blueStar * 1.0;',
            '  gl_FragColor = vec4(color, 1.0);',
            '}'
        ].join('\n');
        
        var skyGeo = new THREE.SphereGeometry(skyboxRadius, 64, 64);
        var skyMat = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uTime: { value: 0 }
            },
            side: THREE.BackSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.skyboxSphere = new THREE.Mesh(skyGeo, skyMat);
        this.skyboxSphere.name = 'skybox';
        this.scene.add(this.skyboxSphere);
        
        this._skyboxTime = 0;
    }
    
    createStarfield() {
        var visual = ASTEROIDS.CONFIG.VISUAL;
        var starCount = visual.STAR_COUNT || 3000;
        var planetRadius = ASTEROIDS.CONFIG.WORLD.PLANET_RADIUS;
        
        // Dispose old starfields
        if (this.starfield) {
            this.scene.remove(this.starfield);
            this.starfield.geometry.dispose();
            this.starfield.material.dispose();
        }
        if (this.starfieldInner) {
            this.scene.remove(this.starfieldInner);
            this.starfieldInner.geometry.dispose();
            this.starfieldInner.material.dispose();
        }
        if (this.starfieldInnermost) {
            this.scene.remove(this.starfieldInnermost);
            this.starfieldInnermost.geometry.dispose();
            this.starfieldInnermost.material.dispose();
        }
        
        // Better star sprite (32x32 with radial gradient + cross flare)
        var spriteTex = this.createStarSprite();
        
        // Helper to create a star point layer
        var createStars = function(radius, count, sizeMult, layerColor) {
            var positions = new Float32Array(count * 3);
            var colors = new Float32Array(count * 3);
            var sizes = new Float32Array(count);
            
            for (var i = 0; i < count; i++) {
                var theta = Math.random() * Math.PI * 2;
                var phi = Math.acos(2 * Math.random() - 1);
                
                positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
                positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
                positions[i * 3 + 2] = Math.cos(phi) * radius;
                
                // Star colors with tints
                var colorChoice = Math.random();
                var r, g, b;
                if (colorChoice < 0.6) {
                    // White
                    r = 0.9 + Math.random() * 0.1;
                    g = 0.9 + Math.random() * 0.1;
                    b = 0.9 + Math.random() * 0.1;
                } else if (colorChoice < 0.8) {
                    // Blue tint
                    r = 0.5 + Math.random() * 0.1;
                    g = 0.5 + Math.random() * 0.2;
                    b = 0.9 + Math.random() * 0.1;
                } else if (colorChoice < 0.92) {
                    // Yellow
                    r = 0.95 + Math.random() * 0.05;
                    g = 0.9 + Math.random() * 0.1;
                    b = 0.5 + Math.random() * 0.2;
                } else {
                    // Orange
                    r = 0.95 + Math.random() * 0.05;
                    g = 0.6 + Math.random() * 0.25;
                    b = 0.3 + Math.random() * 0.3;
                }
                colors[i * 3] = r;
                colors[i * 3 + 1] = g;
                colors[i * 3 + 2] = b;
                
                sizes[i] = (0.35 + Math.random() * 2.2) * sizeMult;
            }
            
            var geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
            
            var mat = new THREE.PointsMaterial({
                size: 0.9,
                map: spriteTex,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true
            });
            return new THREE.Points(geo, mat);
        };
        
        // Fewer small distant stars; keep a modest set of brighter near stars
        var vfx = ASTEROIDS.CONFIG.VFX || {};
        var outerCount = vfx.STAR_OUTER_COUNT != null ? vfx.STAR_OUTER_COUNT : Math.floor(starCount * 0.28);
        var midCount = vfx.STAR_MID_COUNT != null ? vfx.STAR_MID_COUNT : Math.floor(starCount * 0.38);
        var innerCount = vfx.STAR_INNER_COUNT != null ? vfx.STAR_INNER_COUNT : Math.max(80, starCount - outerCount - midCount);

        // Outer starfield (further away, fewer tiny stars)
        this.starfield = createStars(planetRadius * 2 + 80, outerCount, 0.75);
        this.scene.add(this.starfield);
        this._starfieldOuterRotSpeed = 0.003;
        
        // Mid parallax starfield
        this.starfieldInner = createStars(planetRadius + 200, midCount, 1.6);
        this.scene.add(this.starfieldInner);
        this._starfieldInnerRotSpeed = 0.01;
        
        // Innermost starfield (closest, larger brighter stars)
        this.starfieldInnermost = createStars(planetRadius + 100, innerCount, 3.2);
        this.scene.add(this.starfieldInnermost);
        this._starfieldInnermostRotSpeed = 0.02;
        
        // Store reference to starfield groups for twinkle
        this._starfieldLayerGroups = [this.starfield, this.starfieldInner, this.starfieldInnermost];
    }
    
    createStarSprite() {
        var canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        var ctx = canvas.getContext('2d');
        var cx = 16, cy = 16;
        var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.08, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.7)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.15)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        
        // Add cross flare
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy);
        ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy + 14);
        ctx.stroke();
        
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    
    loadPlanet() {
        const config = this.getConfig();
        
        // Remove old planet
        if (this.planetSphere) {
            this.scene.remove(this.planetSphere);
            this.planetSphere.geometry.dispose();
            if (this.planetSphere.material.map) this.planetSphere.material.map.dispose();
            this.planetSphere.material.dispose();
        }
        
        // Remove old planet glow
        if (this.planetGlow) {
            this.scene.remove(this.planetGlow);
            this.planetGlow.geometry.dispose();
            this.planetGlow.material.dispose();
            this.planetGlow = null;
        }
        
        // Remove old Saturn ring
        if (this.saturnRing) {
            this.scene.remove(this.saturnRing);
            this.saturnRing.geometry.dispose();
            this.saturnRing.material.map.dispose();
            this.saturnRing.material.dispose();
            this.saturnRing = null;
        }

        // Remove old Earth cloud layer
        if (this.planetClouds) {
            this.scene.remove(this.planetClouds);
            this.planetClouds.geometry.dispose();
            if (this.planetClouds.material.map) this.planetClouds.material.map.dispose();
            this.planetClouds.material.dispose();
            this.planetClouds = null;
        }
        
        // Create planet sphere as a distant backdrop (FrontSide, outside the playfield)
        const geometry = new THREE.SphereGeometry(ASTEROIDS.CONFIG.WORLD.PLANET_RADIUS, 64, 64);
        // Reuse boot-time preloader texture where possible (single fetch per asset).
        const cachedTex = (ASTEROIDS.Assets && ASTEROIDS.Assets.textures) ? ASTEROIDS.Assets.textures['planet_' + config.texture] : null;
        const texture = cachedTex || new THREE.TextureLoader().load('assets/textures/' + config.texture);
        const planetBrightness = config.brightness != null ? config.brightness : 1;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(planetBrightness, planetBrightness, planetBrightness),
            side: THREE.FrontSide // Render as a seen-from-outside sphere
        });
        
        this.planetSphere = new THREE.Mesh(geometry, material);
        this.planetSphere.name = 'planet';
        this.planetSphere.position.set(0, 0, ASTEROIDS.CONFIG.WORLD.PLANET_DISTANCE); // Far behind the playfield
        this.scene.add(this.planetSphere);

        // Earth cloud layer (jpg with black as alpha; sphere just inside the atmosphere)
        if (config.cloudTexture) {
            this._createCloudLayer(config);
        }
        
        // Atmospheric glow sphere (larger, semi-transparent); skip for atmosphere:false planets
        if (config.atmosphere !== false) {
        var glowColor = ASTEROIDS.CONFIG.PLANET_GLOW_COLORS[config.name] || 0x4488ff;
        var glowGeo = new THREE.SphereGeometry(ASTEROIDS.CONFIG.WORLD.PLANET_RADIUS + (config.glowHeight != null ? config.glowHeight : 8), 48, 48);
        var glowMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(glowColor) },
                uIntensity: { value: config.glowIntensity != null ? config.glowIntensity : (ASTEROIDS.CONFIG.VFX.PLANET_GLOW_INTENSITY || 0.6) }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'varying vec3 vPosition;',
                'void main() {',
                '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
                '  vPosition = worldPos.xyz;',
                '  vNormal = normalize(mat3(modelMatrix) * normal);',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uIntensity;',
                'varying vec3 vNormal;',
                'varying vec3 vPosition;',
                'void main() {',
                '  vec3 viewDir = normalize(cameraPosition - vPosition);',
                '  float fresnel = 1.0 - abs(dot(viewDir, vNormal));',
                '  float alpha = fresnel * fresnel * uIntensity;',
                '  gl_FragColor = vec4(uColor, alpha);',
                '}'
            ].join('\n'),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.FrontSide
        });
        this.planetGlow = new THREE.Mesh(glowGeo, glowMat);
        this.planetGlow.name = 'planetGlow';
        this.planetGlow.position.set(0, 0, ASTEROIDS.CONFIG.WORLD.PLANET_DISTANCE);
        this.scene.add(this.planetGlow);
        }
        
        // Saturn rings
        if (config.name === 'Saturn') {
            this.createSaturnRing();
        }
    }
    
    _createCloudLayer(config) {
        const sign = (this._cloudSign = (this._cloudSign || 0) + 1);
        const geo = new THREE.SphereGeometry(ASTEROIDS.CONFIG.WORLD.PLANET_RADIUS + 5, 64, 64);
        const self = this;
        // Boot-time preloader already fetched every planet texture once under the
        // 'planet_' prefix; reuse it instead of issuing a second network load per level.
        const cachedCloud = (ASTEROIDS.Assets && ASTEROIDS.Assets.textures) ? ASTEROIDS.Assets.textures['planet_' + config.cloudTexture] : null;
        if (cachedCloud && cachedCloud.image) {
            self._buildCloudMesh(cachedCloud.image, sign, geo, config);
            return;
        }
        new THREE.TextureLoader().load('assets/textures/' + config.cloudTexture, function (tex) {
            if (sign !== self._cloudSign) return; // level changed while loading
            self._buildCloudMesh(tex.image, sign, geo, config);
        });
    }

    _buildCloudMesh(img, sign, geo, config) {
        if (sign !== this._cloudSign) return;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // jpg has black where there are no clouds: use luminance as alpha
            const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            data[i + 3] = lum;
        }
        ctx.putImageData(imageData, 0, 0);
        const cloudTex = new THREE.CanvasTexture(canvas);
        cloudTex.needsUpdate = true;
        const cloudEmission = config.cloudEmission != null ? config.cloudEmission : 1;
        const mat = new THREE.MeshBasicMaterial({
            map: cloudTex,
            color: new THREE.Color(cloudEmission, cloudEmission, cloudEmission),
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide
        });
        this.planetClouds = new THREE.Mesh(geo, mat);
        this.planetClouds.name = 'planetClouds';
        this.planetClouds.position.set(0, 0, ASTEROIDS.CONFIG.WORLD.PLANET_DISTANCE);
        this.scene.add(this.planetClouds);
    }

    createSaturnRing() {
        const innerR = 80;
        const outerR = innerR + (140 - 80) * 3; // 3x wider for dramatic rings
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 64);

        // RingGeometry's default UVs map like a flat rectangle, which is
        // why the texture looked stretched/laid-on-top instead of wrapped
        // around the ring. Rebuild the UVs so u = angle around the ring
        // and v = radial distance from inner to outer edge.
        const ringPos = ringGeo.attributes.position;
        const ringUvs = [];
        for (let i = 0; i < ringPos.count; i++) {
            const x = ringPos.getX(i);
            const y = ringPos.getY(i);
            const radius = Math.sqrt(x * x + y * y);
            const angle = Math.atan2(y, x);
            const v = (angle + Math.PI) / (Math.PI * 2);
            const u = (radius - innerR) / (outerR - innerR);
            ringUvs.push(u, v);
        }
        ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ringUvs, 2));

        const cachedRing = (ASTEROIDS.Assets && ASTEROIDS.Assets.textures) ? ASTEROIDS.Assets.textures['planet_2k_saturn_ring_alpha.png'] : null;
        const ringTex = cachedRing || new THREE.TextureLoader().load('assets/textures/2k_saturn_ring_alpha.png');
        ringTex.wrapS = THREE.ClampToEdgeWrapping;
        ringTex.wrapT = THREE.ClampToEdgeWrapping;
        const ringMat = new THREE.MeshBasicMaterial({
            map: ringTex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: this.getConfig().ringOpacity != null ? this.getConfig().ringOpacity : 0.8
        });
        this.saturnRing = new THREE.Mesh(ringGeo, ringMat);
        this.saturnRing.rotation.x = Math.PI / 2.3;
        this.saturnRing.position.z = ASTEROIDS.CONFIG.WORLD.PLANET_DISTANCE;
        this.saturnRing.name = 'saturnRing';
        this.scene.add(this.saturnRing);
    }
    
    update(dt) {
        var config = this.getConfig();
        
        // Animate skybox nebula shader
        if (this.skyboxSphere) {
            this.skyboxSphere.rotation.y += dt * 0.0005;
            this.skyboxSphere.rotation.x += dt * 0.00025;
            this._skyboxTime += dt;
            if (this.skyboxSphere.material.uniforms && this.skyboxSphere.material.uniforms.uTime) {
                this.skyboxSphere.material.uniforms.uTime.value = this._skyboxTime;
            }
        }
        
        // Rotate planet
        if (this.planetSphere) {
            this.planetSphere.rotation.y += config.rotationSpeed * dt;
        }
        
        // Rotate planet glow with same speed
        if (this.planetGlow) {
            this.planetGlow.rotation.y += config.rotationSpeed * dt;
        }

        // Rotate Earth cloud layer (clouds drift slightly faster than surface)
        if (this.planetClouds) {
            this.planetClouds.rotation.y += (config.rotationSpeed * 1.8) * dt;
        }
        
        // Rotate Saturn ring
        if (this.saturnRing) {
            this.saturnRing.rotation.z += dt * 0.05;
        }
        
        // Rotate starfield layers at different speeds (parallax)
        if (this.starfield) {
            this.starfield.rotation.y += dt * (this._starfieldOuterRotSpeed || 0.003);
            this.starfield.rotation.x += dt * (this._starfieldOuterRotSpeed || 0.003) * 0.4;
        }
        if (this.starfieldInner) {
            this.starfieldInner.rotation.y += dt * (this._starfieldInnerRotSpeed || 0.01);
            this.starfieldInner.rotation.x += dt * (this._starfieldInnerRotSpeed || 0.01) * 0.5;
        }
        if (this.starfieldInnermost) {
            this.starfieldInnermost.rotation.y += dt * (this._starfieldInnermostRotSpeed || 0.02);
            this.starfieldInnermost.rotation.x += dt * (this._starfieldInnermostRotSpeed || 0.02) * 0.6;
        }
        
        // Star twinkle: subtle scale oscillation on starfield layers
        this._twinkleTimer += dt * 0.5;
        var twinkleScale = Math.sin(this._twinkleTimer) * 0.05 + 1.0;
        if (this._starfieldLayerGroups) {
            for (var gi = 0; gi < this._starfieldLayerGroups.length; gi++) {
                var layer = this._starfieldLayerGroups[gi];
                if (layer) {
                    layer.scale.setScalar(twinkleScale);
                }
            }
        }
        
        // Level transition timer
        if (this.levelTransitioning) {
            this.transitionTimer -= dt;
            if (this.transitionTimer <= 0) {
                this.levelTransitioning = false;
            }
        }
        
        // Bloom transition fade
        if (this._bloomTransitionTimer > 0) {
            this._bloomTransitionTimer -= dt;
            var bloomPass = window._game ? window._game.bloomPass : null;
            if (bloomPass && this._originalBloomStrength !== null) {
                var t = Math.min(1, this._bloomTransitionTimer / 1.5);
                bloomPass.strength = this._originalBloomStrength + 
                    (ASTEROIDS.CONFIG.bloom.transitionStrength - this._originalBloomStrength) * t;
            }
            if (this._bloomTransitionTimer <= 0 && bloomPass) {
                bloomPass.strength = this._originalBloomStrength;
            }
        }
    }
    
    nextLevel() {
        this.currentLevelIndex++;
        if (this.currentLevelIndex >= ASTEROIDS.CONFIG.LEVELS.length) {
            return false; // No more levels
        }
        this.loadPlanet();
        this.levelTransitioning = true;
        this.transitionTimer = 2.0;
        
        // Trigger bloom transition
        var bloomPass = window._game ? window._game.bloomPass : null;
        if (bloomPass) {
            this._originalBloomStrength = bloomPass.strength;
            bloomPass.strength = ASTEROIDS.CONFIG.bloom.transitionStrength;
            this._bloomTransitionTimer = 1.5;
        }
        
        ASTEROIDS.Sound.levelComplete();
        return true;
    }
    
    isTransitioning() {
        return this.levelTransitioning;
    }
    
    getTransitionTimer() {
        return this.transitionTimer;
    }
    
    getName() {
        return this.getConfig().name;
    }
    
    getAsteroidCount() {
        return this.getConfig().asteroidCount;
    }
    
    getSpeedMult() {
        return this.getConfig().speedMult;
    }
    
    getCurrentLevelNumber() {
        return this.currentLevelIndex + 1;
    }
    
    reset() {
        this.currentLevelIndex = 0;
        this.levelTransitioning = false;
        this.loadPlanet();
    }
    
    dispose() {
        if (this.planetSphere) {
            this.scene.remove(this.planetSphere);
            this.planetSphere.geometry.dispose();
            if (this.planetSphere.material.map) this.planetSphere.material.map.dispose();
            this.planetSphere.material.dispose();
        }
        if (this.skyboxSphere) {
            this.scene.remove(this.skyboxSphere);
            this.skyboxSphere.geometry.dispose();
            if (this.skyboxSphere.material.map) {
                this.skyboxSphere.material.map.dispose();
            }
            this.skyboxSphere.material.dispose();
        }
        if (this.starfield) {
            this.scene.remove(this.starfield);
            this.starfield.geometry.dispose();
            this.starfield.material.dispose();
        }
        if (this.starfieldInner) {
            this.scene.remove(this.starfieldInner);
            this.starfieldInner.geometry.dispose();
            this.starfieldInner.material.dispose();
        }
        if (this.starfieldInnermost) {
            this.scene.remove(this.starfieldInnermost);
            this.starfieldInnermost.geometry.dispose();
            this.starfieldInnermost.material.dispose();
        }
        if (this.saturnRing) {
            this.scene.remove(this.saturnRing);
            this.saturnRing.geometry.dispose();
            this.saturnRing.material.map.dispose();
            this.saturnRing.material.dispose();
        }
        if (this.planetClouds) {
            this.scene.remove(this.planetClouds);
            this.planetClouds.geometry.dispose();
            if (this.planetClouds.material.map) this.planetClouds.material.map.dispose();
            this.planetClouds.material.dispose();
        }
        if (this.planetGlow) {
            this.scene.remove(this.planetGlow);
            this.planetGlow.geometry.dispose();
            this.planetGlow.material.dispose();
        }
    }
};
