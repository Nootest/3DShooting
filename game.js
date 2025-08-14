//Filename: game.js

// --- Basic Setup ---
let scene, camera, renderer;
let controls;
let paused = true;
let prevTime = performance.now();

// --- BALANCE SETTINGS ---
const INITIAL_PLAYER_HEALTH = 200; 
const ENEMY_HP = 3; 
// const ENEMY_SPEED = 2.0; // Removed, now defined during wave generation
const ENEMY_DAMAGE_PER_SECOND = 8; 
const HEALTH_PICKUP_AMOUNT = 50;
// const ENEMY_FIRE_RATE = 1000; // Removed, now defined during wave generation
const ENEMY_PROJECTILE_SPEED = 50;
const ENEMY_PROJECTILE_DAMAGE = 10;
const ENEMY_SHOOTING_RANGE = 40;

// --- WAVE SYSTEM ---
let currentWave = 0;
const totalWaves = 5;
const baseEnemiesPerWave = 10;
let waveInProgress = false;

// Player variables
let playerHealth = INITIAL_PLAYER_HEALTH;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false, isSprinting = false, isSliding = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let slideDirection = new THREE.Vector3();
let slideTimeout;

// Shield variables
const maxShieldHealth = 50;
let shieldHealth = maxShieldHealth;
let isShielding = false;
let isShieldOnCooldown = false;
const shieldCooldownTime = 15000; // 15 seconds
let shieldCooldownTimeout;
let shieldModel;

// Game elements
let enemies = [];
// worldObjects and worldObjectBoxes are replaced by instanced meshes and a spatial grid for collisions
let instancedMeshes = []; // Stores the InstancedMesh objects for raycasting
let collisionGrid = {}; // Stores voxel presence for fast collision lookups

// let projectiles = []; // Managed by ObjectPool
// let enemyProjectiles = []; // Managed by ObjectPool
// let effects = []; // Managed by ObjectPool
let healthPickups = [];
const voxelSize = 1;
const playerHeight = 1.8;
const slideHeight = 0.9;
const playerWidth = 0.5;
const enemyHeight = 1.2;
const enemyWidth = 1.2;
const moveSpeed = 3.0;
const sprintMultiplier = 2.0;
const slideSpeed = 15.0;
const slideDuration = 400; // ms
const jumpForce = 10.0;
const gravity = -35.0;
// Increased map size due to performance improvements
let mapSize = 100; 

// --- A* Pathfinding ---
let grid = [];
const gridCellSize = 2; // World units per grid cell
let gridWidth, gridHeight;

// --- Textures & Materials ---
const textureLoader = new THREE.TextureLoader();
let floorMaterial, wallMaterialStone, wallMaterialDarkStone, accentMaterial;

// Materials from Asset Library
const gunMetal = new THREE.MeshStandardMaterial({ color: 0xD1D5DB, roughness: 0.4, metalness: 0.8 });
const darkGrip = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.2 });
const greenEmissive = new THREE.MeshStandardMaterial({ color: 0x4ADE80, emissive: 0x4ADE80, emissiveIntensity: 2 });
const healthMaterial = new THREE.MeshStandardMaterial({ color: 0x34D399, roughness: 0.5 });
const healthCrossMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });


// Shooting variables
let isShooting = false;
let lastShotTime = 0;
const fireRate = 150;
let muzzleFlash;
let weaponModel;
const projectileSpeed = 100;
const clipSize = 30;
let currentAmmo = clipSize;
let isReloading = false;
const reloadTime = 1500; // ms

// UI Elements - will be initialized in init()
let enemyCountElement;
let playerHealthElement;
let playerAmmoElement;
let pauseMenu;
let menuTitle;
let damageIndicator;
let waveCountElement;
let waveMessageElement;
let minimapCanvas;
let minimapCtx;
let shieldStatusElement;


// --- Audio ---
let audioReady = false;
let shootSound, hitSound, damageSound, enemyDefeatedSound, reloadSound, pickupSound, backgroundPlayer, enemyShootSound;
const audioSettings = { musicOn: true, sfxPack: 'synth' };

/*
 * FIX: Object Pooling
 * Prevents Garbage Collection stutter by reusing objects instead of creating/destroying them rapidly.
 */
class ObjectPool {
    constructor(createFunc, initialSize = 50) {
        this.createFunc = createFunc;
        this.pool = [];
        this.active = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFunc());
        }
    }

    get() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFunc();
            // console.log("Pool empty, created new object.");
        }
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        const index = this.active.indexOf(obj);
        if (index > -1) {
            this.active.splice(index, 1);
            this.pool.push(obj);
        }
    }

    releaseAll() {
        while(this.active.length > 0) {
            this.release(this.active[0]);
        }
    }
}

let playerProjectilePool, enemyProjectilePool, effectPool;

// Initialize Pools
function setupPools() {
    const playerProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xFFEB3B });
    const enemyProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xFF5555 });
    const projectileGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
    const impactParticleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    playerProjectilePool = new ObjectPool(() => {
        const p = new THREE.Mesh(projectileGeometry, playerProjectileMaterial);
        p.visible = false; // Start invisible
        scene.add(p);
        return p;
    }, 100);

    enemyProjectilePool = new ObjectPool(() => {
        const p = new THREE.Mesh(projectileGeometry, enemyProjectileMaterial);
        p.visible = false;
        scene.add(p);
        return p;
    }, 100);

    effectPool = new ObjectPool(() => {
        // Material will be assigned later when retrieved
        const p = new THREE.Mesh(impactParticleGeo, getEffectMaterial(0xffffff)); 
        p.visible = false;
        scene.add(p);
        return p;
    }, 200);
}


/*
 * FIX: A* Priority Queue (Min-Heap Implementation)
 * Improves A* performance by optimizing the retrieval of the lowest cost node from O(N) to O(log N).
 */
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    enqueue(element) {
        this.heap.push(element);
        this.bubbleUp(this.heap.length - 1);
    }

    dequeue() {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop();
        
        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return min;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].f < this.heap[parentIndex].f) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    sinkDown(index) {
        const length = this.heap.length;
        const element = this.heap[index];
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let leftChild, rightChild;
            let swap = null;

            if (leftChildIndex < length) {
                leftChild = this.heap[leftChildIndex];
                if (leftChild.f < element.f) {
                    swap = leftChildIndex;
                }
            }
            if (rightChildIndex < length) {
                rightChild = this.heap[rightChildIndex];
                if (
                    (swap === null && rightChild.f < element.f) ||
                    (swap !== null && rightChild.f < leftChild.f)
                ) {
                    swap = rightChildIndex;
                }
            }

            if (swap === null) break;
            this.heap[index] = this.heap[swap];
            this.heap[swap] = element;
            index = swap;
        }
    }
}


// --- Initialization ---
function init() {
    // Initialize UI elements first
    enemyCountElement = document.getElementById('enemyCount');
    playerHealthElement = document.getElementById('playerHealth');
    playerAmmoElement = document.getElementById('playerAmmo');
    pauseMenu = document.getElementById('pause-menu');
    menuTitle = document.getElementById('menuTitle');
    damageIndicator = document.getElementById('damage-indicator');
    waveCountElement = document.getElementById('waveCount');
    waveMessageElement = document.getElementById('wave-message');
    minimapCanvas = document.getElementById('minimap');
    shieldStatusElement = document.getElementById('shield-status');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    // Increased fog distance for larger map
    scene.fog = new THREE.Fog(0xaaaaaa, 70, 150); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; 
    document.body.appendChild(renderer.domElement);

    minimapCtx = minimapCanvas.getContext('2d');
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;

    controls = new THREE.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    setupEventListeners();
    setupLighting();
    setupWeapon();
    setupShield();
    setupPools(); // Initialize object pools
    setupAudio(); // Initialize audio
    loadAssets(); // This will trigger world generation and game start
    animate();
}

// --- Asset Loading ---
function loadAssets() {
    // Define materials for InstancedMesh usage
    // Using MeshPhongMaterial as it supports shadows and emissive property for hit flashes
    wallMaterialStone = new THREE.MeshPhongMaterial({ color: 0x9E9E9E });
    wallMaterialDarkStone = new THREE.MeshPhongMaterial({ color: 0x616161 });
    accentMaterial = new THREE.MeshPhongMaterial({color: 0xFFC107});

    // Set a default floor material first
    floorMaterial = new THREE.MeshLambertMaterial({ color: 0x4d944d });

    const grassTexture = textureLoader.load(
        'grass.jpg',
        () => {
            // Texture loaded successfully, update the floor material
            grassTexture.wrapS = THREE.RepeatWrapping;
            grassTexture.wrapT = THREE.RepeatWrapping;
            grassTexture.repeat.set(mapSize / 8, mapSize / 8);
            floorMaterial = new THREE.MeshLambertMaterial({ map: grassTexture });
            
            // Wait for texture load before generating world and pathfinding
            generateWorld();
            generatePathfindingGrid();
            restartGame(false); // Initialize game after world is ready
        },
        undefined,
        (err) => {
            console.error('An error happened loading the texture, proceeding with fallback.', err);
            // Floor material already set to fallback color above
            generateWorld();
            generatePathfindingGrid();
            restartGame(false); // Initialize game after world is ready
        }
    );
}


// (Audio Setup functions remain the same, no performance issues identified here)
// --- Audio Setup ---
function setupAudio() {
    if (audioReady) return;
    
    try {
        backgroundPlayer = new Tone.Player({
            url: "background song.mp3",
            loop: true,
            volume: -12, 
            autostart: false,
            onerror: (e) => {
                console.warn("Background music file not found or failed to load:", e);
            }
        }).toDestination();
    } catch(e) {
        console.warn("Could not setup background player:", e);
    }
    
    changeSfxPack(audioSettings.sfxPack);

    audioReady = true;
}

async function initializeAudioContext() {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
    if (!audioReady) {
        setupAudio();
    }
    try {
        await Tone.loaded();
        if (audioSettings.musicOn && backgroundPlayer && backgroundPlayer.state !== 'started') {
            backgroundPlayer.start();
        }
    } catch (e) {
        console.warn("Background audio failed to load (likely missing background song.mp3). Proceeding without music.", e);
    }
}

function changeSfxPack(packName) {
    if (shootSound) shootSound.dispose();
    if (hitSound) hitSound.dispose();
    if (damageSound) damageSound.dispose();
    if (enemyDefeatedSound) enemyDefeatedSound.dispose();
    if (reloadSound) reloadSound.dispose();
    if (pickupSound) pickupSound.dispose();
    if (enemyShootSound) enemyShootSound.dispose();

    switch(packName) {
        case 'realistic':
            shootSound = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination();
            enemyShootSound = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).toDestination();
            hitSound = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).toDestination();
            damageSound = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 } }).toDestination();
            enemyDefeatedSound = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.1 } }).toDestination();
            reloadSound = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1 } }).toDestination();
            pickupSound = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } }).toDestination();
            break;
        case '8bit':
            shootSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } }).toDestination();
            enemyShootSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination();
            hitSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.1 } }).toDestination();
            damageSound = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).toDestination();
            enemyDefeatedSound = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0 } }).toDestination();
            reloadSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0 } }).toDestination();
            pickupSound = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } }).toDestination();
            break;
        case 'synth':
        default:
            shootSound = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 6, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).toDestination();
            enemyShootSound = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 2, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }).toDestination();
            hitSound = new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.7 }).toDestination();
            damageSound = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 } }).toDestination();
            enemyDefeatedSound = new Tone.MetalSynth({ frequency: 50, envelope: { attack: 0.001, decay: 0.4, release: 0.2 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).toDestination();
            reloadSound = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1 } }).toDestination();
            pickupSound = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } }).toDestination();
            break;
    }
}

