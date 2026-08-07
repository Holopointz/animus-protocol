# ANIMUS PROTOCOL

A modern 3D take on classic Asteroids starring the **Animus** deepspace ship.

Boost-lunge, free-look, asteroid splitting, drifting powerups, and planetary sectors — built with Three.js.

## Play

Open `index.html` with any static server:

```bash
python3 -m http.server 8085
# then visit http://localhost:8085
```

## Controls

| Input | Action |
|---|---|
| A / ← · D / → | Rotate |
| W / ↑ · S / ↓ | Thrust / brake |
| SPACE | Fire lasers |
| SHIFT / B | Boost lunge (rubberbands to center) |
| Q / E · R / F | Free-look yaw / pitch |
| Mouse drag | Free-look camera |
| C | Reset camera |
| P / Esc | Pause |
| ENTER | Start / restart |

## Powerups

- **Battery** — repairs shields
- **Scrap** — repairs hull
- **Food** — temporary speed buff

## Sounds

Samples live in `assets/sounds/`. The sound system auto-loads known files and keeps synth fallbacks for missing ones. Drop in:

`shield_hit.wav`, `hull_hit.wav`, `thrust.wav`, `engine.wav`, `ui_start.wav`, `ui_pause.wav`, `ui_gameover.wav`, `ui_win.wav`, `asteroid_split.wav`, `respawn.wav`, `powerup_battery.wav`, `powerup_scrap.wav`, `powerup_food.wav`

Currently shipped:

- `ambience.wav`, `boost.wav`, `death_explosion.wav`, `loot.wav`, `menu_click.wav`, `new_level.wav`, `shoot.wav`

## Stack

- Three.js r128 + bloom post-processing
- Web Audio API sample + synth hybrid SFX
- Vanilla ES5-friendly game JS

## License

All rights reserved unless otherwise noted by the repository owner.
