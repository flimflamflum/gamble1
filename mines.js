document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const minesGrid = document.getElementById('mines-grid');
    const minesCountInput = document.getElementById('mines-count');
    const gemsCountInput = document.getElementById('gems-count');
    const betAmountInput = document.getElementById('bet-amount');
    const betDisplayEl = document.getElementById('bet-display');
    const profitAmountInput = document.getElementById('profit-amount');
    const profitDisplayEl = document.getElementById('profit-display');
    const betButton = document.getElementById('bet-button');
    const cashoutButton = document.getElementById('cashout-button');
    const halfBetButton = document.getElementById('half-bet');
    const doubleBetButton = document.getElementById('double-bet');
    const manualButton = document.getElementById('manual-button');
    const autoButton = document.getElementById('auto-button');
    const gameBalanceEl = document.getElementById('game-balance');
    
    // Audio elements
    const clickSound = document.getElementById('click-sound');
    const gemSound = document.getElementById('gem-sound');
    const mineSound = document.getElementById('mine-sound');
    const cashoutSound = document.getElementById('cashout-sound');
    const lossSound = document.getElementById('loss-sound');
    
    // Game state
    const state = {
        betAmount: 100,
        minesCount: 3,
        gemsCount: 21, // Always 25 - minesCount
        revealedGems: 0,
        totalProfit: 0,
        multiplier: 1.13, // Initial multiplier
        gameActive: false,
        minePositions: [],
        tilesRevealed: [],
        maxTiles: 25
    };
    
    // SVG icons
    const gemSVG = `<svg class="gem-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path d="M378.7 32H133.3L256 182.7L378.7 32zM32 405.3L133.3 32L32 182.7V405.3zM480 182.7L378.7 32L480 405.3V182.7zM370.7 437.3L256 329.3L141.3 437.3H370.7zM480 405.3L256 182.7L32 405.3L256 480L480 405.3z" fill="white"/>
    </svg>`;
    
    const mineSVG = `<svg class="mine-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <circle cx="256" cy="256" r="180" fill="white"/>
        <path d="M200 156 L312 356 M312 156 L200 356 M156 200 L356 312 M356 200 L156 312" stroke="red" stroke-width="24"/>
    </svg>`;

    // Initialize the game
    function init() {
        updateBetDisplay();
        updateProfitInfo();
        updateMinesDisplay();
        updateBalance();
        setupEventListeners();
        
        // Set initial button states
        betButton.disabled = false;
        cashoutButton.disabled = true;
        
        // Check if balance is 0 and disable bet button if so
        checkBalance();
    }
    
    // Check if balance is 0 and update UI accordingly
    function checkBalance() {
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        if (currentBalance <= 0) {
            betButton.disabled = true;
            
            // If bet amount is higher than current balance, update it
            if (state.betAmount > currentBalance) {
                state.betAmount = Math.max(1, currentBalance);
                betAmountInput.value = state.betAmount;
                updateBetDisplay();
            }
        } else {
            // Only enable if game is not active
            if (!state.gameActive) {
                betButton.disabled = false;
            }
        }
    }
    
    // Calculate the maximum payout multiplier based on mines count
    function calculateMaxMultiplier(mines) {
        // Formula: (25 / (25 - mines)) * 0.99 (1% house edge)
        // This gives a fair RTP of 99%
        const fairMultiplier = 25 / (25 - mines);
        return fairMultiplier * 0.99;
    }
    
    // Calculate the current multiplier based on gems revealed
    function calculateCurrentMultiplier(mines, gemsRevealed) {
        if (gemsRevealed === 0) return 1.0;
        
        // Formula: (25 / (25 - mines)) * (25 - mines - gemsRevealed) / (25 - gemsRevealed) * 0.99
        const fairMultiplier = 25 / (25 - mines);
        const progressMultiplier = (25 - mines - gemsRevealed) / (25 - gemsRevealed);
        return fairMultiplier / progressMultiplier * 0.99;
    }
    
    // Start a new game
    function startGame() {
        // Validate mines count (1-24)
        state.minesCount = parseInt(minesCountInput.value);
        if (isNaN(state.minesCount) || state.minesCount < 1) state.minesCount = 1;
        if (state.minesCount > 24) state.minesCount = 24;
        minesCountInput.value = state.minesCount;
        
        // Update gems count
        state.gemsCount = state.maxTiles - state.minesCount;
        gemsCountInput.value = state.gemsCount;
        
        // Get and validate bet amount
        state.betAmount = parseInt(betAmountInput.value);
        let currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        if (isNaN(state.betAmount) || state.betAmount <= 0) {
            state.betAmount = Math.min(100, currentBalance);
        }
        if (state.betAmount > currentBalance) {
            state.betAmount = currentBalance;
        }
        betAmountInput.value = state.betAmount;
        
        // Make sure we have balance for the bet
        if (state.betAmount <= 0 || currentBalance <= 0) {
            alert('Not enough balance to place a bet. Please reset your balance.');
            return;
        }
        
        // Reset game state
        state.revealedGems = 0;
        state.totalProfit = 0;
        state.gameActive = true;
        state.tilesRevealed = [];
        state.minePositions = [];
        
        // Generate mine positions
        generateMinePositions();
        
        // Deduct bet amount from balance
        currentBalance -= state.betAmount;
        localStorage.setItem('userBalance', currentBalance);
        updateBalance();
        
        // Update multiplier
        state.multiplier = calculateMaxMultiplier(state.minesCount);
        
        // Reset UI
        resetUI();
        
        // Update displays
        updateBetDisplay();
        updateProfitInfo();
        
        // Toggle button states
        betButton.disabled = true;
        cashoutButton.disabled = false;
        
        // Disable settings
        minesCountInput.disabled = true;
        betAmountInput.disabled = true;
        halfBetButton.disabled = true;
        doubleBetButton.disabled = true;
        
        // Add game-active class to the grid
        minesGrid.classList.add('game-active');
        minesGrid.classList.remove('game-over');
        
        console.log("Game started with " + state.minesCount + " mines at positions:", state.minePositions);
    }
    
    // Generate random mine positions
    function generateMinePositions() {
        const positions = [];
        while (positions.length < state.minesCount) {
            const pos = Math.floor(Math.random() * state.maxTiles);
            if (!positions.includes(pos)) {
                positions.push(pos);
            }
        }
        state.minePositions = positions;
    }
    
    // Reset the UI
    function resetUI() {
        // Reset all tiles
        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tile => {
            tile.classList.remove('revealed-gem', 'revealed-mine', 'disabled');
            tile.innerHTML = '';
        });
    }
    
    // Handle tile click
    function handleTileClick(tileIndex) {
        if (!state.gameActive) return;
        if (state.tilesRevealed.includes(tileIndex)) return;
        
        // Add to revealed tiles
        state.tilesRevealed.push(tileIndex);
        
        // Check if tile has a mine
        if (state.minePositions.includes(tileIndex)) {
            // Game over - hit a mine
            revealTile(tileIndex, 'mine');
            endGame(false);
            
            // Play loss sound
            playSound(lossSound);
        } else {
            // Found a gem
            revealTile(tileIndex, 'gem');
            state.revealedGems++;
            
            // Play gem sound
            playSound(gemSound);
            
            // Update multiplier
            state.multiplier = calculateCurrentMultiplier(state.minesCount, state.revealedGems);
            
            // Update profit
            state.totalProfit = Math.floor(state.betAmount * state.multiplier) - state.betAmount;
            
            // Update display
            updateProfitInfo();
            
            // Check if all gems are found
            if (state.revealedGems === state.gemsCount) {
                // Auto-cashout on finding all gems
                handleCashout();
            }
        }
    }
    
    // Reveal a tile
    function revealTile(tileIndex, type) {
        const tile = document.querySelector(`.tile[data-index="${tileIndex}"]`);
        
        if (type === 'gem') {
            tile.classList.add('revealed-gem');
            tile.innerHTML = gemSVG;
        } else if (type === 'mine') {
            tile.classList.add('revealed-mine');
            tile.innerHTML = mineSVG;
        }
    }
    
    // End the game
    function endGame(success) {
        state.gameActive = false;
        
        // Reset button states
        cashoutButton.disabled = true;
        
        // Check balance after game ends
        checkBalance();
        
        // Enable settings
        minesCountInput.disabled = false;
        betAmountInput.disabled = false;
        halfBetButton.disabled = false;
        doubleBetButton.disabled = false;
        
        // Reveal all mines if game was lost
        if (!success) {
            state.minePositions.forEach(pos => {
                if (!state.tilesRevealed.includes(pos)) {
                    revealTile(pos, 'mine');
                }
            });
            
            // Update UI
            minesGrid.classList.remove('game-active');
            minesGrid.classList.add('game-over');
        }
    }
    
    // Handle cashout
    function handleCashout() {
        if (!state.gameActive || state.revealedGems === 0) return;
        
        // Calculate payout
        const payout = Math.floor(state.betAmount * state.multiplier);
        
        // Update balance
        let currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        currentBalance += payout;
        localStorage.setItem('userBalance', currentBalance);
        updateBalance();
        
        // Play cashout sound
        playSound(cashoutSound);
        
        // End game
        endGame(true);
    }
    
    // Update bet display
    function updateBetDisplay() {
        betDisplayEl.textContent = state.betAmount.toFixed(2);
    }
    
    // Update profit info
    function updateProfitInfo() {
        profitAmountInput.value = state.totalProfit;
        profitDisplayEl.textContent = state.totalProfit.toFixed(2);
        
        // Update multiplier in the label
        const profitLabel = document.querySelector('.profit-controls label');
        profitLabel.textContent = `Total profit (${state.multiplier.toFixed(2)}×)`;
    }
    
    // Update mines display
    function updateMinesDisplay() {
        gemsCountInput.value = state.maxTiles - state.minesCount;
    }
    
    // Play a sound
    function playSound(sound) {
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Audio play failed:", e));
        }
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // Tile click
        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tile => {
            tile.addEventListener('click', () => {
                const tileIndex = parseInt(tile.getAttribute('data-index'));
                handleTileClick(tileIndex);
            });
        });
        
        // Mines count input
        minesCountInput.addEventListener('change', () => {
            let value = parseInt(minesCountInput.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 24) value = 24;
            state.minesCount = value;
            minesCountInput.value = value;
            
            // Update gems count
            state.gemsCount = state.maxTiles - state.minesCount;
            gemsCountInput.value = state.gemsCount;
            
            // Update multiplier
            state.multiplier = calculateMaxMultiplier(state.minesCount);
            updateProfitInfo();
        });
        
        // Bet amount input
        betAmountInput.addEventListener('change', () => {
            let value = parseInt(betAmountInput.value);
            if (isNaN(value) || value < 1) value = 1;
            
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
            if (value > currentBalance) {
                value = currentBalance;
            }
            
            state.betAmount = value;
            betAmountInput.value = value;
            updateBetDisplay();
            
            // Update profit calculation
            state.totalProfit = Math.floor(state.betAmount * state.multiplier) - state.betAmount;
            updateProfitInfo();
        });
        
        // Half bet button
        halfBetButton.addEventListener('click', () => {
            let value = Math.floor(state.betAmount / 2);
            if (value < 1) value = 1;
            
            state.betAmount = value;
            betAmountInput.value = value;
            updateBetDisplay();
            
            // Update profit calculation
            state.totalProfit = Math.floor(state.betAmount * state.multiplier) - state.betAmount;
            updateProfitInfo();
        });
        
        // Double bet button
        doubleBetButton.addEventListener('click', () => {
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
            let value = state.betAmount * 2;
            if (value > currentBalance) {
                value = currentBalance;
            }
            
            state.betAmount = value;
            betAmountInput.value = value;
            updateBetDisplay();
            
            // Update profit calculation
            state.totalProfit = Math.floor(state.betAmount * state.multiplier) - state.betAmount;
            updateProfitInfo();
        });
        
        // Reset balance button event listener
        const resetButton = document.getElementById('reset-balance');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                // Balance is reset in balance.js, we just need to update our UI
                checkBalance();
            });
        }
        
        // Bet button
        betButton.addEventListener('click', startGame);
        
        // Cashout button
        cashoutButton.addEventListener('click', handleCashout);
        
        // Game mode buttons (visual only for now)
        manualButton.addEventListener('click', () => {
            manualButton.classList.add('active');
            autoButton.classList.remove('active');
        });
        
        autoButton.addEventListener('click', () => {
            autoButton.classList.add('active');
            manualButton.classList.remove('active');
        });
    }
    
    // Initialize the game
    init();
}); 