// (Event Listeners remain the same)
function setupEventListeners() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    controls.addEventListener('lock', () => { paused = false; pauseMenu.style.display = 'none'; });
    controls.addEventListener('unlock', () => { 
        paused = true; isShooting = false; pauseMenu.style.display = 'flex'; 
        if (playerHealth > 0 && (enemies.length > 0 || currentWave < totalWaves)) {
             menuTitle.innerText = 'Paused'; 
        }
    });

    document.getElementById('resumeButton').addEventListener('click', async () => {
        await initializeAudioContext(); 
        resumeGame();
    });
    document.getElementById('restartButton').addEventListener('click', (event) => { event.stopPropagation(); restartGame(true); });
    
    document.addEventListener('mousedown', (event) => {
        if(controls.isLocked && !paused) {
            if (event.button === 0) {
                isShooting = true;
            }
            if (event.button === 2) {
                isShielding = true;
            }
        }
    });
    document.addEventListener('mouseup', (event) => {
        if (event.button === 0) {
            isShooting = false;
        }
        if (event.button === 2) {
            isShielding = false;
        }
    });
    document.addEventListener('contextmenu', event => event.preventDefault());


    document.getElementById('music-toggle').addEventListener('change', async (e) => {
        await initializeAudioContext();
        audioSettings.musicOn = e.target.checked;
        if (audioSettings.musicOn) {
            if (backgroundPlayer && backgroundPlayer.state !== 'started') {
                try {
                    backgroundPlayer.start();
                } catch(e) {
                    console.warn("Could not start background music:", e);
                }
            }
        } else {
            if (backgroundPlayer && backgroundPlayer.state === 'started') {
                backgroundPlayer.stop();
            }
        }
    });

    // Hide unused music selection UI
    document.getElementById('music-select').style.display = 'none'; 
    document.querySelector('label[for="music-select"]').style.display = 'none';

    document.getElementById('sfx-select').addEventListener('change', async (e) => {
        await initializeAudioContext();
        audioSettings.sfxPack = e.target.value;
        changeSfxPack(audioSettings.sfxPack);
    });
}

// --- Lighting (Improved shadow settings)
function setupLighting() {
    const hemiLight = new THREE.HemisphereLight( 0xeeeeff, 0x777788, 0.75 );
    hemiLight.position.set( 0.5, 1, 0.75 );
    scene.add( hemiLight );

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 15, 5);
    directionalLight.castShadow = true;
    // Configure shadow map resolution
    directionalLight.shadow.mapSize.width = 2048; // Increased resolution for better shadows
    directionalLight.shadow.mapSize.height = 2048; 

    // Configure shadow camera frustum to cover the map area
    const d = mapSize / 2;
    directionalLight.shadow.camera.left = -d;
    directionalLight.shadow.camera.right = d;
    directionalLight.shadow.camera.top = d;
    directionalLight.shadow.camera.bottom = -d;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.bias = -0.0001; // Helps prevent shadow artifacts

    scene.add(directionalLight);
}

// (Weapon and Pickup Models remain the same)
function createPistol(mainMat, gripMat, detailMat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.3), mainMat);
    body.position.y = 0.2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), gripMat);
    grip.position.set(-0.4, -0.2, 0);
    grip.rotation.z = 0.2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), mainMat);
    barrel.position.set(1, 0.2, 0);
    barrel.rotation.z = Math.PI / 2;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), detailMat);
    sight.position.set(0.5, 0.45, 0);
    group.add(body, grip, barrel, sight);
    group.children.forEach(c => c.castShadow = true);
    return group;
}

function createHealthPack(mainMat, crossMat) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mainMat);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.2), crossMat);
    crossV.position.z = 0.76;
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.2), crossMat);
    crossH.position.z = 0.76;
    group.add(box, crossV, crossH);
    group.children.forEach(c => c.castShadow = true);
    return group;
}

function setupWeapon() {
    muzzleFlash = new THREE.PointLight(0xffaa33, 0, 15);
    camera.add(muzzleFlash);
    muzzleFlash.position.set(0.1, -0.1, -0.5); 

    weaponModel = createPistol(gunMetal, darkGrip, greenEmissive);
    weaponModel.scale.set(0.2, 0.2, 0.2);
    weaponModel.position.set(0.5, -0.5, -1);
    weaponModel.basePositionZ = -1;
    weaponModel.rotation.y = Math.PI / 2;
    
    weaponModel.traverse(child => {
        child.frustumCulled = false;
        // Disable shadows on the weapon model itself to prevent artifacts when close to the camera
        child.castShadow = false; 
    });
    camera.add(weaponModel);
}

function setupShield() {
    const shieldGeometry = new THREE.PlaneGeometry(2, 2);
    const shieldMaterial = new THREE.MeshBasicMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    shieldModel = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shieldModel.position.set(0, 0, -1.5);
    shieldModel.visible = false;
    camera.add(shieldModel);
}


/*
 * FIX: Instanced Rendering & Spatial Hashing (Collision Grid)
 * Replaces individual Mesh objects with InstancedMesh for massive performance gains (fewer draw calls).
 * Uses a spatial hash map (collisionGrid) for fast collision lookups instead of iterating over bounding boxes.
 */

const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

// Helper function to generate a unique key for the spatial hash map
function getGridKey(x, y, z) {
    // Quantize coordinates to the voxel grid
    const gridX = Math.floor(x / voxelSize);
    const gridY = Math.floor(y / voxelSize);
    const gridZ = Math.floor(z / voxelSize);
    return `${gridX},${gridY},${gridZ}`;
}

function generateWorld() {
    // Clear previous world data
    collisionGrid = {};
    instancedMeshes.forEach(mesh => {
        scene.remove(mesh);
        // mesh.dispose(); // Dispose if necessary, but we reuse geometry/materials
    });
    instancedMeshes = [];

    // Add the floor
    const floorGeometry = new THREE.PlaneGeometry(mapSize, mapSize, 1, 1);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Temporary storage for instance matrices categorized by material
    const instances = {
        stone: [],
        darkStone: [],
        accent: []
    };

    // Procedural structure generation
    const structureCount = 20; // Increased count for larger map
    const dummy = new THREE.Object3D();

    for(let i = 0; i < structureCount; i++){
        const width = Math.floor(Math.random() * 6) + 5;
        const height = Math.floor(Math.random() * 12) + 5;
        const depth = Math.floor(Math.random() * 6) + 5;
        // Adjusted start coordinates for larger map
        const startX = Math.floor(Math.random() * (mapSize-20)) - (mapSize/2 - 10);
        const startZ = Math.floor(Math.random() * (mapSize-20)) - (mapSize/2 - 10);

        for(let x = 0; x < width; x++){
            for(let z = 0; z < depth; z++){
                for(let y = 0; y < height; y++){
                    // Logic to create hollow structures with windows
                    if (y == 0 || y == height -1 || x == 0 || x == width -1 || z == 0 || z == depth -1) {
                        // Window logic
                        if (y > 2 && y < height - 2 && (x == 0 || x == width -1 || z == 0 || z == depth -1)) {
                            if ((x % 3 == 0 && z % 2 == 0) || (z % 3 == 0 && x % 2 == 0)) {
                                continue; 
                            }
                        }

                        // Determine material
                        let materialType;
                        if (((x==0 || x==width-1) && (z==0 || z==depth-1)) || y == height -1) {
                            materialType = 'accent';
                        } else {
                            materialType = Math.random() > 0.8 ? 'darkStone' : 'stone';
                        }

                        // Calculate position
                        const posX = (startX + x) * voxelSize;
                        const posY = y * voxelSize + voxelSize/2;
                        const posZ = (startZ + z) * voxelSize;

                        // Update dummy object transform and store matrix
                        dummy.position.set(posX, posY, posZ);
                        dummy.updateMatrix();
                        instances[materialType].push(dummy.matrix.clone());

                        // Register voxel in the collision grid
                        const key = getGridKey(posX, posY, posZ);
                        collisionGrid[key] = { materialType: materialType, position: new THREE.Vector3(posX, posY, posZ) };
                    }
                }
            }
        }
    }

    // Create InstancedMesh for each material type
    createInstancedMesh(wallMaterialStone, instances.stone);
    createInstancedMesh(wallMaterialDarkStone, instances.darkStone);
    createInstancedMesh(accentMaterial, instances.accent);
}

function createInstancedMesh(material, matrices) {
    if (matrices.length === 0) return;

    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    for (let i = 0; i < matrices.length; i++) {
        mesh.setMatrixAt(i, matrices[i]);
    }

    scene.add(mesh);
    instancedMeshes.push(mesh);
}


// Find safe spawn location for player at game start
function findPlayerSpawnLocation() {
    const checkRadius = 3; // Check 3x3 area around spawn point
    const attempts = 100;
    
    for (let i = 0; i < attempts; i++) {
        // Try positions closer to center but not exactly at center
        const angle = Math.random() * Math.PI * 2;
        const distance = 5 + Math.random() * 15; // 5-20 units from center
        const posX = Math.cos(angle) * distance;
        const posZ = Math.sin(angle) * distance;
        
        // Check if area is clear
        let clear = true;
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
            for (let dz = -checkRadius; dz <= checkRadius; dz++) {
                for (let dy = 0; dy <= 3; dy++) { // Check up to 3 voxels high
                    const checkX = Math.floor((posX + dx * voxelSize) / voxelSize);
                    const checkY = dy;
                    const checkZ = Math.floor((posZ + dz * voxelSize) / voxelSize);
                    const key = `${checkX},${checkY},${checkZ}`;
                    
                    if (collisionGrid[key]) {
                        clear = false;
                        break;
                    }
                }
                if (!clear) break;
            }
            if (!clear) break;
        }
        
        if (clear) {
            return new THREE.Vector3(posX, 0, posZ);
        }
    }
    
    // Fallback to a position away from center
    return new THREE.Vector3(15, 0, 15);
}

