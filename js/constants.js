// Modern Asteroids - Game Constants
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.CONFIG = {
    // Player
    PLAYER: {
        ROTATION_SPEED: 3.2,
        THRUST_POWER: 18.0,
        DRAG: 0.985,
        MAX_SPEED: 22.0,
        SHOOT_COOLDOWN: 0.18,
        BULLET_SPEED: 55.0,
        BULLET_LIFETIME: 1.9,
        SHIELD_MAX: 100,
        HULL_MAX: 100,
        SHIELD_REGEN: 1.0,
        LIVES: 3,
        RESPAWN_INVULNERABILITY: 3.0,
        // Boost: lunge forward, hold apex ~1s (spin/shoot window), then rubberband home
        BOOST_MULTIPLIER: 1.25,
        BOOST_BURST: 42.0,
        BOOST_COOLDOWN: 1.4,
        BOOST_DURATION: 0.28,
        // Time spent parked at the boost apex before the return pull begins.
        // Gives the player a beat to turn around and fire on the way home.
        BOOST_HOLD_DURATION: 1.0,
        BOOST_DISTANCE_FRACTION: 0.30, // ~25-28% of playfield toward facing
        // Slightly softer return so the trip home is a usable firing window
        RUBBERBAND_STRENGTH: 6.5,
        RUBBERBAND_DAMPING: 0.97,
        CENTER_HOLD_RADIUS: 1.2,
        MAX_OFFSET: 55.0,
        // Mild manual thrust still allowed but spring pulls home
        MANUAL_THRUST_SCALE: 0.55
    },

    // Asteroids
    ASTEROID: {
        SIZES: ['large', 'medium', 'small'],
        LARGE_RADIUS: 4.0,
        MEDIUM_RADIUS: 2.0,
        SMALL_RADIUS: 1.0,
        LARGE_POINTS: 50,
        MEDIUM_POINTS: 100,
        SMALL_POINTS: 200,
        MIN_SPEED: 2.0,
        MAX_SPEED: 8.0,
        LOOT_DROP_CHANCE: 0.35,
        SPAWN_MARGIN: 6,
        // Bounce boundary: asteroids reflect here; slightly beyond the camera so
        // they can drift a little off-screen, but stay findable with free-look.
        BOUNDARY: { x: 36, y: 24 }
    },

    // Loot / powerups
    LOOT: {
        TYPES: ['battery', 'food', 'scrap'],
        BATTERY_CHANCE: 0.25,
        FOOD_CHANCE: 0.35,
        SCRAP_CHANCE: 0.40,
        BATTERY_SHIELD: 50,
        // Additive per food stack: mult = 1 + stacks * FOOD_SPEED_BUFF
        // (0.25 => x1.25, x1.50, x1.75, x2.00, x2.25 at 1..5 stacks)
        FOOD_SPEED_BUFF: 0.25,
        FOOD_DURATION: 6.0,
        FOOD_MAX_STACKS: 5,
        SCRAP_HEAL: 30,
        BATTERY_POINTS: 10,
        FOOD_POINTS: 5,
        SCRAP_POINTS: 15,
        COLLISION_RADIUS: 2.4,
        BATTERY_CANISTER_SCALE: 6,
        DRIFT_SPEED: 1.8,
        LIFETIME: 28.0
    },

    // Levels — each a different planet
    LEVELS: [
        { name: 'Sun', texture: '2k_sun.jpg', rotationSpeed: 0.008, asteroidCount: 3, speedMult: 0.6 },
        { name: 'Mercury', texture: '2k_mercury.jpg', rotationSpeed: 0.02, asteroidCount: 4, speedMult: 0.7, brightness: 1.0, glowIntensity: .75 , atmosphere: false},
        { name: 'Venus', texture: '2k_venus_surface.jpg', rotationSpeed: 0.015, asteroidCount: 5, speedMult: 0.8, brightness: 1.0, glowIntensity: 0.75 , atmosphere: false},
        { name: 'Earth', texture: '2k_earth_daymap.jpg', rotationSpeed: 0.03, asteroidCount: 6, speedMult: 0.9, cloudTexture: '2k_earth_clouds.jpg', cloudEmission: 3, glowHeight: 5 },
        { name: 'Mars', texture: '2k_mars.jpg', rotationSpeed: 0.025, asteroidCount: 7, speedMult: 1.0, brightness: 1.0, glowIntensity: 0.75 , atmosphere: false},
        { name: 'Jupiter', texture: '2k_jupiter.jpg', rotationSpeed: 0.04, asteroidCount: 8, speedMult: 1.2, brightness: 0.75, glowIntensity: 0.5 , atmosphere: false},
        { name: 'Saturn', texture: '2k_saturn.jpg', rotationSpeed: 0.035, asteroidCount: 9, speedMult: 1.4, brightness: 0.75, glowIntensity: 0.5, ringOpacity: 0.55 , atmosphere: false},
        { name: 'Uranus', texture: '2k_uranus.jpg', rotationSpeed: 0.02, asteroidCount: 10, speedMult: 1.6, brightness: 1.0, glowIntensity: 0.75 , atmosphere: false}
    ],

    // World
    WORLD: {
        SIZE: 100,
        PLANET_RADIUS: 85,
        PLANET_DISTANCE: -350,
        STAR_COUNT: 900,
        CAMERA_DISTANCE: 28,
        CAMERA_HEIGHT: 10
    },

    // Visual / camera
    VISUAL: {
        PARTICLE_COUNT: 50,
        CAMERA_FORWARD_OFFSET: 2,
        CAMERA_LERP: 4,
        CAMERA_BOOST_FOV: 78,
        CAMERA_BASE_FOV: 58,
        CAMERA_IDLE_BOB_AMP: 0.20,
        CAMERA_IDLE_BOB_FREQ: 0.45,
        CAMERA_LOOK_SPEED: 1.6,
        CAMERA_LOOK_PITCH_MAX: 0.75,
        CAMERA_LOOK_YAW_MAX: 1.15,
        CAMERA_MOUSE_SENS: 0.0022,
        STAR_PARALLAX_INNER_RADIUS: 150,
        STAR_PARALLAX_OUTER_RADIUS: 350,
        STAR_COUNT: 900,
        SKYBOX_RADIUS: 500,
        SKYBOX_COLOR_HUE: 0.7,
        SUN_DIRECTION: {x: 100, y: 50, z: 80},
        SUN_COLOR: 0xffeedd,
        SUN_INTENSITY: 1.5,
        BLOOM_STRENGTH: 2.5,
        BLOOM_RADIUS: 0.8,
        BLOOM_THRESHOLD: 0.5,
        FOG_COLOR: 0x000011,
        FOG_DENSITY: 0.00025,
        CAMERA_SHAKE_INTENSITY: 1.0,
        CAMERA_SHAKE_DURATION: 0.3
    },

    bloom: {
        strength: 1.05,
        radius: 0.65,
        threshold: 0.70,
        transitionStrength: 1.5
    },
    film: false,

    VFX: {
        EXPLOSION_PARTICLE_COUNT: 100,
        EXPLOSION_SPARK_COUNT: 30,
        EXPLOSION_LIGHT_INTENSITY: 4,
        EXPLOSION_LIGHT_DISTANCE: 20,
        EXPLOSION_LIGHT_DURATION: 0.8,
        EXPLOSION_SPRITE_FPS: 45,
        EXPLOSION_SPRITE_SCALE: 10,
        VIGNETTE_STRENGTH: 0.32,
        CHROMATIC_ABERRATION: 0.003,
        CHROMATIC_BOOST_MULT: 3.0,
        RADIAL_BLUR_BOOST: 0.45,
        PLANET_GLOW_INTENSITY: 1.2,
        NEBULA_OPACITY: 0.08,
        STAR_INNER_RADIUS: 145,
        STAR_MID_RADIUS: 240,
        STAR_OUTER_RADIUS: 350,
        STAR_INNER_COUNT: 180,
        STAR_MID_COUNT: 350,
        STAR_OUTER_COUNT: 250,
        DAMAGE_SPARK_RATE_50: 0.3,
        DAMAGE_SPARK_RATE_25: 0.15,
        DAMAGE_SMOKE_RATE: 0.15
    },

    PLANET_GLOW_COLORS: {
        'Sun': 0xffcc44,
        'Mercury': 0x888888,
        'Venus': 0xff9944,
        'Earth': 0x4488ff,
        'Mars': 0xff4422,
        'Jupiter': 0xccaa77,
        'Saturn': 0xddcc88,
        'Uranus': 0x44ccdd,
        'Neptune': 0x3355ff
    }
};


