// Weapon System Extension for FPS Game

// Weapon type definitions
const WEAPON_TYPES = {
    PISTOL: {
        name: 'Pistol',
        damage: 1,
        fireRate: 250,
        clipSize: 15,
        reloadTime: 1200,
        projectileSpeed: 80,
        spread: 0.02,
        automatic: false,
        unlockWave: 0
    },
    ASSAULT_RIFLE: {
        name: 'Assault Rifle',
        damage: 0.8,
        fireRate: 100,
        clipSize: 30,
        reloadTime: 1800,
        projectileSpeed: 120,
        spread: 0.03,
        automatic: true,
        unlockWave: 2
    },
    SHOTGUN: {
        name: 'Shotgun',
        damage: 0.5,
        fireRate: 600,
        clipSize: 8,
        reloadTime: 2200,
        projectileSpeed: 60,
        spread: 0.15,
        automatic: false,
        pelletCount: 8,
        unlockWave: 3
    }
};

// Create assault rifle model
function createAssaultRifle(mainMat, gripMat, detailMat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.3), mainMat);
    body.position.y = 0.2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), gripMat);
    grip.position.set(-0.2, -0.1, 0);
    grip.rotation.z = 0.2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 16), mainMat);
    barrel.position.set(1.75, 0.2, 0);
    barrel.rotation.z = Math.PI / 2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.2), gripMat);
    stock.position.set(-1.5, 0.1, 0);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.15), gripMat);
    magazine.position.set(0.2, -0.2, 0);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), detailMat);
    sight.position.set(0.5, 0.5, 0);
    group.add(body, grip, barrel, stock, magazine, sight);
    group.children.forEach(c => c.castShadow = true);
    return group;
}

// Create shotgun model
function createShotgun(mainMat, gripMat, detailMat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.4), mainMat);
    body.position.y = 0.2;
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), gripMat);
    pump.position.set(0.3, 0.1, 0);
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16), mainMat);
    barrel1.position.set(1.4, 0.25, 0.08);
    barrel1.rotation.z = Math.PI / 2;
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16), mainMat);
    barrel2.position.set(1.4, 0.25, -0.08);
    barrel2.rotation.z = Math.PI / 2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.25), gripMat);
    stock.position.set(-1.3, 0.05, 0);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), detailMat);
    sight.position.set(0.3, 0.55, 0);
    group.add(body, pump, barrel1, barrel2, stock, sight);
    group.children.forEach(c => c.castShadow = true);
    return group;
}

// Initialize weapon system
function initWeaponSystem() {
    // This will be called from setupWeapon
    weapons = [
        {
            ...WEAPON_TYPES.PISTOL,
            model: createPistol(gunMetal, darkGrip, greenEmissive),
            currentAmmo: WEAPON_TYPES.PISTOL.clipSize
        },
        {
            ...WEAPON_TYPES.ASSAULT_RIFLE,
            model: createAssaultRifle(gunMetal, darkGrip, greenEmissive),
            currentAmmo: WEAPON_TYPES.ASSAULT_RIFLE.clipSize
        },
        {
            ...WEAPON_TYPES.SHOTGUN,
            model: createShotgun(gunMetal, darkGrip, greenEmissive),
            currentAmmo: WEAPON_TYPES.SHOTGUN.clipSize
        }
    ];
    
    // Setup all weapon models but hide them initially
    weapons.forEach((weapon, index) => {
        weapon.model.scale.set(0.2, 0.2, 0.2);
        weapon.model.position.set(0.5, -0.5, -1);
        weapon.model.basePositionZ = -1;
        weapon.model.rotation.y = Math.PI / 2;
        weapon.model.visible = false;
        
        weapon.model.traverse(child => {
            child.frustumCulled = false;
            child.castShadow = false;
        });
        
        camera.add(weapon.model);
    });
    
    return weapons;
}

// Switch weapon function
function switchWeapon(index) {
    if (index < 0 || index >= weapons.length || !unlockedWeapons[index]) return;
    if (isReloading) return; // Can't switch while reloading
    
    // Hide current weapon
    if (weaponModel) {
        weaponModel.visible = false;
    }
    
    // Switch to new weapon
    currentWeaponIndex = index;
    currentWeapon = weapons[index];
    weaponModel = currentWeapon.model;
    weaponModel.visible = true;
    currentAmmo = currentWeapon.currentAmmo;
    
    // Update UI
    updateAmmoDisplay();
    showWeaponSwitchMessage(currentWeapon.name);
}

