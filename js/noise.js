// Simple 3D noise function for asteroid vertex displacement
var ASTEROIDS = window.ASTEROIDS = window.ASTEROIDS || {};

ASTEROIDS.Noise = (function() {
    function noise3D(x, y, z) {
        // Simple pseudo-random 3D noise using sine and integer parts
        let n = Math.sin(x * 1.0) * 43758.5453 +
                Math.sin(y * 1.3) * 78901.2345 +
                Math.sin(z * 1.7) * 41623.7891;
        n = Math.sin(n) * 43758.5453;
        return (n - Math.floor(n)) * 2.0 - 1.0;
    }
    
    // Fractal noise with multiple octaves
    function fbm(x, y, z, octaves, lacunarity, gain) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        octaves = octaves || 3;
        lacunarity = lacunarity || 2.0;
        gain = gain || 0.5;
        
        for (let i = 0; i < octaves; i++) {
            value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
            maxValue += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    }
    
    return { noise3D, fbm };
})();