// Updated findSafeSpawnLocation to use the collisionGrid
function findSafeSpawnLocation(minPlayerDistSq) {
    const playerPos = controls.getObject().position;
    let posX, posZ, distSq;
    const attempts = 100; // Increased attempts

    for (let i = 0; i < attempts; i++) { 
        posX = (Math.random() * (mapSize - 10)) - (mapSize/2 - 5);
        posZ = (Math.random() * (mapSize - 10)) - (mapSize/2 - 5);
        distSq = (posX - playerPos.x)**2 + (posZ - playerPos.z)**2;

        if (distSq < minPlayerDistSq) continue;

        // Check for collisions in the spawn area using the collision grid
        // We check a small area around the spawn point (1.5x3x1.5 bounding box approximation)
        let collision = false;
        const checkRadius = 0.75;

        // Optimized collision check: Check only the grid cells the bounding box overlaps
        const minX = Math.floor((posX - checkRadius) / voxelSize);
        const maxX = Math.floor((posX + checkRadius) / voxelSize);
        const minY = Math.floor((1.5 - 1.5) / voxelSize); // Assuming spawn Y is 1.5, height is 3
        const maxY = Math.floor((1.5 + 1.5) / voxelSize);
        const minZ = Math.floor((posZ - checkRadius) / voxelSize);
        const maxZ = Math.floor((posZ + checkRadius) / voxelSize);

        outerLoop:
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${y},${z}`;
                    if (collisionGrid[key]) {
                        collision = true;
                        break outerLoop;
                    }
                }
            }
        }
        
        if (!collision) {
            return new THREE.Vector3(posX, 1.5, posZ);
        }
    }
    // Fallback if no safe spot is found after many attempts
    console.warn("Could not find a safe spawn location.");
    return new THREE.Vector3(0, 1.5, 0); 
}

// --- Enemy Generation (Updated materials for emissive flash)
// Create a humanoid enemy model
function createHumanoidEnemy(enemyType) {
    const enemy = new THREE.Group();
    
    // Color schemes for different enemy types - more distinct
    const colors = {
        melee: {
            uniform: 0xCC0000,    // Bright red uniform
            vest: 0x660000,       // Dark red vest
            skin: 0xd4a373,       // Skin tone
            visor: 0xFF0000,      // Red visor
            accent: 0xFFAA00      // Orange accent for melee
        },
        ranged: {
            uniform: 0x0066CC,    // Bright blue uniform
            vest: 0x003366,       // Dark blue vest  
            skin: 0xd4a373,       // Skin tone
            visor: 0x0099FF,      // Blue visor
            accent: 0x00CCFF      // Cyan accent for ranged
        }
    };
    
    const scheme = colors[enemyType];
    
    // Materials
    const uniformMaterial = new THREE.MeshPhongMaterial({ 
        color: scheme.uniform,
        shininess: 30
    });
    const vestMaterial = new THREE.MeshPhongMaterial({ 
        color: scheme.vest,
        shininess: 50
    });
    const skinMaterial = new THREE.MeshPhongMaterial({ 
        color: scheme.skin,
        shininess: 10
    });
    const visorMaterial = new THREE.MeshPhongMaterial({ 
        color: scheme.visor,
        shininess: 100,
        emissive: scheme.accent,
        emissiveIntensity: 0.2
    });
    const bootMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x1a1a1a,
        shininess: 80
    });
    
    // Body proportions (scaled to 70% of original size)
    const scale = voxelSize * 0.42; // 30% smaller (0.6 * 0.7 = 0.42)
    
    // Torso (with tactical vest)
    const torsoGeometry = new THREE.BoxGeometry(scale * 1.2, scale * 1.8, scale * 0.8);
    const torso = new THREE.Mesh(torsoGeometry, uniformMaterial);
    torso.position.y = 0;
    torso.castShadow = true;
    torso.receiveShadow = true;
    enemy.add(torso);
    
    // Vest overlay
    const vestGeometry = new THREE.BoxGeometry(scale * 1.25, scale * 1.4, scale * 0.85);
    const vest = new THREE.Mesh(vestGeometry, vestMaterial);
    vest.position.y = -scale * 0.1;
    enemy.add(vest);
    
    // Head (marked for headshot detection)
    const headGeometry = new THREE.BoxGeometry(scale * 0.7, scale * 0.8, scale * 0.7);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = scale * 1.5;
    head.castShadow = true;
    head.userData.isHead = true; // Mark as head for headshot detection
    enemy.add(head);
    
    // Helmet (also counts as headshot)
    const helmetGeometry = new THREE.BoxGeometry(scale * 0.75, scale * 0.6, scale * 0.75);
    const helmet = new THREE.Mesh(helmetGeometry, vestMaterial);
    helmet.position.y = scale * 1.7;
    helmet.userData.isHead = true; // Helmet shots also count as headshots
    enemy.add(helmet);
    
    // Visor
    const visorGeometry = new THREE.BoxGeometry(scale * 0.6, scale * 0.3, scale * 0.05);
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, scale * 1.5, scale * 0.38);
    enemy.add(visor);
    
    // Arms
    const armGeometry = new THREE.BoxGeometry(scale * 0.3, scale * 1.4, scale * 0.3);
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, uniformMaterial);
    leftArm.position.set(-scale * 0.75, -scale * 0.2, 0);
    leftArm.castShadow = true;
    enemy.add(leftArm);
    
    // Right arm  
    const rightArm = new THREE.Mesh(armGeometry, uniformMaterial);
    rightArm.position.set(scale * 0.75, -scale * 0.2, 0);
    rightArm.castShadow = true;
    enemy.add(rightArm);
    
    // Hands
    const handGeometry = new THREE.BoxGeometry(scale * 0.25, scale * 0.3, scale * 0.25);
    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-scale * 0.75, -scale * 1.0, 0);
    enemy.add(leftHand);
    
    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(scale * 0.75, -scale * 1.0, 0);
    enemy.add(rightHand);
    
    // Legs
    const legGeometry = new THREE.BoxGeometry(scale * 0.4, scale * 1.6, scale * 0.4);
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, uniformMaterial);
    leftLeg.position.set(-scale * 0.35, -scale * 1.7, 0);
    leftLeg.castShadow = true;
    enemy.add(leftLeg);
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, uniformMaterial);
    rightLeg.position.set(scale * 0.35, -scale * 1.7, 0);
    rightLeg.castShadow = true;
    enemy.add(rightLeg);
    
    // Boots
    const bootGeometry = new THREE.BoxGeometry(scale * 0.45, scale * 0.3, scale * 0.5);
    const leftBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    leftBoot.position.set(-scale * 0.35, -scale * 2.6, 0);
    enemy.add(leftBoot);
    
    const rightBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    rightBoot.position.set(scale * 0.35, -scale * 2.6, 0);
    enemy.add(rightBoot);
    
    // Weapon for ranged enemies
    if (enemyType === 'ranged') {
        const weaponGeometry = new THREE.BoxGeometry(scale * 0.15, scale * 0.15, scale * 1.2);
        const weaponMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x2a2a2a,
            shininess: 100 
        });
        const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
        weapon.position.set(scale * 0.6, -scale * 0.8, scale * 0.5);
        weapon.rotation.x = -0.2;
        enemy.add(weapon);
        
        // Weapon sight
        const sightGeometry = new THREE.BoxGeometry(scale * 0.1, scale * 0.1, scale * 0.1);
        const sight = new THREE.Mesh(sightGeometry, visorMaterial);
        sight.position.set(scale * 0.6, -scale * 0.65, scale * 0.8);
        enemy.add(sight);
    }
    
    // Melee weapon (baton) for melee enemies
    if (enemyType === 'melee') {
        const batonGeometry = new THREE.CylinderGeometry(scale * 0.08, scale * 0.08, scale * 1.0);
        const batonMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x1a1a1a,
            shininess: 100,
            emissive: scheme.accent,
            emissiveIntensity: 0.1
        });
        const baton = new THREE.Mesh(batonGeometry, batonMaterial);
        baton.position.set(scale * 0.75, -scale * 0.8, 0);
        baton.rotation.z = 0.3;
        enemy.add(baton);
    }
    
    // Add identification marker for enemy type
    enemy.name = "enemyBody";
    
    // Store references to body parts for animation
    enemy.userData.leftArm = enemy.children.find(child => child.position.x < -scale * 0.7 && Math.abs(child.position.y + scale * 0.2) < 0.1);
    enemy.userData.rightArm = enemy.children.find(child => child.position.x > scale * 0.7 && Math.abs(child.position.y + scale * 0.2) < 0.1);
    enemy.userData.leftLeg = enemy.children.find(child => child.position.x < 0 && Math.abs(child.position.y + scale * 1.7) < 0.1);
    enemy.userData.rightLeg = enemy.children.find(child => child.position.x > 0 && Math.abs(child.position.y + scale * 1.7) < 0.1);
    enemy.userData.weapon = enemy.children.find(child => child.geometry && child.geometry.parameters && child.geometry.parameters.depth > scale);
    
    return enemy;
}

// Animate humanoid enemy
function animateHumanoidEnemy(enemy, delta, time) {
    const humanoidModel = enemy.children.find(child => child.name === "enemyBody");
    if (!humanoidModel) return;
    
    // Calculate movement state
    const currentSpeed = enemy.movementSpeed || 0;
    const targetSpeed = enemy.isMoving ? 1 : 0;
    enemy.movementSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, delta * 5);
    
    // Idle animation - subtle breathing and swaying
    const breathingOffset = Math.sin(enemy.animationTime * 0.5) * 0.02;
    const swayOffset = Math.sin(enemy.animationTime * 0.3) * 0.02;
    
    // Bob animation when moving
    const bobAmount = enemy.movementSpeed * 0.1;
    const bobOffset = Math.sin(enemy.animationTime * 2) * bobAmount;
    enemy.position.y = voxelSize * 1.0 + bobOffset + breathingOffset;
    
    // Rotate torso slightly for breathing effect
    humanoidModel.rotation.y = swayOffset;
    
    // Animate arms and legs if moving
    if (humanoidModel.userData.leftArm && humanoidModel.userData.rightArm) {
        const armSwing = enemy.movementSpeed * Math.sin(enemy.animationTime * 2) * 0.3;
        humanoidModel.userData.leftArm.rotation.x = armSwing;
        humanoidModel.userData.rightArm.rotation.x = -armSwing;
        
        // Add slight arm sway even when idle
        const idleArmSway = Math.sin(enemy.animationTime * 0.5 + 1) * 0.05;
        humanoidModel.userData.leftArm.rotation.z = idleArmSway;
        humanoidModel.userData.rightArm.rotation.z = -idleArmSway;
    }
    
    if (humanoidModel.userData.leftLeg && humanoidModel.userData.rightLeg) {
        const legSwing = enemy.movementSpeed * Math.sin(enemy.animationTime * 2) * 0.4;
        humanoidModel.userData.leftLeg.rotation.x = -legSwing;
        humanoidModel.userData.rightLeg.rotation.x = legSwing;
    }
    
    // Weapon aim animation for ranged enemies
    if (enemy.enemyType === 'ranged' && humanoidModel.userData.weapon) {
        const aimOffset = Math.sin(enemy.animationTime * 0.7) * 0.02;
        humanoidModel.userData.weapon.rotation.x = -0.2 + aimOffset;
    }
    
    // Update moving state for next frame
    enemy.isMoving = enemy.lastPosition && enemy.position.distanceTo(enemy.lastPosition) > 0.01;
}

function generateEnemies(count) {

    const minSpawnDistSq = 20 * 20;

    // Wave progression difficulty scaling
    const waveProgress = totalWaves > 1 ? (currentWave - 1) / (totalWaves - 1) : 1.0;
    
    // HP Scaling: Starts near base ENEMY_HP and increases linearly
    const currentHp = Math.max(1, Math.round(ENEMY_HP + waveProgress * (totalWaves - 1)));


    // Projectile Speed Scaling
    const startProjectileSpeed = ENEMY_PROJECTILE_SPEED * 0.5; 
    const endProjectileSpeed = ENEMY_PROJECTILE_SPEED * 1.5; 
    const currentProjectileSpeed = startProjectileSpeed + (endProjectileSpeed - startProjectileSpeed) * waveProgress;

    // Fire Rate Scaling (Lower value means faster firing)
    const startFireRate = 2000; // 2 seconds
    const endFireRate = 500;    // 0.5 seconds
    const currentFireRate = startFireRate - (startFireRate - endFireRate) * waveProgress;

    // Movement Speed Scaling
    const BASE_ENEMY_SPEED = 2.0;
    const startMoveSpeed = BASE_ENEMY_SPEED * 0.75;
    const endMoveSpeed = BASE_ENEMY_SPEED * 2.0;
    const currentMoveSpeed = startMoveSpeed + (endMoveSpeed - startMoveSpeed) * waveProgress;

    // Determine enemy type distribution for this wave
    let meleeRatio = 0.5; // Default 50/50 for wave 1
    if (currentWave === 2) meleeRatio = 0.4; // 40% melee, 60% ranged
    else if (currentWave === 3) meleeRatio = 0.6; // 60% melee, 40% ranged
    else if (currentWave === 4) meleeRatio = 0.3; // 30% melee, 70% ranged
    else if (currentWave === 5) meleeRatio = 0.5; // 50/50 for final wave

    let enemiesSpawned = 0;
    while (enemiesSpawned < count) {
        
        const spawnPos = findSafeSpawnLocation(minSpawnDistSq);

        // Determine enemy type for this spawn
        const isMelee = enemiesSpawned < count * meleeRatio;
        const enemyType = isMelee ? 'melee' : 'ranged';

        const enemy = new THREE.Group();
        // Create humanoid enemy model
        const humanoidModel = createHumanoidEnemy(enemyType);
        enemy.add(humanoidModel);
        enemy.position.copy(spawnPos);
        enemy.position.y += voxelSize * 1.0; // Adjust height for smaller humanoid model
        
        // Set enemy type
        enemy.enemyType = enemyType;
        
        // Assign stats based on type
        enemy.health = currentHp;
        
        if (enemyType === 'melee') {
            // Melee enemies: faster, no projectiles
            enemy.moveSpeed = currentMoveSpeed * 1.5; // 50% faster
            enemy.projectileSpeed = 0; // No projectiles
            enemy.fireRate = Infinity; // Never shoots
            enemy.baseColor = 0xff0000; // Red accent color
        } else {
            // Ranged enemies: normal speed, can shoot
            enemy.moveSpeed = currentMoveSpeed;
            enemy.projectileSpeed = currentProjectileSpeed;
            enemy.fireRate = currentFireRate;
            enemy.baseColor = 0x0066cc; // Blue accent color
        } 

        // AI state variables
        enemy.path = [];
        enemy.pathTargetIndex = 0;
        enemy.lastPathRecalc = 0;
        enemy.lastShotTime = 0;
        enemy.hitFlashTimeout = null; // To manage hit flash timing
        enemy.lastPosition = enemy.position.clone(); // Track for stuck detection
        enemy.stuckCounter = 0; // Count frames where enemy hasn't moved
        
        // Animation state for humanoid model
        enemy.animationTime = Math.random() * Math.PI * 2; // Random starting phase
        enemy.isMoving = false;
        enemy.movementSpeed = 0;
        
        scene.add(enemy);
        enemies.push(enemy);
        enemiesSpawned++;
    }
}

// (spawnHealthPickup remains the same, utilizes updated findSafeSpawnLocation)
function spawnHealthPickup() {
    const pickup = createHealthPack(healthMaterial, healthCrossMaterial);
    pickup.scale.set(0.5, 0.5, 0.5);
    const spawnPos = findSafeSpawnLocation(10*10);
    if (spawnPos) {
        pickup.position.copy(spawnPos);
        pickup.position.y = 0.75;
        pickup.castShadow = true;
        scene.add(pickup);
        healthPickups.push(pickup);
    }
}

// (onKeyDown remains the same)
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
        case 'Space': if (canJump) { velocity.y += jumpForce; canJump = false; } break;
        case 'ShiftLeft': isSprinting = true; break;
        case 'KeyC':
            if (!isSliding && canJump && (moveForward || moveBackward || moveLeft || moveRight)) {
                isSliding = true;
                canJump = false; // Cannot jump immediately after starting a slide
                // Capture the direction the player is currently moving
                slideDirection.z = Number(moveForward) - Number(moveBackward);
                slideDirection.x = Number(moveRight) - Number(moveLeft);
                slideDirection.normalize();
                
                clearTimeout(slideTimeout);
                slideTimeout = setTimeout(() => {
                    // Only stop sliding if we can stand up or if we are on the ground
                    if (canStandUp() || controls.getObject().position.y <= slideHeight + 0.1) {
                       isSliding = false;
                    }
                }, slideDuration);
            }
            break;
        case 'KeyR':
            if (!isReloading && currentAmmo < clipSize) {
                reload();
            }
            break;
    }
}

// Updated canStandUp to use collisionGrid
function canStandUp() {
    const playerPos = controls.getObject().position;
    const checkRadius = playerWidth / 2;

    // Check the space above the player's current (crouched/sliding) position
    // Optimized check using the spatial grid
    const minX = Math.floor((playerPos.x - checkRadius) / voxelSize);
    const maxX = Math.floor((playerPos.x + checkRadius) / voxelSize);
    // Start checking from the current height up to the full standing height
    const minY = Math.floor(playerPos.y / voxelSize); 
    const maxY = Math.floor((playerPos.y + (playerHeight - slideHeight)) / voxelSize);
    const minZ = Math.floor((playerPos.z - checkRadius) / voxelSize);
    const maxZ = Math.floor((playerPos.z + checkRadius) / voxelSize);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${y},${z}`;
                if (collisionGrid[key]) {
                    // Check if the voxel actually intersects the standing bounding box (more precise)
                    const voxelPos = collisionGrid[key].position;
                    const standingBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(playerPos.x, playerPos.y + (playerHeight - slideHeight)/2, playerPos.z),
                        new THREE.Vector3(playerWidth, playerHeight, playerWidth)
                    );
                    const voxelBox = new THREE.Box3().setFromCenterAndSize(voxelPos, new THREE.Vector3(voxelSize, voxelSize, voxelSize));
                    
                    if (standingBox.intersectsBox(voxelBox)) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
}

// (onKeyUp, reload remain the same)
function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveForward = false; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
        case 'KeyS': case 'ArrowDown': moveBackward = false; break;
        case 'KeyD': case 'ArrowRight': moveRight = false; break;
        case 'ShiftLeft': isSprinting = false; break;
    }
}

