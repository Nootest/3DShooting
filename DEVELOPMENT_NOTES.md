# Development Notes & Challenges

This document outlines the technical challenges encountered during development and their solutions, providing context for future developers working on this project.

## Major Challenges & Solutions

### 1. Bullet-Crosshair Misalignment Issue

**Problem**: Bullets were consistently shooting below the crosshair, making aiming inaccurate.

**Investigation Process**:
1. Initially assumed the projectile spawn position was wrong
2. Added debug visualizations (green spheres) to show where bullets were actually going
3. Discovered that `camera.getWorldDirection()` was not aligned with the screen center
4. Found that the camera's forward vector pointed below where the crosshair visually appeared

**Root Cause**: The camera's forward direction vector didn't correspond to the exact screen center where the crosshair was positioned. This is likely due to how Three.js PointerLockControls manages the camera.

**Solution**:
```javascript
// Use raycaster to get exact screen center direction
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
const direction = raycaster.ray.direction.clone().normalize();

// Add compensation offset
const verticalOffset = 0.025; // Fine-tuned value
direction.y += verticalOffset;
direction.normalize();
```

**Key Learning**: Always use raycaster for screen-to-world calculations rather than assuming camera direction matches screen center.

### 2. Performance Optimization with Voxels

**Problem**: Rendering thousands of individual voxel meshes caused severe performance issues.

**Solution**: Implemented instanced rendering using `THREE.InstancedMesh`:
- Single draw call for all voxels of the same type
- Dramatically reduced memory usage
- Improved FPS from ~20 to 60+

### 3. Collision Detection Performance

**Problem**: Checking collisions against every voxel was computationally expensive.

**Solution**: Implemented a spatial grid system:
```javascript
// Store voxel positions in a hash map for O(1) lookups
collisionGrid[`${x},${y},${z}`] = true;
```

### 4. Enemy Pathfinding

**Problem**: Enemies needed to navigate around obstacles intelligently.

**Solution**: Implemented A* pathfinding algorithm with:
- 2D grid representation of walkable space
- Optimized heuristic function
- Path caching to reduce recalculation

### 5. Object Pooling for Projectiles

**Problem**: Creating/destroying projectiles caused memory allocation issues and GC stutters.

**Solution**: Implemented object pooling pattern:
- Pre-allocate projectile objects
- Reuse inactive projectiles
- Manage active/inactive states efficiently

### 6. Enemy Type System Implementation

**Problem**: Single enemy type made gameplay repetitive and predictable.

**Solution**: Implemented two distinct enemy types with different behaviors:
- **Melee Enemies**: Orange, 1.5x speed, rush players
- **Ranged Enemies**: Blue, maintain distance, kite when approached

**Wave Distribution**:
```javascript
// Dynamic enemy type ratios per wave
Wave 1: 50% melee, 50% ranged
Wave 2: 40% melee, 60% ranged  
Wave 3: 60% melee, 40% ranged
Wave 4: 30% melee, 70% ranged
Wave 5: 50% melee, 50% ranged
```

### 7. Melee Enemy Navigation Issues

**Problem**: Melee enemies got stuck on walls and couldn't navigate around obstacles.

**Investigation**:
1. Path recalculation was too infrequent (every 2 seconds)
2. No stuck detection mechanism
3. No recovery behavior when blocked

**Solution**: Multi-layered approach:
```javascript
// 1. Faster recalculation for melee enemies
const pathRecalcInterval = enemy.enemyType === 'melee' ? 500 : 2000;

// 2. Stuck detection
if (distanceMoved < 0.05 && shouldMove) {
    enemy.stuckCounter++;
}

// 3. Perpendicular movement to escape
if (isStuck) {
    const perpendicular = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    movementVector.add(perpendicular.multiplyScalar(1.5));
}
```

**Key improvements**:
- Melee enemies recalculate paths every 0.5 seconds
- Detect stuck state after 20 frames (~0.33 seconds)
- Move perpendicular to walls to slide along them
- Stronger movement force for melee enemies (1.2x)

## Code Architecture Decisions

### State Management
- Used module-level variables for game state
- Event-driven architecture for user input
- Clear separation between update and render loops

### Rendering Pipeline
1. Physics update (player, enemies, projectiles)
2. Collision detection
3. Visual updates (effects, UI)
4. Scene rendering

### Enemy AI System
- **Enemy Types**: Melee (rushers) and Ranged (shooters) with distinct behaviors
- **Behavior States**: 
  - Melee: Always pursuing, melee attack when close
  - Ranged: Maintain optimal distance, kite when too close, shoot when in range
- **Line of Sight**: Raycasting for visibility checks (ranged enemies only)
- **Shooting Logic**: 
  - Only ranged enemies can shoot
  - Shoot while retreating if player too close
  - Stop and shoot at optimal range (15-30 units)
- **Melee Attack**: Damage over time when < 2.5 units (melee enemies only)
- **Kiting Behavior**: Ranged enemies back away when player < 15 units
- **Stuck Recovery**: Perpendicular movement to escape walls

## Testing Approaches

### Manual Testing Checklist
- [ ] Crosshair alignment at different distances
- [ ] Projectile collision with walls
- [ ] Enemy spawn positions don't overlap
- [ ] Shield blocks damage correctly
- [ ] Wave progression works properly
- [ ] Audio plays without errors
- [ ] Performance stays above 30 FPS

### Debug Features Added
- Visual debug spheres for aim testing
- Console logging for collision events
- FPS counter (can be enabled in code)
- Collision grid visualization (commented out)

## Common Issues & Quick Fixes

### Issue: Game won't start
**Fix**: Check browser console for errors, ensure all assets are loaded

### Issue: No audio
**Fix**: Click to start game (browser autoplay policy), check audio settings in menu

### Issue: Poor performance
**Fix**: Reduce `mapSize` variable, decrease enemy count, disable shadows

### Issue: Enemies stuck in walls
**Fix**: Clear browser cache, check spawn location algorithm

## Future Optimization Opportunities

1. **Level of Detail (LOD)**: Reduce polygon count for distant objects
2. **Occlusion Culling**: Don't render objects behind walls
3. **Texture Atlasing**: Combine textures to reduce draw calls
4. **Web Workers**: Move pathfinding to separate thread
5. **WebAssembly**: Port performance-critical code to WASM

## Development Environment Setup

### Recommended Tools
- **IDE**: VS Code with Three.js snippets
- **Browser**: Chrome DevTools for profiling
- **Server**: Python SimpleHTTPServer or Node.js http-server
- **Version Control**: Git with .gitignore for node_modules

### Debugging Tips
1. Use `console.time()` and `console.timeEnd()` for performance profiling
2. Chrome DevTools Performance tab for frame analysis
3. Three.js Inspector browser extension for scene debugging
4. Add conditional breakpoints for specific game states

## Code Style Guidelines

- Use clear, descriptive variable names
- Comment complex algorithms (especially physics/math)
- Keep functions under 50 lines when possible
- Group related functionality together
- Use constants for magic numbers

## Known Limitations

1. **Browser Compatibility**: Requires modern browser with WebGL support
2. **Mobile Support**: Not optimized for touch controls
3. **Network Play**: No multiplayer functionality
4. **Save System**: Game progress is not persisted

## Contact for Questions

If you need clarification on any implementation details, consider:
1. Reviewing the inline code comments
2. Testing the specific feature in isolation
3. Checking Three.js documentation for API details
4. Creating a minimal reproduction for debugging