// Show weapon switch message
function showWeaponSwitchMessage(weaponName) {
    const existingMessage = document.getElementById('weapon-switch-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const message = document.createElement('div');
    message.id = 'weapon-switch-message';
    message.textContent = `Switched to ${weaponName}`;
    message.style.cssText = `
        position: fixed;
        top: 20%;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-size: 24px;
        font-weight: bold;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        z-index: 1000;
        pointer-events: none;
        transition: opacity 0.5s;
    `;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.style.opacity = '0';
        setTimeout(() => message.remove(), 500);
    }, 1500);
}

// Enhanced fire projectile for weapon system
function fireProjectileEnhanced() {
    if (!currentWeapon) return;
    
    if (audioReady && shootSound) {
        if (audioSettings.sfxPack === 'realistic') shootSound.triggerAttackRelease("8n");
        else if (audioSettings.sfxPack === '8bit') shootSound.triggerAttackRelease("C4", "32n");
        else shootSound.triggerAttack("C2");
    }
    
    // Shotgun fires multiple pellets
    const pelletCount = currentWeapon.pelletCount || 1;
    
    for (let i = 0; i < pelletCount; i++) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const direction = raycaster.ray.direction.clone().normalize();
        
        // Add weapon spread
        const spread = currentWeapon.spread || 0;
        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread + 0.025; // Include vertical offset
        direction.z += (Math.random() - 0.5) * spread;
        direction.normalize();
        
        const projectile = playerProjectilePool.get();
        projectile.visible = true;
        projectile.position.copy(controls.getObject().position);
        projectile.position.y -= 0.3;
        projectile.position.add(direction.clone().multiplyScalar(1));
        
        projectile.velocity = direction.multiplyScalar(currentWeapon.projectileSpeed);
        projectile.damage = currentWeapon.damage;
    }
    
    currentAmmo--;
    currentWeapon.currentAmmo = currentAmmo;
    triggerRecoil();
    updateAmmoDisplay();
    
    // Muzzle flash effect
    muzzleFlash.intensity = 2;
    setTimeout(() => { muzzleFlash.intensity = 0; }, 50);
}

// Enhanced reload for weapon system
function reloadWeapon() {
    if (!currentWeapon || isReloading || currentAmmo === currentWeapon.clipSize) return;
    isReloading = true;
    
    if (audioReady && reloadSound) {
        if (audioSettings.sfxPack === 'realistic' || audioSettings.sfxPack === 'synth') reloadSound.triggerAttackRelease("4n");
        else if (audioSettings.sfxPack === '8bit') reloadSound.triggerAttackRelease("C4", "8n");
    }
    
    const reloadStart = performance.now();
    const reloadTime = currentWeapon.reloadTime;
    
    function animateReload() {
        const elapsed = performance.now() - reloadStart;
        const progress = elapsed / reloadTime;

        if (progress < 1) {
            const targetRotation = Math.PI / 4;
            weaponModel.rotation.x = THREE.MathUtils.lerp(weaponModel.rotation.x, targetRotation * (1 - Math.pow(1 - progress, 3)), 0.2);
            requestAnimationFrame(animateReload);
        } else {
            currentAmmo = currentWeapon.clipSize;
            currentWeapon.currentAmmo = currentAmmo;
            isReloading = false;
            weaponModel.rotation.x = 0;
            updateAmmoDisplay();
        }
    }
    animateReload();
}

// Enhanced ammo display for weapon system
function updateAmmoDisplayEnhanced() {
    if (currentWeapon) {
        playerAmmoElement.innerText = `${currentAmmo} / ${currentWeapon.clipSize}`;
        
        // Show weapon info
        let weaponInfo = document.getElementById('weapon-info');
        if (!weaponInfo) {
            weaponInfo = document.createElement('div');
            weaponInfo.id = 'weapon-info';
            weaponInfo.style.cssText = `
                position: fixed;
                bottom: 60px;
                right: 20px;
                color: white;
                font-size: 18px;
                font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            `;
            document.body.appendChild(weaponInfo);
        }
        weaponInfo.textContent = currentWeapon.name;
    }
}

// Export functions to be used in main game
window.weaponSystem = {
    WEAPON_TYPES,
    createAssaultRifle,
    createShotgun,
    initWeaponSystem,
    switchWeapon,
    fireProjectileEnhanced,
    reloadWeapon,
    updateAmmoDisplayEnhanced,
    showWeaponSwitchMessage
};