function reload() {
    if (isReloading || currentAmmo === clipSize) return;
    isReloading = true;
    if (audioReady && reloadSound) {
        if (audioSettings.sfxPack === 'realistic' || audioSettings.sfxPack === 'synth') reloadSound.triggerAttackRelease("4n");
        else if (audioSettings.sfxPack === '8bit') reloadSound.triggerAttackRelease("C4", "8n");
    }
    const reloadStart = performance.now();
    
    // Animate reload using requestAnimationFrame for smoother animation
    function animateReload() {
        const elapsed = performance.now() - reloadStart;
        const progress = elapsed / reloadTime;

        if (progress < 1) {
            // Smoother rotation animation
            const targetRotation = Math.PI / 4;
            weaponModel.rotation.x = THREE.MathUtils.lerp(weaponModel.rotation.x, targetRotation * (1 - Math.pow(1 - progress, 3)), 0.2);
            requestAnimationFrame(animateReload);
        } else {
            // Final state
            currentAmmo = clipSize;
            isReloading = false;
            weaponModel.rotation.x = 0;
        }
    }
    animateReload();
}


function handleShooting(time) {
    if (isShooting && (time - lastShotTime) > fireRate && currentAmmo > 0 && !isReloading) {
        lastShotTime = time;
        currentAmmo--;
        fireProjectile();
        triggerMuzzleFlash();
        triggerRecoil();
    }
}

// Updated fireProjectile to use Object Pooling
function fireProjectile() {
    if (audioReady && shootSound) {
        if (audioSettings.sfxPack === 'realistic') shootSound.triggerAttackRelease("8n");
        else if (audioSettings.sfxPack === '8bit') shootSound.triggerAttackRelease("C4", "32n");
        else shootSound.triggerAttack("C2");
    }
    
    // Get projectile from pool
    const projectile = playerProjectilePool.get();
    if (!projectile) return;

    // Use raycaster to get the EXACT direction the crosshair points to
    const raycaster = new THREE.Raycaster();
    // (0,0) in normalized device coordinates = exact center of screen where crosshair is
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // The raycaster's direction is where the crosshair actually points
    const direction = raycaster.ray.direction.clone().normalize();
    
    // COMPENSATION: Add a small upward offset to align with visual crosshair
    // This compensates for any camera/control offset issues
    const verticalOffset = 0.025; // Fine-tuned for perfect crosshair alignment
    direction.y += verticalOffset;
    direction.normalize();
    
    // Get camera position in world space (start point)
    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);
    
    // Start projectile from camera position
    const startPosition = cameraPos.clone();
    // Move forward a bit to avoid self-collision
    startPosition.add(direction.clone().multiplyScalar(1.0));
    
    // Initialize projectile with the corrected direction
    projectile.position.copy(startPosition);
    projectile.velocity = direction.clone().multiplyScalar(projectileSpeed);
    
    // Make projectile face forward
    projectile.lookAt(startPosition.clone().add(direction));
    
    projectile.lifetime = 3000; 
    projectile.spawnTime = performance.now();
    projectile.visible = true;
}

// Updated hasLineOfSight to use InstancedMeshes for raycasting
function hasLineOfSight(startPos, endPos) {
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const distance = direction.length();
    
    if (distance === 0) return true;
    direction.normalize();
    
    const raycaster = new THREE.Raycaster(startPos, direction);
    // Raycast against the instanced meshes representing the world geometry
    const intersects = raycaster.intersectObjects(instancedMeshes, false);
    
    // If an intersection occurs closer than the target distance, line of sight is blocked
    if (intersects.length > 0 && intersects[0].distance < distance) {
        return false; 
    }
    return true;
}

// Updated fireEnemyProjectile to use Object Pooling
function fireEnemyProjectile(enemy) {
    // Only ranged enemies can shoot
    if (enemy.enemyType === 'melee') return;
    
    if (audioReady && enemyShootSound) {
         if (audioSettings.sfxPack === 'realistic') enemyShootSound.triggerAttackRelease("16n");
         else if (audioSettings.sfxPack === '8bit') enemyShootSound.triggerAttackRelease("G3", "32n");
         else enemyShootSound.triggerAttack("G4");
    }
    
    // Get projectile from pool
    const projectile = enemyProjectilePool.get();
    if (!projectile) return;

    const playerPos = controls.getObject().position.clone();
    playerPos.y -= 0.5; // Aim slightly lower (torso)

    const shootDirection = new THREE.Vector3().subVectors(playerPos, enemy.position);
    shootDirection.normalize();

    // Initialize projectile state
    projectile.position.copy(enemy.position);
    // Start slightly in front of the enemy
    projectile.position.add(shootDirection.clone().multiplyScalar(1.5));
    
    projectile.velocity = shootDirection.clone().multiplyScalar(enemy.projectileSpeed);
    projectile.lookAt(playerPos);
    
    projectile.lifetime = 5000;
    projectile.spawnTime = performance.now();
    projectile.visible = true; // Make visible when fired
}

// Updated updateEnemyProjectiles to use Object Pooling and InstancedMeshes
function updateEnemyProjectiles(delta) {
    const playerPos = controls.getObject().position;
    // Approximate player bounding box
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        playerPos,
        new THREE.Vector3(playerWidth * 2, playerHeight * 2, playerWidth * 2) 
    );

    // Iterate over active enemy projectiles from the pool
    const activeProjectiles = enemyProjectilePool.active;
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const p = activeProjectiles[i];

        // Check lifetime
        if (performance.now() - p.spawnTime > p.lifetime) {
            p.visible = false;
            enemyProjectilePool.release(p);
            continue;
        }

        const move = p.velocity.clone().multiplyScalar(delta);
        const moveLen = move.length();
        
        // Approximate projectile bounding box (swept volume)
        const projectileBox = new THREE.Box3().setFromObject(p);
        const nextBox = projectileBox.clone().translate(move);
        projectileBox.union(nextBox);

        // Check collision with player
        if (projectileBox.intersectsBox(playerBox)) {
            takeDamage(ENEMY_PROJECTILE_DAMAGE);
            createImpactEffect(p.position, 5, 0xFF5555);
            p.visible = false;
            enemyProjectilePool.release(p);
            continue;
        }

        // Check collision with world geometry (InstancedMeshes)
        const ray = new THREE.Raycaster(p.position, p.velocity.clone().normalize());
        // Raycast against the instanced world meshes
        const worldHits = ray.intersectObjects(instancedMeshes, false);
        
        if (worldHits.length > 0 && worldHits[0].distance <= moveLen) {
            // Hit world geometry
            createImpactEffect(worldHits[0].point, 5, 0xAAAAAA);
            p.visible = false;
            enemyProjectilePool.release(p);
            continue;
        }

        // Update position if no collision
        p.position.add(move);
    }
}

function triggerMuzzleFlash() {
    muzzleFlash.intensity = 1.5;
    // Use setTimeout for decay
    setTimeout(() => { muzzleFlash.intensity = 0; }, 50);
}

function triggerRecoil() {
    // Simple visual recoil (kicks the weapon back)
    weaponModel.position.z += 0.1;
}

