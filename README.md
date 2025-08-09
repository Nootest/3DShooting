# Voxel FPS Game

A browser-based first-person shooter game built with Three.js featuring voxel-style graphics, wave-based gameplay, and dynamic combat mechanics.

## Overview

This is a 3D FPS game that runs entirely in the browser using WebGL. Players fight through waves of enemies in a procedurally generated voxel world with various gameplay mechanics including shooting, shields, sliding, and health pickups.

## Features

### Core Gameplay
- **Wave System**: 5 progressively harder waves with strategic enemy type distributions
- **First-Person Shooting**: Projectile-based combat with perfectly aligned crosshair
- **Two Enemy Types**:
  - **Melee Enemies** (Orange): Fast rushers that deal close-range damage
  - **Ranged Enemies** (Blue): Shooters that maintain distance and kite when approached
- **Enemy AI**: 
  - Advanced pathfinding (A* algorithm)
  - Type-specific behaviors (rushing vs kiting)
  - Stuck detection and recovery system
  - Line-of-sight based shooting
- **Health System**: Player health with damage indicators and health pickups
- **Shield Mechanic**: Right-click activated shield with cooldown system
- **Movement Mechanics**: 
  - WASD movement
  - Sprint (Shift)
  - Jump (Space)
  - Slide (C)

### Technical Features
- **Voxel World Generation**: Procedurally generated map with walls and obstacles
- **Object Pooling**: Efficient memory management for projectiles and effects
- **Instanced Rendering**: Optimized rendering for large numbers of voxels
- **Spatial Grid Collision**: Fast collision detection system
- **Minimap**: Real-time overhead view of player and enemy positions
- **Audio System**: Dynamic sound effects using Tone.js with multiple sound packs

## Controls

- **WASD**: Move
- **Mouse**: Look around
- **Left Click**: Shoot
- **Right Click**: Shield
- **R**: Reload
- **Shift**: Sprint
- **Space**: Jump
- **C**: Slide
- **Esc**: Pause/Menu

## How to Run

1. Start a local web server in the project directory:
   ```bash
   python3 -m http.server 8000
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

3. Click on `index.html`

4. Click "Resume / Start" to begin playing

## Project Structure

```
FPS game/
├── index.html          # Main HTML file
├── game.js            # Core game logic and mechanics
├── style.css          # UI styling
├── background song.mp3 # Background music
├── grass.jpg          # Floor texture
├── wall.jpg           # Wall texture
├── README.md          # This file
└── DEVELOPMENT_NOTES.md # Technical challenges and solutions
```

## Enemy Wave Composition

- **Wave 1**: 50% melee, 50% ranged (balanced introduction)
- **Wave 2**: 40% melee, 60% ranged (ranged focus)
- **Wave 3**: 60% melee, 40% ranged (rush wave)
- **Wave 4**: 30% melee, 70% ranged (shooting gallery)
- **Wave 5**: 50% melee, 50% ranged (balanced finale)

## Technologies Used

- **Three.js**: 3D graphics rendering
- **PointerLockControls**: First-person camera controls
- **Tone.js**: Audio synthesis and effects
- **Vanilla JavaScript**: Core game logic
- **HTML5 Canvas**: Rendering and minimap

## Performance Optimizations

- Instance-based rendering for voxels
- Object pooling for projectiles and effects
- Spatial grid for collision detection
- Efficient enemy AI with optimized pathfinding
- View frustum culling

## Browser Requirements

- Modern browser with WebGL support
- Mouse with pointer lock API support
- Recommended: Chrome, Firefox, or Edge (latest versions)

## Future Improvements

- Additional weapon types
- More enemy varieties
- Power-ups and special abilities
- Multiplayer support
- Level progression system
- Save/load functionality