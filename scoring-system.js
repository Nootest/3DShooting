// Scoring System for FPS Game

class ScoringSystem {
    constructor() {
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('fpsHighScore') || '0');
        this.combo = 0;
        this.comboTimer = null;
        this.comboTimeout = 3000; // 3 seconds to maintain combo
        
        // Score values
        this.scoreValues = {
            enemyKill: 100,
            headshotBonus: 50,
            waveComplete: 500,
            healthPickup: 25,
            comboMultiplier: 1.5
        };
        
        this.setupUI();
    }
    
    setupUI() {
        // Create score display
        const scoreDisplay = document.createElement('div');
        scoreDisplay.id = 'score-display';
        scoreDisplay.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            color: white;
            font-size: 24px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            z-index: 999;
        `;
        scoreDisplay.innerHTML = `
            <div>Score: <span id="currentScore">0</span></div>
            <div style="font-size: 16px;">High Score: <span id="highScore">${this.highScore}</span></div>
            <div id="comboDisplay" style="font-size: 18px; color: #FFD700; display: none;">
                Combo x<span id="comboCount">0</span>
            </div>
        `;
        document.body.appendChild(scoreDisplay);
        
        this.scoreElement = document.getElementById('currentScore');
        this.highScoreElement = document.getElementById('highScore');
        this.comboDisplay = document.getElementById('comboDisplay');
        this.comboCountElement = document.getElementById('comboCount');
    }
    
    addScore(points, showFloatingText = true, position = null) {
        // Apply combo multiplier
        const comboBonus = this.combo > 1 ? Math.floor(points * (this.scoreValues.comboMultiplier - 1) * this.combo) : 0;
        const totalPoints = points + comboBonus;
        
        this.score += totalPoints;
        this.updateDisplay();
        
        // Show floating score text
        if (showFloatingText && position) {
            this.showFloatingScore(totalPoints, position, comboBonus > 0);
        }
        
        // Check for new high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('fpsHighScore', this.highScore.toString());
            this.highScoreElement.textContent = this.highScore;
            this.showNewHighScore();
        }
    }
    
    enemyKilled(isHeadshot = false, enemyPosition = null) {
        let points = this.scoreValues.enemyKill;
        if (isHeadshot) {
            points += this.scoreValues.headshotBonus;
        }
        
        // Increase combo
        this.combo++;
        this.updateCombo();
        
        this.addScore(points, true, enemyPosition);
        
        // Reset combo timer
        clearTimeout(this.comboTimer);
        this.comboTimer = setTimeout(() => this.resetCombo(), this.comboTimeout);
    }
    
    waveCompleted() {
        this.addScore(this.scoreValues.waveComplete, false);
        this.showWaveCompleteBonus();
    }
    
    healthPickedUp(pickupPosition = null) {
        this.addScore(this.scoreValues.healthPickup, true, pickupPosition);
    }
    
    updateCombo() {
        if (this.combo > 1) {
            this.comboDisplay.style.display = 'block';
            this.comboCountElement.textContent = this.combo;
            
            // Animate combo display
            this.comboDisplay.style.animation = 'none';
            setTimeout(() => {
                this.comboDisplay.style.animation = 'pulse 0.3s ease';
            }, 10);
        }
    }
    
    resetCombo() {
        this.combo = 0;
        this.comboDisplay.style.display = 'none';
    }
    
    updateDisplay() {
        // Animate score change
        this.scoreElement.style.animation = 'none';
        setTimeout(() => {
            this.scoreElement.textContent = this.score;
            this.scoreElement.style.animation = 'scoreUpdate 0.3s ease';
        }, 10);
    }
    
    showFloatingScore(points, worldPosition, isCombo = false) {
        // Convert 3D position to screen coordinates
        const vector = new THREE.Vector3(worldPosition.x, worldPosition.y + 1, worldPosition.z);
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
        
        const floatingText = document.createElement('div');
        floatingText.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            color: ${isCombo ? '#FFD700' : '#4ADE80'};
            font-size: ${isCombo ? '28px' : '24px'};
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            pointer-events: none;
            z-index: 1000;
            animation: floatUp 1.5s ease-out forwards;
        `;
        floatingText.textContent = `+${points}${isCombo ? ' COMBO!' : ''}`;
        document.body.appendChild(floatingText);
        
        setTimeout(() => floatingText.remove(), 1500);
    }
    
    showWaveCompleteBonus() {
        const bonusText = document.createElement('div');
        bonusText.style.cssText = `
            position: fixed;
            left: 50%;
            top: 30%;
            transform: translateX(-50%);
            color: #FFD700;
            font-size: 36px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            pointer-events: none;
            z-index: 1000;
            animation: waveBonus 2s ease-out forwards;
        `;
        bonusText.textContent = `Wave Complete! +${this.scoreValues.waveComplete}`;
        document.body.appendChild(bonusText);
        
        setTimeout(() => bonusText.remove(), 2000);
    }
    
    showNewHighScore() {
        const highScoreText = document.createElement('div');
        highScoreText.style.cssText = `
            position: fixed;
            left: 50%;
            top: 40%;
            transform: translateX(-50%);
            color: #FF1493;
            font-size: 42px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            pointer-events: none;
            z-index: 1000;
            animation: newHighScore 3s ease-out forwards;
        `;
        highScoreText.textContent = 'NEW HIGH SCORE!';
        document.body.appendChild(highScoreText);
        
        setTimeout(() => highScoreText.remove(), 3000);
    }
    
    reset() {
        this.score = 0;
        this.combo = 0;
        clearTimeout(this.comboTimer);
        this.updateDisplay();
        this.resetCombo();
    }
    
    getScore() {
        return this.score;
    }
    
    getHighScore() {
        return this.highScore;
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes floatUp {
        0% {
            opacity: 1;
            transform: translateY(0);
        }
        100% {
            opacity: 0;
            transform: translateY(-50px);
        }
    }
    
    @keyframes pulse {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.2);
        }
        100% {
            transform: scale(1);
        }
    }
    
    @keyframes scoreUpdate {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.1);
        }
        100% {
            transform: scale(1);
        }
    }
    
    @keyframes waveBonus {
        0% {
            opacity: 0;
            transform: translateX(-50%) scale(0.5);
        }
        50% {
            opacity: 1;
            transform: translateX(-50%) scale(1.2);
        }
        100% {
            opacity: 0;
            transform: translateX(-50%) scale(1);
        }
    }
    
    @keyframes newHighScore {
        0% {
            opacity: 0;
            transform: translateX(-50%) scale(0.5) rotate(-5deg);
        }
        25% {
            opacity: 1;
            transform: translateX(-50%) scale(1.2) rotate(5deg);
        }
        50% {
            transform: translateX(-50%) scale(1) rotate(-5deg);
        }
        75% {
            transform: translateX(-50%) scale(1.1) rotate(5deg);
        }
        100% {
            opacity: 0;
            transform: translateX(-50%) scale(1) rotate(0deg);
        }
    }
`;
document.head.appendChild(style);

// Initialize scoring system
let scoringSystem = null;

// Initialize when game starts
function initScoringSystem() {
    scoringSystem = new ScoringSystem();
    return scoringSystem;
}

// Export for use in game
window.ScoringSystem = {
    init: initScoringSystem,
    getInstance: () => scoringSystem
};