// Updated updateProjectiles to use Object Pooling and InstancedMeshes
function updateProjectiles(delta) {
    // Get all meshes from enemy models for raycasting
    const enemyBodies = [];
    enemies.forEach(enemy => {
        enemy.traverse(child => {
            if (child.isMesh) {
                enemyBodies.push(child);
            }
        });
    });

    // Iterate over active player projectiles from the pool
    const activeProjectiles = playerProjectilePool.active;
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const p = activeProjectiles[i];

        // Check lifetime
        if (performance.now() - p.spawnTime > p.lifetime) {
            p.visible = false;
            playerProjectilePool.release(p);
            continue;
        }

        const move = p.velocity.clone().multiplyScalar(delta);
        const moveLen = move.length();
        const ray = new THREE.Raycaster(p.position, p.velocity.clone().normalize());
        let hit = false, intersect = null;
        
        // Check collision with enemies
        const enemyHits = ray.intersectObjects(enemyBodies, false);
        if (enemyHits.length > 0 && enemyHits[0].distance <= moveLen) {
            hit = true; 
            intersect = enemyHits[0];
            handleEnemyHit(intersect.object);
        } else {
            // Check collision with world geometry (InstancedMeshes)
            const worldHits = ray.intersectObjects(instancedMeshes, false);
            if (worldHits.length > 0 && worldHits[0].distance <= moveLen) {
                hit = true; 
                intersect = worldHits[0];
                // Play impact sound
                if (audioReady && hitSound) {
                   if (audioSettings.sfxPack === 'realistic') hitSound.triggerAttackRelease("16n");
                   else if (audioSettings.sfxPack === '8bit') hitSound.triggerAttackRelease("C5", "32n");
                   else hitSound.triggerAttack("C4");
                }
            }
        }

        if (hit) {
            // Create impact effect
            const hitColor = (intersect && intersect.object.name === "enemyBody") ? 0xFF0000 : 0xFFA500;
            createImpactEffect(intersect.point, 10, hitColor);
            
            // Release projectile back to pool
            p.visible = false;
            playerProjectilePool.release(p);
        } else {
            // Update position if no collision
            p.position.add(move);
        }
    }
}

// Updated handleEnemyHit to use 'emissive' property (Fixes Memory Leak issue)
function handleEnemyHit(targetBody) {
     // Navigate up to find the enemy group (could be nested in humanoid model)
     let targetGroup = targetBody.parent;
     while (targetGroup && !enemies.includes(targetGroup)) {
         targetGroup = targetGroup.parent;
     }
     
     const enemyIndex = enemies.indexOf(targetGroup);
     
     // Check if enemy is valid and alive
     if (enemyIndex === -1 || !targetGroup.health || targetGroup.health <= 0) {
         return;
     }
     
     // Check if this is a headshot
     const isHeadshot = targetBody.userData && targetBody.userData.isHead === true;
     
     // Play hit marker sound (different sound for headshot)
     if (audioReady && hitSound) {
         if (isHeadshot) {
             // Higher pitched sound for headshot
             if (audioSettings.sfxPack === 'realistic') hitSound.triggerAttackRelease("8n");
             else if (audioSettings.sfxPack === '8bit') hitSound.triggerAttackRelease("A5", "16n");
             else hitSound.triggerAttack("C5");
         } else {
             // Normal hit sound
             if (audioSettings.sfxPack === 'realistic') hitSound.triggerAttackRelease("16n");
             else if (audioSettings.sfxPack === '8bit') hitSound.triggerAttackRelease("E4", "32n");
             else hitSound.triggerAttack("G3");
         }
     }
     
     // Apply damage (headshots are instant kill)
     const damage = isHeadshot ? targetGroup.health : 1;
     targetGroup.health -= damage;
     
     // Visual indicator for headshot
     if (isHeadshot) {
         // Create headshot effect
         createImpactEffect(targetGroup.position.clone().add(new THREE.Vector3(0, voxelSize * 1.5, 0)), 30, 0xFFFF00);
         
         // Add headshot text to HUD briefly
         const headshotText = document.createElement('div');
         headshotText.innerHTML = 'HEADSHOT!';
         headshotText.style.position = 'fixed';
         headshotText.style.top = '40%';
         headshotText.style.left = '50%';
         headshotText.style.transform = 'translate(-50%, -50%)';
         headshotText.style.color = '#FFD700';
         headshotText.style.fontSize = '48px';
         headshotText.style.fontWeight = 'bold';
         headshotText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
         headshotText.style.pointerEvents = 'none';
         headshotText.style.zIndex = '1000';
         document.body.appendChild(headshotText);
         
         // Remove headshot text after animation
         setTimeout(() => {
             headshotText.style.transition = 'opacity 0.5s';
             headshotText.style.opacity = '0';
             setTimeout(() => document.body.removeChild(headshotText), 500);
         }, 500);
     }

     // Visual feedback: Flash the entire enemy model
     targetGroup.traverse((child) => {
         if (child.isMesh && child.material) {
             // Store original emissive if not already stored
             if (!child.userData.originalEmissive) {
                 child.userData.originalEmissive = child.material.emissive ? 
                     child.material.emissive.clone() : new THREE.Color(0x000000);
             }
             
             // Set flash color (yellow for headshot, red for body hit)
             if (child.material.emissive) {
                 child.material.emissive.set(isHeadshot ? 0xFFFF00 : 0xFF6666);
             }
         }
     });
     
     // Clear previous timeout if hit rapidly
     if (targetGroup.hitFlashTimeout) {
         clearTimeout(targetGroup.hitFlashTimeout);
     }
     
     // Revert emissive color after a short delay
     targetGroup.hitFlashTimeout = setTimeout(() => {
         targetGroup.traverse((child) => {
             if (child.isMesh && child.material && child.material.emissive && child.userData.originalEmissive) {
                 child.material.emissive.copy(child.userData.originalEmissive);
             }
         });
         targetGroup.hitFlashTimeout = null;
     }, 150);
     
     // Handle enemy defeat
     if (targetGroup.health <= 0) {
         if (audioReady && enemyDefeatedSound) {
             if (audioSettings.sfxPack === 'realistic') enemyDefeatedSound.triggerAttackRelease("2n");
             else if (audioSettings.sfxPack === '8bit') enemyDefeatedSound.triggerAttackRelease("C3", "16n");
             else enemyDefeatedSound.triggerAttackRelease("C2", "8n");
         }
         // Create death effect
         createImpactEffect(targetGroup.position, 20, 0xFF0000);
         
         // Clean up resources
         if (targetGroup.hitFlashTimeout) clearTimeout(targetGroup.hitFlashTimeout);
         // Dispose all materials in the humanoid model
         targetGroup.traverse((child) => {
             if (child.isMesh && child.material) {
                 child.material.dispose();
             }
             if (child.geometry) {
                 child.geometry.dispose();
             }
         }); 

         // Remove enemy from scene and array
         scene.remove(targetGroup);
         enemies.splice(enemyIndex, 1);
     }
 }

// --- Effects System (Updated to use Object Pooling)

const effectMaterials = {};

// Material caching optimization
function getEffectMaterial(color) {
    if (!effectMaterials[color]) {
        effectMaterials[color] = new THREE.MeshBasicMaterial({color: color, transparent: true});
    }
    return effectMaterials[color];
}

// Updated createImpactEffect to use Object Pooling
function createImpactEffect(position, count = 10, color = 0xFFA500) {
    const mat = getEffectMaterial(color);
    for(let i = 0; i < count; i++) {
        // Get effect particle from pool
        const p = effectPool.get();
        if (!p) continue;

        // Initialize particle state
        p.material = mat; // Assign the correct material
        p.position.copy(position);
        // Random velocity for explosion effect
        p.velocity = new THREE.Vector3((Math.random()-0.5)*6, (Math.random()-0.5)*6+3, (Math.random()-0.5)*6);
        p.lifetime = 800; 
        p.spawnTime = performance.now();
        p.visible = true;
        p.scale.setScalar(1); // Reset scale
    }
}

// Updated updateEffects to use Object Pooling
function updateEffects(delta) {
    // Iterate over active effects from the pool
    const activeEffects = effectPool.active;
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const e = activeEffects[i];
        const age = performance.now() - e.spawnTime;

        // Check lifetime
        if (age > e.lifetime) {
            e.visible = false;
            effectPool.release(e);
            continue;
        }

        // Update physics (gravity)
        e.velocity.y += gravity * delta * 0.5;
        e.position.add(e.velocity.clone().multiplyScalar(delta));
        
        // Visual update (scaling down over time)
        const ageRatio = age / e.lifetime;
        e.scale.setScalar(1 - ageRatio);
    }
}

// (Game State Management functions remain the same)
function updateGameState() {
    enemyCountElement.textContent = enemies.length;
    playerHealthElement.textContent = Math.max(0, Math.round(playerHealth));
    
    // Ammo display
    if (isReloading) {
        playerAmmoElement.textContent = 'Reloading...';
    } else {
        playerAmmoElement.textContent = `${currentAmmo} / ${clipSize}`;
    }
    waveCountElement.textContent = `${Math.min(currentWave, totalWaves)} / ${totalWaves}`;

    // Shield status display
    if (isShieldOnCooldown) {
        shieldStatusElement.textContent = 'Shield: RECHARGING';
    } else {
        shieldStatusElement.textContent = `Shield: ${shieldHealth} / ${maxShieldHealth}`;
    }

    // Wave management logic
    if (enemies.length === 0 && playerHealth > 0 && !paused) {
        if (currentWave >= totalWaves) {
            // Game won condition
            if (menuTitle.innerText !== 'You Won!') {
                gameWon();
            }
        } else if (!waveInProgress) {
            // Start next wave after a delay
            waveInProgress = true;
            setTimeout(() => {
                startNextWave(); 
                waveInProgress = false;
            }, 3000);
        }
    }
}

// Alias for clarity
function updateUI() {
    updateGameState();
}

function startNextWave() {
    currentWave++;
    showWaveMessage(`Wave ${currentWave}`);
    // Calculate enemy count based on wave number
    const enemyCount = baseEnemiesPerWave + (currentWave - 1) * 3; 
    generateEnemies(enemyCount);
    // Spawn health pickup on later waves
    if (currentWave > 1) {
         spawnHealthPickup();
    }
}

function showWaveMessage(text) {
    waveMessageElement.innerText = text;
    waveMessageElement.style.opacity = 1;
    // Fade out message after delay
    setTimeout(() => { waveMessageElement.style.opacity = 0; }, 2000);
}

let damageTimeout;
function takeDamage(amount) {
    if (paused || playerHealth <= 0) return;

    let damageToPlayer = amount;

    // Shield mechanics
    if (isShielding && !isShieldOnCooldown && shieldHealth > 0) {
        const damageAbsorbed = Math.min(shieldHealth, amount);
        shieldHealth -= damageAbsorbed;
        damageToPlayer -= damageAbsorbed;

        // Shield break and cooldown logic
        if (shieldHealth <= 0) {
            isShieldOnCooldown = true;
            // Start cooldown timer
            shieldCooldownTimeout = setTimeout(() => {
                shieldHealth = maxShieldHealth;
                isShieldOnCooldown = false;
            }, shieldCooldownTime);
        }
    }

    // If damage remains after shield absorption
    if (damageToPlayer <= 0) return;

    // Play damage sound
    if (audioReady && damageSound) {
        if (audioSettings.sfxPack === 'realistic' || audioSettings.sfxPack === 'synth') damageSound.triggerAttackRelease("2n");
        else if (audioSettings.sfxPack === '8bit') damageSound.triggerAttackRelease("C2", "8n");
    }
    
    // Apply damage to health
    playerHealth -= damageToPlayer;
    
    // Visual feedback: Damage indicator overlay
    const intensity = Math.min(0.6, 0.1 + damageToPlayer / 50);
    damageIndicator.style.opacity = intensity;

    // Fade out damage indicator
    clearTimeout(damageTimeout);
    damageTimeout = setTimeout(() => { damageIndicator.style.opacity = 0; }, 300);
    
    // Game over condition
    if (playerHealth <= 0) {
        playerHealth = 0; 
        gameOver();
    }
}

function gameWon() {
    menuTitle.innerText = 'You Won!';
    controls.unlock();
}

function gameOver() {
    menuTitle.innerText = 'Game Over';
    controls.unlock(); 
    damageIndicator.style.opacity = 0.5; // Persistent red overlay on death
}

function resumeGame() {
    // If game is over or won, restart instead of resuming
    if (playerHealth <= 0 || (currentWave >= totalWaves && enemies.length === 0)) {
        restartGame(true);
    } else {
        controls.lock();
    }
}

// Updated restartGame to handle object pools and instanced meshes
function restartGame(attemptResume) {
    // Clear existing enemies and dispose their cloned materials
    enemies.forEach(e => {
        // Dispose all materials in humanoid model
        e.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.dispose();
            }
            if (child.geometry) {
                child.geometry.dispose();
            }
        });
        if (e.hitFlashTimeout) clearTimeout(e.hitFlashTimeout);
        scene.remove(e);
    }); 
    enemies = [];
    
    // Clear projectiles and effects using Object Pools
    playerProjectilePool.active.forEach(p => p.visible = false);
    playerProjectilePool.releaseAll();
    enemyProjectilePool.active.forEach(p => p.visible = false);
    enemyProjectilePool.releaseAll();
    effectPool.active.forEach(e => e.visible = false);
    effectPool.releaseAll();

    // Clear health pickups
    healthPickups.forEach(p => scene.remove(p)); 
    healthPickups = [];
    
    // Reset player state
    playerHealth = INITIAL_PLAYER_HEALTH;
    currentAmmo = clipSize;
    isReloading = false;
    isSliding = false;
    clearTimeout(slideTimeout);
    
    // Find safe spawn position for player
    const playerSpawn = findPlayerSpawnLocation();
    controls.getObject().position.set(playerSpawn.x, playerHeight, playerSpawn.z);
    velocity.set(0, 0, 0);
    isShooting = false;

    // Reset shield state
    isShielding = false;
    isShieldOnCooldown = false;
    shieldHealth = maxShieldHealth;
    clearTimeout(shieldCooldownTimeout);
    
    // Reset UI and game state
    damageIndicator.style.opacity = 0;
    currentWave = 0;
    waveInProgress = false;
    menuTitle.innerText = 'Voxel FPS';
    
    // Regenerate the world if materials are ready
    if (floorMaterial) {
        generateWorld();
        generatePathfindingGrid();
    }

    updateUI();
    
    // Attempt to lock controls if resuming
    if (attemptResume) controls.lock();
}

// Updated updateMinimap to reflect changes in world representation (using collisionGrid)
function updateMinimap() {
    if (!minimapCtx) return;

    const mapCanvasSize = 200;
    const minimapRadius = 40; // How far the minimap shows
    const mapScale = mapCanvasSize / (minimapRadius * 2);

    const playerPos = controls.getObject().position;
    // Get player rotation
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const playerRotationY = euler.y;

    // Clear canvas
    minimapCtx.clearRect(0, 0, mapCanvasSize, mapCanvasSize);

    // Set up transformation matrix to center and rotate the map around the player
    minimapCtx.save();
    minimapCtx.translate(mapCanvasSize / 2, mapCanvasSize / 2);
    minimapCtx.rotate(playerRotationY);
    // Translate based on player position (scaled)
    minimapCtx.translate(-playerPos.x * mapScale, -playerPos.z * mapScale);

    // Helper function to draw elements on the minimap
    const drawOnMap = (pos, color, size, shape) => {
        const objMapX = pos.x * mapScale;
        const objMapY = pos.z * mapScale;
        minimapCtx.fillStyle = color;
        if (shape === 'rect') {
            minimapCtx.fillRect(objMapX - size / 2, objMapY - size / 2, size, size);
        } else if (shape === 'circle') {
            minimapCtx.beginPath();
            minimapCtx.arc(objMapX, objMapY, size / 2, 0, 2 * Math.PI);
            minimapCtx.fill();
        }
    };
    
    // Draw world geometry (voxels) from the collisionGrid
    // Optimization: Only draw voxels near the player by iterating over the local grid area
    const visibleVoxelRadius = minimapRadius + 5;
    const minX = Math.floor((playerPos.x - visibleVoxelRadius) / voxelSize);
    const maxX = Math.floor((playerPos.x + visibleVoxelRadius) / voxelSize);
    const minZ = Math.floor((playerPos.z - visibleVoxelRadius) / voxelSize);
    const maxZ = Math.floor((playerPos.z + visibleVoxelRadius) / voxelSize);

    // Iterate through nearby grid cells
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            // Check multiple height levels (e.g., Y=0 to Y=25)
            for (let y = 0; y < 25; y++) {
                const key = `${x},${y},${z}`;
                if (collisionGrid[key]) {
                    const voxelData = collisionGrid[key];
                    // Draw only if above ground level
                    if (voxelData.position.y > 0.1) {
                         drawOnMap(voxelData.position, 'rgba(150, 150, 150, 0.7)', 4, 'rect');
                    }
                }
            }
        }
    }

    // Draw enemies
    enemies.forEach(enemy => {
        drawOnMap(enemy.position, '#ef5350', 8, 'circle');
    });
    
    // Draw health pickups
    healthPickups.forEach(pickup => {
        drawOnMap(pickup.position, '#00FF00', 6, 'rect');
    });

    // Restore transformation matrix
    minimapCtx.restore();

    // Draw player indicator (centered triangle)
    const playerMapX = mapCanvasSize / 2;
    const playerMapY = mapCanvasSize / 2;
    minimapCtx.fillStyle = '#42a5f5';
    minimapCtx.beginPath();
    minimapCtx.moveTo(playerMapX, playerMapY - 8);
    minimapCtx.lineTo(playerMapX - 5, playerMapY + 5);
    minimapCtx.lineTo(playerMapX + 5, playerMapY + 5);
    minimapCtx.closePath();
    minimapCtx.fill();
}

let headBobTimer = 0;
const headBobSpeed = 10.0;
const headBobAmount = 0.05;

/*
 * FIX: Improved Player Physics (Sticky Walls Fix and Spatial Hashing)
 * Handles X and Z axis movement and collision separately to allow sliding along walls instead of sticking.
 * Uses the collisionGrid for fast collision detection.
 */
function updatePlayerPhysics(delta) {
    const playerPos = controls.getObject().position;
    
    // Determine current height (sliding vs standing)
    let currentHeight = isSliding ? slideHeight : playerHeight;
    
    // Check if forced to crouch due to overhead obstacle
    if (!isSliding && playerPos.y < playerHeight - 0.1) {
        if (!canStandUp()) {
            currentHeight = slideHeight;
        }
    }

    // Apply damping (friction)
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    // Apply gravity
    velocity.y += gravity * delta;

    let moveX, moveZ;
    let currentSpeed;

    // Determine movement speed and direction
    if (isSliding) {
        currentSpeed = slideSpeed;
        direction.copy(slideDirection);
    } else {
        currentSpeed = isSprinting ? moveSpeed * sprintMultiplier : moveSpeed;
        // Reduce speed if crouching
        if (currentHeight === slideHeight) {
            currentSpeed *= 0.5;
        }
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();
    }

    // Calculate intended movement deltas
    moveX = direction.x * currentSpeed * delta;
    moveZ = direction.z * currentSpeed * delta;

    const previousPosition = playerPos.clone();

    // --- Collision Detection and Response (The Fix) ---

    // 1. Apply Y movement (gravity/jumping)
    playerPos.y += velocity.y * delta;

    // Check floor collision
    if (playerPos.y < currentHeight) {
        playerPos.y = currentHeight;
        velocity.y = 0;
        // Player can jump only if standing height is achieved
        canJump = (currentHeight === playerHeight); 
    }

    // 2. Apply X movement and resolve collisions
    // Check collision before moving to prevent tunneling
    const testPosX = playerPos.clone();
    testPosX.x += moveX;
    if (!checkCollisionAt(testPosX, currentHeight)) {
        controls.moveRight(moveX);
    }
    resolveCollisions(playerPos, currentHeight);

    // 3. Apply Z movement and resolve collisions
    // Check collision before moving to prevent tunneling
    const testPosZ = playerPos.clone();
    testPosZ.z += moveZ;
    if (!checkCollisionAt(testPosZ, currentHeight)) {
        controls.moveForward(moveZ);
    }
    resolveCollisions(playerPos, currentHeight);

    // --- End of Collision Fix ---

    // Boundary constraints (Map edges)
    const boundary = mapSize / 2 - voxelSize;
    playerPos.x = Math.max(-boundary, Math.min(boundary, playerPos.x));
    playerPos.z = Math.max(-boundary, Math.min(boundary, playerPos.z));

    // Head bobbing effect
    const movementDelta = playerPos.clone().sub(previousPosition);
    const horizontalSpeed = Math.sqrt(movementDelta.x**2 + movementDelta.z**2);
    
    if (canJump && horizontalSpeed > 0.01) {
        headBobTimer += delta * headBobSpeed * (isSprinting ? 1.5 : 1.0);
        camera.position.y = playerPos.y + Math.sin(headBobTimer) * headBobAmount;
    } else {
        // Smooth return to center if not moving or airborne
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, playerPos.y, delta * 10);
    }
}

// Check if position would cause collision
function checkCollisionAt(position, height) {
    const halfWidth = playerWidth / 2;
    const halfHeight = height / 2;
    const collisionBuffer = 0.15;
    const checkWidth = halfWidth + collisionBuffer;
    
    // Define the player bounding box at test position
    const playerBox = new THREE.Box3(
        new THREE.Vector3(position.x - checkWidth, position.y - halfHeight, position.z - checkWidth),
        new THREE.Vector3(position.x + checkWidth, position.y + halfHeight, position.z + checkWidth)
    );
    
    // Check nearby grid cells
    const minX = Math.floor(playerBox.min.x / voxelSize);
    const maxX = Math.floor(playerBox.max.x / voxelSize);
    const minY = Math.floor(playerBox.min.y / voxelSize);
    const maxY = Math.floor(playerBox.max.y / voxelSize);
    const minZ = Math.floor(playerBox.min.z / voxelSize);
    const maxZ = Math.floor(playerBox.max.z / voxelSize);
    
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${y},${z}`;
                if (collisionGrid[key]) {
                    const voxelData = collisionGrid[key];
                    const voxelBox = new THREE.Box3().setFromCenterAndSize(
                        voxelData.position, 
                        new THREE.Vector3(voxelSize, voxelSize, voxelSize)
                    );
                    
                    if (playerBox.intersectsBox(voxelBox)) {
                        return true; // Collision detected
                    }
                }
            }
        }
    }
    return false; // No collision
}

// Helper function to resolve collisions using the collisionGrid
function resolveCollisions(position, height) {
    const halfWidth = playerWidth / 2;
    const halfHeight = height / 2;
    
    // Add a small buffer to prevent getting too close to walls
    const collisionBuffer = 0.1;
    const checkWidth = halfWidth + collisionBuffer;
    
    // Define the player bounding box centered at the current position
    // Adjusted box definition for clarity and correctness
    const playerBox = new THREE.Box3(
        new THREE.Vector3(position.x - checkWidth, position.y - halfHeight, position.z - checkWidth),
        new THREE.Vector3(position.x + checkWidth, position.y + halfHeight, position.z + checkWidth)
    );


    // Determine the range of grid cells the player overlaps
    const minX = Math.floor(playerBox.min.x / voxelSize);
    const maxX = Math.floor(playerBox.max.x / voxelSize);
    const minY = Math.floor(playerBox.min.y / voxelSize);
    const maxY = Math.floor(playerBox.max.y / voxelSize);
    const minZ = Math.floor(playerBox.min.z / voxelSize);
    const maxZ = Math.floor(playerBox.max.z / voxelSize);

    // Iterate over nearby grid cells
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${y},${z}`;
                if (collisionGrid[key]) {
                    const voxelData = collisionGrid[key];
                    const voxelPos = voxelData.position;
                    
                    // Define the voxel bounding box
                    const voxelBox = new THREE.Box3().setFromCenterAndSize(
                        voxelPos, 
                        new THREE.Vector3(voxelSize, voxelSize, voxelSize)
                    );

                    // Check for intersection
                    if (playerBox.intersectsBox(voxelBox)) {
                        // Calculate overlap on each axis (Minimum Translation Vector - MTV)
                        const overlapX = Math.min(playerBox.max.x - voxelBox.min.x, voxelBox.max.x - playerBox.min.x);
                        const overlapY = Math.min(playerBox.max.y - voxelBox.min.y, voxelBox.max.y - playerBox.min.y);
                        const overlapZ = Math.min(playerBox.max.z - voxelBox.min.z, voxelBox.max.z - playerBox.min.z);

                        // Add small epsilon to prevent floating point errors
                        const epsilon = 0.01;
                        
                        // Resolve collision along the axis with the smallest overlap
                        if (overlapX < overlapY && overlapX < overlapZ) {
                            // Resolve X axis
                            if (position.x < voxelPos.x) {
                                position.x = voxelBox.min.x - checkWidth - epsilon;
                            } else {
                                position.x = voxelBox.max.x + checkWidth + epsilon;
                            }
                        } else if (overlapZ < overlapY && overlapZ < overlapX) {
                            // Resolve Z axis
                            if (position.z < voxelPos.z) {
                                position.z = voxelBox.min.z - checkWidth - epsilon;
                            } else {
                                position.z = voxelBox.max.z + checkWidth + epsilon;
                            }
                        } else {
                             // Resolve Y axis (e.g., hitting head on ceiling)
                             if (position.y < voxelPos.y) {
                                // Player is below the voxel (floor collision, usually handled by gravity check)
                                position.y = voxelBox.min.y - halfHeight - epsilon;
                            } else {
                                // Player is above the voxel (ceiling collision)
                                position.y = voxelBox.max.y + halfHeight + epsilon;
                                velocity.y = 0; // Stop upward movement
                            }
                        }
                        
                        // Update playerBox after resolution for subsequent checks
                        playerBox.set(
                             new THREE.Vector3(position.x - halfWidth, position.y - halfHeight, position.z - halfWidth),
                             new THREE.Vector3(position.x + halfWidth, position.y + halfHeight, position.z + halfWidth)
                        );
                    }
                }
            }
        }
    }
}


// (updatePickups remains the same)
function updatePickups(delta) {
    const playerPos = controls.getObject().position;
    const pickupDistanceSq = 2*2; // Interaction distance
    
    for (let i = healthPickups.length - 1; i >= 0; i--) {
        const pickup = healthPickups[i];
        
        // Animation: Rotate and float
        pickup.rotation.y += delta * 2;
        pickup.position.y = 0.75 + Math.sin(performance.now() * 0.003 + pickup.position.x) * 0.2;

        // Check proximity to player
        if (pickup.position.distanceToSquared(playerPos) < pickupDistanceSq) {
            // Check if player needs health
            if (playerHealth < INITIAL_PLAYER_HEALTH) {
                // Apply health boost
                playerHealth = Math.min(INITIAL_PLAYER_HEALTH, playerHealth + HEALTH_PICKUP_AMOUNT);
                // Play pickup sound
                if (audioReady && pickupSound) {
                    pickupSound.triggerAttackRelease("G5", "16n");
                }
                // Remove pickup
                scene.remove(pickup);
                healthPickups.splice(i, 1);
            }
        }
    }
}

// --- Pathfinding Implementation ---

// (smoothPath remains the same, utilizes updated hasLineOfSight)
function smoothPath(path) {
    if (!path || path.length < 3) {
        return path; // Not enough points to smooth
    }

    const smoothedPath = [path[0]];
    let currentIndex = 0;

    while (currentIndex < path.length - 1) {
        let lastVisibleIndex = currentIndex + 1;
        // Raycast to find the furthest reachable node from the current one
        for (let i = currentIndex + 2; i < path.length; i++) {
            if (hasLineOfSight(path[currentIndex], path[i])) {
                lastVisibleIndex = i;
            } else {
                break; // Wall is in the way
            }
        }
        smoothedPath.push(path[lastVisibleIndex]);
        currentIndex = lastVisibleIndex;
    }

    return smoothedPath;
}

// Updated generatePathfindingGrid to use collisionGrid instead of Raycasting
function generatePathfindingGrid() {
    gridWidth = Math.floor(mapSize / gridCellSize);
    gridHeight = Math.floor(mapSize / gridCellSize);
    grid = [];
    
    const clearanceHeight = 2.0; // Minimum height required for passage

    for (let y = 0; y < gridHeight; y++) {
        grid[y] = [];
        for (let x = 0; x < gridWidth; x++) {
            let isObstacle = false;
            // Calculate world coordinates for the center of the grid cell
            const worldX = (x * gridCellSize) - (mapSize / 2) + (gridCellSize / 2);
            const worldZ = (y * gridCellSize) - (mapSize / 2) + (gridCellSize / 2);

            // Check for obstacles within the clearance height using the collisionGrid
            // Optimization: Check the grid cells directly instead of raycasting
            const startY = 0.1; // Start slightly above ground
            const endY = startY + clearanceHeight;

            const minGridY = Math.floor(startY / voxelSize);
            const maxGridY = Math.floor(endY / voxelSize);
            
            // Check the grid cells corresponding to the world coordinates and height range
            const gridX_center = Math.floor(worldX / voxelSize);
            const gridZ_center = Math.floor(worldZ / voxelSize);

            // Check a small radius if gridCellSize > voxelSize
            const radius = Math.floor(gridCellSize / (2 * voxelSize));

            outerLoop:
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    for (let dy = minGridY; dy <= maxGridY; dy++) {
                        const key = `${gridX_center + dx},${dy},${gridZ_center + dz}`;
                        if (collisionGrid[key]) {
                            isObstacle = true;
                            break outerLoop;
                        }
                    }
                }
            }
            
            // Store obstacle information (1 = obstacle, 0 = free)
            grid[y][x] = isObstacle ? 1 : 0;
        }
    }
}

// (Coordinate conversion helpers remain the same)
function worldToGrid(worldPos) {
    if (!gridWidth || !gridHeight) return null;
    // Clamp coordinates to map boundaries
    const clampedX = Math.max(-mapSize/2, Math.min(mapSize/2 - 0.1, worldPos.x));
    const clampedZ = Math.max(-mapSize/2, Math.min(mapSize/2 - 0.1, worldPos.z));
    
    // Convert to grid coordinates
    const x = Math.floor((clampedX + mapSize / 2) / gridCellSize);
    const y = Math.floor((clampedZ + mapSize / 2) / gridCellSize);
    
    // Validate grid coordinates
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
        return null; 
    }
    return { x, y };
}

function gridToWorld(gridPos) {
    // Convert grid coordinates back to world coordinates (center of the cell)
    const x = (gridPos.x * gridCellSize) - (mapSize / 2) + (gridCellSize / 2);
    const z = (gridPos.y * gridCellSize) - (mapSize / 2) + (gridCellSize / 2);
    return new THREE.Vector3(x, 1.5, z); // Assuming Y=1.5 for path waypoints
}

/*
 * FIX: Optimized A* Pathfinding (Using Priority Queue)
 */
function findPath(startPos, endPos) {
    // Validate input coordinates and grid availability
    if (!startPos || !endPos || !grid[startPos.y] || !grid[endPos.y]) {
        return null;
    }
    
    // Check if start or end positions are inside obstacles
    if (grid[startPos.y][startPos.x] === 1 || grid[endPos.y][endPos.x] === 1) {
        return null;
    }

    // Initialize start and end nodes
    const startNode = { ...startPos, g: 0, h: heuristic(startPos, endPos), f: heuristic(startPos, endPos), parent: null };
    const endNode = { ...endPos };

    // Use PriorityQueue for the open list
    let openList = new PriorityQueue();
    openList.enqueue(startNode);
    
    // Use a Set for the closed list (fast lookups)
    let closedSet = new Set();
    // Use a Map to track the best G score found for nodes in the open list
    let openSetData = new Map();
    openSetData.set(`${startNode.x},${startNode.y}`, startNode);

    
    const MAX_SEARCH_STEPS = 1000; // Increased limit for larger maps
    let steps = 0;

    while (!openList.isEmpty() && steps < MAX_SEARCH_STEPS) {
        steps++;
        
        // Get the node with the lowest F score (O(log N) operation)
        let currentNode = openList.dequeue();
        const currentKey = `${currentNode.x},${currentNode.y}`;
        openSetData.delete(currentKey);


        // Goal check
        if (currentNode.x === endNode.x && currentNode.y === endNode.y) {
            // Reconstruct path
            let path = [];
            let current = currentNode;
            while (current) {
                path.push(gridToWorld(current));
                current = current.parent;
            }
            return path.reverse();
        }

        // Move current node to closed set
        closedSet.add(currentKey);

        // Explore neighbors
        const neighbors = getNeighbors(currentNode);
        for (let neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;

            // Skip if obstacle or already processed
            if (grid[neighbor.y][neighbor.x] === 1 || closedSet.has(neighborKey)) {
                continue;
            }

            // Calculate movement cost (diagonal vs straight)
            const isDiagonal = Math.abs(neighbor.x - currentNode.x) === 1 && Math.abs(neighbor.y - currentNode.y) === 1;
            const cost = isDiagonal ? 1.414 : 1;
            const gScore = currentNode.g + cost;
            
            const existingNode = openSetData.get(neighborKey);

            // Check if neighbor is in open list and if the new path is better
            if (!existingNode || gScore < existingNode.g) {
                // Found a better path
                neighbor.g = gScore;
                neighbor.h = heuristic(neighbor, endNode);
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = currentNode;
                
                // Re-enqueue the node (effective update in a basic MinHeap)
                openList.enqueue(neighbor);
                openSetData.set(neighborKey, neighbor);
            }
        }
    }

    // No path found
    return null;
}

// Heuristic function (Octile distance for 8-directional movement)
function heuristic(pos1, pos2) {
    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);
    return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
}

// Helper function to get neighboring nodes
function getNeighbors(node) {
    let neighbors = [];
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            if (x === 0 && y === 0) continue;
            
            const checkX = node.x + x;
            const checkY = node.y + y;
            
            // Check boundaries
            if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                // Diagonal movement constraint (prevent squeezing through diagonal gaps)
                if (x !== 0 && y !== 0) {
                   if (grid[node.y] && grid[node.y][node.x + x] === 1 || 
                       grid[node.y + y] && grid[node.y + y][node.x] === 1) {
                       continue;
                   }
                }
                neighbors.push({ x: checkX, y: checkY });
            }
        }
    }
    return neighbors;
}

/*
 * FIX: Enemy Separation (Anti-Clumping)
 * Implements separation steering behavior to prevent enemies from occupying the same space.
 * Also updates enemy physics to use the collisionGrid for environment collisions.
 */
function updateEnemyPhysics(delta) {
    const meleeAttackDistanceSq = 2.5 * 2.5;
    const shootingRangeSq = ENEMY_SHOOTING_RANGE * ENEMY_SHOOTING_RANGE;
    const playerPos = controls.getObject().position;
    const time = performance.now();

    // Parameters for separation behavior
    const separationRadiusSq = 3 * 3; // Distance at which enemies start repelling each other
    const separationForce = 1.5; // Strength of the repulsion
    
    // Ranged enemy kiting parameters
    const optimalRangeMin = 15; // Minimum optimal distance for ranged enemies
    const optimalRangeMax = 30; // Maximum optimal distance for ranged enemies
    const tooCloseRange = 15; // Distance at which ranged enemies start backing up

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy) continue;

        // Update animation time
        enemy.animationTime += delta * 3;
        
        // Animate humanoid model
        animateHumanoidEnemy(enemy, delta, time);
        
        const distanceToPlayer = Math.sqrt(enemy.position.distanceToSquared(playerPos));
        const distanceToPlayerSq = distanceToPlayer * distanceToPlayer;
        
        // Orient towards player
        enemy.lookAt(playerPos.x, enemy.position.y, playerPos.z);

        let shouldMove = true;
        let movementVector = new THREE.Vector3(0, 0, 0);
        let isRetreating = false;

        // --- AI Decision Making Based on Enemy Type ---
        
        if (enemy.enemyType === 'melee') {
            // MELEE ENEMY BEHAVIOR: Always try to get close
            if (distanceToPlayerSq <= meleeAttackDistanceSq) {
                // In melee range, attack!
                takeDamage(ENEMY_DAMAGE_PER_SECOND * delta);
                shouldMove = false;
            }
            // Otherwise, keep moving toward player (handled by pathfinding below)
            
        } else if (enemy.enemyType === 'ranged') {
            // RANGED ENEMY BEHAVIOR: Maintain optimal distance and shoot
            
            if (distanceToPlayer < tooCloseRange) {
                // Too close! Back away while shooting
                isRetreating = true;
                shouldMove = true;
                
                // Check line of sight for shooting
                const enemyEyePos = enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0));
                const playerTorsoPos = playerPos.clone().add(new THREE.Vector3(0, -0.5, 0));
                
                if (hasLineOfSight(enemyEyePos, playerTorsoPos)) {
                    // Can shoot while retreating
                    if (time - enemy.lastShotTime > enemy.fireRate) {
                        fireEnemyProjectile(enemy);
                        enemy.lastShotTime = time;
                    }
                }
                
            } else if (distanceToPlayer >= optimalRangeMin && distanceToPlayer <= optimalRangeMax) {
                // Optimal range - stop and shoot
                const enemyEyePos = enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0));
                const playerTorsoPos = playerPos.clone().add(new THREE.Vector3(0, -0.5, 0));
                
                if (hasLineOfSight(enemyEyePos, playerTorsoPos)) {
                    // Clear shot, stop moving and fire
                    shouldMove = false;
                    if (time - enemy.lastShotTime > enemy.fireRate) {
                        fireEnemyProjectile(enemy);
                        enemy.lastShotTime = time;
                    }
                }
                // If LOS is blocked, shouldMove remains true to reposition
                
            } else if (distanceToPlayer > optimalRangeMax) {
                // Too far, move closer (but not too close)
                shouldMove = true;
            }
        }

        // --- Pathfinding and Movement ---

        if (shouldMove) {
            if (isRetreating && enemy.enemyType === 'ranged') {
                // Ranged enemy retreating - move directly away from player
                const retreatDirection = new THREE.Vector3().subVectors(enemy.position, playerPos);
                retreatDirection.y = 0; // Keep on same plane
                retreatDirection.normalize();
                movementVector.add(retreatDirection);
                
            } else {
                // Normal pathfinding for advancement
                
                // Initialize lastPosition if it doesn't exist
                if (!enemy.lastPosition) {
                    enemy.lastPosition = enemy.position.clone();
                }
                
                // Check if enemy is stuck (hasn't moved much)
                const distanceMoved = enemy.position.distanceTo(enemy.lastPosition);
                if (distanceMoved < 0.05 && shouldMove) { // Lower threshold for stuck detection
                    enemy.stuckCounter = (enemy.stuckCounter || 0) + 1;
                } else {
                    enemy.stuckCounter = 0;
                    enemy.lastPosition.copy(enemy.position);
                    enemy.isMoving = true;
                }
                
                // Force path recalculation if stuck or time to recalculate
                const isStuck = enemy.stuckCounter > 20; // Stuck for ~0.33 seconds at 60fps
                const pathRecalcInterval = enemy.enemyType === 'melee' ? 500 : 2000; // Melee recalcs much more often
                const shouldRecalcPath = time - enemy.lastPathRecalc > pathRecalcInterval || 
                                        (enemy.path && enemy.pathTargetIndex >= enemy.path.length) ||
                                        isStuck;
                
                if (shouldRecalcPath) { 
                    const startGrid = worldToGrid(enemy.position);
                    const endGrid = worldToGrid(playerPos);
                    
                    if (startGrid && endGrid) {
                       const newPath = findPath(startGrid, endGrid);
                       if (newPath && newPath.length > 0) {
                           // Smooth the path before assigning
                           enemy.path = smoothPath(newPath); 
                           enemy.pathTargetIndex = 0;
                           
                           // If we got a new path and were stuck, reset counter
                           if (isStuck) {
                               enemy.stuckCounter = 0;
                               // Jump to first waypoint if stuck
                               if (enemy.path.length > 0) {
                                   const firstWaypoint = enemy.path[0];
                                   const toFirst = new THREE.Vector3().subVectors(firstWaypoint, enemy.position);
                                   toFirst.y = 0;
                                   if (toFirst.length() < 3) { // If first waypoint is close
                                       // Apply a stronger push toward it
                                       toFirst.normalize();
                                       movementVector.add(toFirst.multiplyScalar(2));
                                   }
                               }
                           }
                       } else {
                           enemy.path = []; // No path found
                           // If melee and no path, try direct movement with stronger force
                           if (enemy.enemyType === 'melee') {
                               const directToPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
                               directToPlayer.y = 0;
                               directToPlayer.normalize();
                               movementVector.add(directToPlayer.multiplyScalar(1.5));
                           }
                       }
                    }
                    enemy.lastPathRecalc = time;
                }

                // Follow the path
                if (enemy.path && enemy.path.length > 0 && enemy.pathTargetIndex < enemy.path.length) {
                    const targetWaypoint = enemy.path[enemy.pathTargetIndex];
                    const dirToWaypoint = new THREE.Vector3().subVectors(targetWaypoint, enemy.position);
                    dirToWaypoint.y = 0; // Constrain movement to XZ plane

                    if (dirToWaypoint.lengthSq() > 0) {
                        dirToWaypoint.normalize();
                        
                        // Stronger movement for melee enemies
                        const moveStrength = enemy.enemyType === 'melee' ? 1.2 : 1.0;
                        movementVector.add(dirToWaypoint.multiplyScalar(moveStrength));
                    }
                    
                    // Check if waypoint reached
                    if (enemy.position.distanceToSquared(targetWaypoint) < 0.5 * 0.5) {
                        enemy.pathTargetIndex++;
                    }
                } 
                
                // If stuck, try to escape
                if (isStuck) {
                    // Try moving perpendicular to the direction we want to go
                    const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
                    toPlayer.y = 0;
                    toPlayer.normalize();
                    
                    // Create perpendicular vector (90 degrees to the side)
                    const perpendicular = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
                    // Randomly choose left or right
                    if (Math.random() > 0.5) perpendicular.multiplyScalar(-1);
                    
                    movementVector.add(perpendicular.multiplyScalar(1.5));
                }
            }
        }

        // --- FIX: Separation Steering Behavior ---
        
        let separationVector = new THREE.Vector3(0, 0, 0);
        let neighborsCount = 0;

        for (let j = 0; j < enemies.length; j++) {
            if (i === j) continue; // Skip self
            
            const otherEnemy = enemies[j];
            const distanceSq = enemy.position.distanceToSquared(otherEnemy.position);

            if (distanceSq < separationRadiusSq && distanceSq > 0) {
                const diff = new THREE.Vector3().subVectors(enemy.position, otherEnemy.position);
                // Weight repulsion inversely proportional to distance (stronger when closer)
                diff.divideScalar(Math.sqrt(distanceSq)); 
                separationVector.add(diff);
                neighborsCount++;
            }
        }

        if (neighborsCount > 0) {
            separationVector.divideScalar(neighborsCount);
            separationVector.normalize();
            // Apply separation force
            movementVector.add(separationVector.multiplyScalar(separationForce));
        }

        // --- Apply Movement and Resolve Collisions ---

        if (movementVector.lengthSq() > 0) {
            movementVector.normalize();
            const enemyMove = movementVector.multiplyScalar(enemy.moveSpeed * delta);
            
            // Apply movement
            enemy.position.add(enemyMove);

            // Resolve collisions with environment using the collisionGrid
            resolveEnemyCollisions(enemy);
        }
    }
}

// Helper function for enemy collision resolution (similar to player's resolveCollisions)
function resolveEnemyCollisions(enemy) {
    const position = enemy.position;
    const halfWidth = enemyWidth / 2;
    const halfHeight = enemyHeight / 2;
    
    // Define enemy bounding box
    const enemyBox = new THREE.Box3(
        new THREE.Vector3(position.x - halfWidth, position.y - halfHeight, position.z - halfWidth),
        new THREE.Vector3(position.x + halfWidth, position.y + halfHeight, position.z + halfWidth)
    );

    // Determine grid cell range
    const minX = Math.floor(enemyBox.min.x / voxelSize);
    const maxX = Math.floor(enemyBox.max.x / voxelSize);
    const minY = Math.floor(enemyBox.min.y / voxelSize);
    const maxY = Math.floor(enemyBox.max.y / voxelSize);
    const minZ = Math.floor(enemyBox.min.z / voxelSize);
    const maxZ = Math.floor(enemyBox.max.z / voxelSize);

    // Iterate over nearby grid cells
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${y},${z}`;
                if (collisionGrid[key]) {
                    const voxelData = collisionGrid[key];
                    const voxelPos = voxelData.position;
                    
                    // Define voxel bounding box
                    const voxelBox = new THREE.Box3().setFromCenterAndSize(
                        voxelPos, 
                        new THREE.Vector3(voxelSize, voxelSize, voxelSize)
                    );

                    // Check for intersection
                    if (enemyBox.intersectsBox(voxelBox)) {
                        // Calculate overlap (MTV)
                        const overlapX = Math.min(enemyBox.max.x - voxelBox.min.x, voxelBox.max.x - enemyBox.min.x);
                        const overlapY = Math.min(enemyBox.max.y - voxelBox.min.y, voxelBox.max.y - enemyBox.min.y);
                        const overlapZ = Math.min(enemyBox.max.z - voxelBox.min.z, voxelBox.max.z - enemyBox.min.z);

                        // Resolve along the axis with the smallest overlap
                        // Prioritize XZ resolution over Y for ground units
                        if (overlapX < overlapZ && (overlapX < overlapY || overlapY > halfHeight)) {
                             if (position.x < voxelPos.x) position.x -= overlapX;
                             else position.x += overlapX;
                        } else if (overlapZ < overlapX && (overlapZ < overlapY || overlapY > halfHeight)) {
                             if (position.z < voxelPos.z) position.z -= overlapZ;
                             else position.z += overlapZ;
                        } else if (overlapY > 0) {
                            // Y resolution if necessary
                            if (position.y < voxelPos.y) position.y -= overlapY;
                            else position.y += overlapY;
                        }
                        
                        // Update enemyBox after resolution
                        enemyBox.set(
                            new THREE.Vector3(position.x - halfWidth, position.y - halfHeight, position.z - halfWidth),
                            new THREE.Vector3(position.x + halfWidth, position.y + halfHeight, position.z + halfWidth)
                        );
                    }
                }
            }
        }
    }
}


// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    // Delta time calculation with clamping to prevent large spikes (e.g., when tab is inactive)
    const delta = Math.min(0.05, (time - prevTime) / 1000); 

    // Update systems that run regardless of pause state
    updateEffects(delta);
    updateMinimap();

    // Weapon recoil recovery (smooth return to base position)
    if (weaponModel && weaponModel.position.z > weaponModel.basePositionZ && !isReloading) {
        weaponModel.position.z = THREE.MathUtils.lerp(weaponModel.position.z, weaponModel.basePositionZ, delta * 15);
    }
    
    // Shield visibility update
    if (shieldModel) {
        shieldModel.visible = isShielding && !isShieldOnCooldown && shieldHealth > 0;
    }

    // Update game logic only when active (locked controls and not paused)
    if (controls.isLocked === true && !paused) {
        updateGameState();
        updatePlayerPhysics(delta);
        updateEnemyPhysics(delta);
        updatePickups(delta);
        
        // Weapon sway animation (idle movement)
        if (weaponModel && !isReloading) {
            const swayAmount = 0.005;
            weaponModel.rotation.y = Math.sin(time * 0.001) * swayAmount + Math.PI / 2;
            weaponModel.rotation.x = Math.sin(time * 0.0015) * swayAmount;
        }
        
        handleShooting(time);
        updateProjectiles(delta);
        updateEnemyProjectiles(delta);
    }

    prevTime = time;
    // Render the scene
    renderer.render(scene, camera);
}

// --- Window Resize Handler (No changes here)
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the application
window.onload = init;