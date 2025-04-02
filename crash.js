document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const betButton = document.getElementById('bet-button');
    const cashoutButton = document.getElementById('cashout-button');
    const manualButton = document.getElementById('manual-button');
    const autoButton = document.getElementById('auto-button');
    const betAmountInput = document.getElementById('bet-amount');
    const halfBetButton = document.getElementById('half-bet');
    const doubleBetButton = document.getElementById('double-bet');
    const crashChartContainer = document.getElementById('crash-chart-container');
    const crashChart = document.getElementById('crash-chart');
    const crashResult = document.getElementById('crash-result');
    const historyItems = document.getElementById('history-items');
    const autoCashoutContainer = document.getElementById('auto-cashout-container');
    const autoCashoutInput = document.getElementById('auto-cashout-value');
    const netGainDisplay = document.getElementById('net-gain-display');
    
    // Audio elements
    const tickSound = document.getElementById('tick-sound');
    const winSound = document.getElementById('win-sound');
    const crashSound = document.getElementById('crash-sound');
    
    // Game state variables
    let gameMode = 'manual';
    let gameActive = false;
    let currentMultiplier = 1.0;
    let crashPoint = 1.0;
    let betAmount = parseFloat(betAmountInput.value) || 100;
    let lastTimestamp = 0;
    let autoCashoutValue = parseFloat(autoCashoutInput.value);
    let gameHistory = [];
    let animationFrameId = null;
    let ctx = null;
    let tickCounter = 0;
    let gameStartTime = 0;
    let gameElapsedTime = 0;
    
    // Initialize chart
    function initChart() {
        ctx = crashChart.getContext('2d');
        
        // Set canvas size to match container
        resizeChart();
        
        // Initial chart settings
        resetChart();
    }
    
    // Resize chart on window resize
    function resizeChart() {
        crashChart.width = crashChartContainer.clientWidth;
        crashChart.height = crashChartContainer.clientHeight;
    }
    
    // Reset chart to initial state
    function resetChart() {
        if (!ctx) return;
        
        // Clear chart
        ctx.clearRect(0, 0, crashChart.width, crashChart.height);
        
        // Background - dark color to match Stake.com
        ctx.fillStyle = '#08141e';
        ctx.fillRect(0, 0, crashChart.width, crashChart.height);
        
        // Draw grid lines
        drawGrid();
    }
    
    // Draw grid lines
    function drawGrid() {
        if (!ctx) return;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        
        const xAxisOffset = crashChart.height - 30;
        const startX = 50;
        const maxX = crashChart.width - 50;
        
        // Get current scale based on multiplier
        // For higher multipliers, we need to change the Y-axis scale
        const maxVisibleMultiplier = Math.max(2.0, Math.min(currentMultiplier * 1.2, 100));
        const multiplierRange = maxVisibleMultiplier - 1.0;
        const chartHeight = crashChart.height - 60;
        
        // Draw vertical grid lines (dynamic time scaling)
        // Divide the screen into equal parts regardless of current time
        const timeGridCount = 5; // Number of vertical grid lines
        
        for (let i = 1; i <= timeGridCount; i++) {
            const ratio = i / timeGridCount;
            const x = startX + ratio * (maxX - startX);
            
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, xAxisOffset);
            ctx.stroke();
        }
        
        // Draw horizontal grid lines (dynamic multiplier scaling)
        // Base the grid on the current maximum visible multiplier
        const multiplierGridCount = 5;
        const yStart = 50;
        
        for (let i = 0; i <= multiplierGridCount; i++) {
            const multiplierValue = 1.0 + (i / multiplierGridCount) * multiplierRange;
            const multiplierOffset = multiplierValue - 1.0;
            const ratio = multiplierOffset / multiplierRange;
            const y = xAxisOffset - ratio * chartHeight;
            
            ctx.beginPath();
            ctx.moveTo(yStart, y);
            ctx.lineTo(maxX, y);
            ctx.stroke();
        }
    }
    
    // Draw crash chart animation
    function drawCrashChart(timestamp) {
        if (!gameActive) return;
        
        // Calculate time difference from last frame
        const deltaTime = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
        lastTimestamp = timestamp;
        
        // Update game elapsed time
        if (gameStartTime === 0) {
            gameStartTime = timestamp / 1000;
        }
        gameElapsedTime = (timestamp / 1000) - gameStartTime;
        
        // Update multiplier (increases exponentially)
        if (deltaTime > 0) {
            // Growth rate adjusts the speed of the multiplier increase
            const growthRate = 0.1;
            currentMultiplier += currentMultiplier * growthRate * deltaTime;
            
            // Update net gain display during game
            updateNetGainDisplay();
            
            // Check if crashed
            if (currentMultiplier >= crashPoint) {
                gameCrash();
                return;
            }
            
            // Check for auto cashout
            if (gameMode === 'auto' && currentMultiplier >= autoCashoutValue) {
                cashout();
                return;
            }
        }
        
        // Clear chart
        ctx.clearRect(0, 0, crashChart.width, crashChart.height);
        
        // Background
        ctx.fillStyle = '#08141e';
        ctx.fillRect(0, 0, crashChart.width, crashChart.height);
        
        // Get dynamic scale based on current values
        const maxVisibleMultiplier = Math.max(2.0, Math.min(currentMultiplier * 1.2, 100));
        const multiplierRange = maxVisibleMultiplier - 1.0;
        
        // Draw dynamic grid
        drawGrid();
        
        // Chart drawing parameters
        const startX = 50;
        const startY = crashChart.height - 30;
        const maxX = crashChart.width - 50;
        const chartHeight = crashChart.height - 60;
        
        // Calculate time scale based on elapsed time
        // Adjust the scaling factor as the game progresses
        const timeScale = Math.max(10, gameElapsedTime * 1.5);
        const normalizedX = Math.min(0.95, gameElapsedTime / timeScale);
        
        // Calculate dot position based on elapsed time
        const currentX = startX + normalizedX * (maxX - startX);
        
        // Calculate Y position using the actual current multiplier with dynamic scaling
        const multiplierOffset = currentMultiplier - 1.0;
        const ratio = Math.min(multiplierOffset / multiplierRange, 0.95);
        const currentY = startY - ratio * chartHeight;
        
        // Draw curve from start to current position
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        
        // Create curve that exactly meets the dot using actual time values
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            
            // Only draw up to the current normalized X position
            if (t <= normalizedX) {
                const x = startX + t * (maxX - startX);
                
                // Calculate the multiplier at this point
                let pointY;
                
                if (t === normalizedX) {
                    // At the exact endpoint, use the precise currentY value
                    pointY = currentY;
                } else {
                    // For all other points, calculate based on elapsed time ratio
                    const timeRatio = t / normalizedX;
                    const multiplierAtT = 1 + (currentMultiplier - 1) * Math.pow(timeRatio, 2.0);
                    
                    // Scale this multiplier to the dynamic y-axis
                    const multiplierOffsetAtT = multiplierAtT - 1.0;
                    const ratioAtT = Math.min(multiplierOffsetAtT / multiplierRange, 0.95);
                    pointY = startY - ratioAtT * chartHeight;
                }
                
                ctx.lineTo(x, pointY);
            }
        }
        
        // Make line a bit thicker and pink
        ctx.strokeStyle = '#ff0084';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw dynamic axis labels
        // X-axis time markers (just one changing value)
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(gameElapsedTime.toFixed(1) + 's', currentX, startY + 20);
        
        // Y-axis multiplier markers (one changing value at the current position)
        const timeGridCount = 5; // Match the number of vertical grid lines
        const multiplierGridCount = 5; // Match the number of horizontal grid lines
        
        // Draw only dynamic values near the current curve position
        ctx.textAlign = 'right';
        ctx.fillText(currentMultiplier.toFixed(2) + '×', startX - 5, currentY + 5);
        
        // Draw multiplier text next to the point
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#ff0084';
        ctx.textAlign = 'left';
        const multiplierText = currentMultiplier.toFixed(2) + '×';
        
        // Position the text near the dot but ensure it stays on screen
        const textX = Math.min(currentX + 15, crashChart.width - 100);
        // Ensure text doesn't go off the top of the screen
        const textY = Math.max(currentY - 15, 40);
        ctx.fillText(multiplierText, textX, textY);
        
        // Always draw the dot at the current calculated position
        ctx.beginPath();
        ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0084';
        ctx.fill();
        
        // Add a larger multiplier display at the top-right of the screen for high values
        ctx.font = 'bold 40px Arial';
        ctx.fillStyle = '#ff0084';
        ctx.textAlign = 'right';
        ctx.fillText(currentMultiplier.toFixed(2) + '×', crashChart.width - 20, 50);
        
        // Continue animation
        animationFrameId = requestAnimationFrame(drawCrashChart);
    }
    
    // Start new game
    function startGame() {
        // Validate bet amount
        if (betAmount <= 0) {
            alert('Please enter a valid bet amount');
            return;
        }
        
        // Get balance
        const balance = parseFloat(localStorage.getItem('userBalance')) || 0;
        
        // Check if user has enough balance
        if (betAmount > balance) {
            alert('Not enough balance');
            return;
        }
        
        // Deduct bet amount from balance
        const newBalance = balance - betAmount;
        window.updateBalance(newBalance);
        
        // Change button states
        betButton.disabled = true;
        cashoutButton.disabled = false;
        cashoutButton.classList.add('active');
        betAmountInput.disabled = true;
        
        // Hide crash result
        crashResult.classList.add('hidden');
        
        // Reset multiplier
        currentMultiplier = 1.0;
        
        // Generate crash point (between 1.0 and 10.0, with bias toward lower values)
        crashPoint = generateCrashPoint();
        console.log('Crash point:', crashPoint);
        
        // Update net gain display
        updateNetGainDisplay();
        
        // Reset time tracking
        gameStartTime = 0;
        gameElapsedTime = 0;
        
        // Set game as active
        gameActive = true;
        
        // Start animation
        lastTimestamp = 0;
        tickCounter = 0;
        animationFrameId = requestAnimationFrame(drawCrashChart);
    }
    
    // Generate a crash point with house edge
    function generateCrashPoint() {
        // Random number between 0 and 1
        const rand = Math.random();
        
        // House edge (7% - higher than before for better house advantage)
        const houseEdge = 0.93;
        
        // Formula to create exponential distribution with house edge
        const rawCrashPoint = Math.max(1.0, (1 / (1 - rand * houseEdge)));
        
        // Cap the maximum possible multiplier at 100x to maintain house edge
        return Math.min(rawCrashPoint, 100);
    }
    
    // Update net gain display based on current bet and multiplier
    function updateNetGainDisplay() {
        const gain = betAmount * currentMultiplier - betAmount;
        netGainDisplay.textContent = gain.toFixed(2);
    }
    
    // Cashout (player wins)
    function cashout() {
        if (!gameActive) return;
        
        // Stop game
        gameActive = false;
        cancelAnimationFrame(animationFrameId);
        
        // Reset time tracking
        gameStartTime = 0;
        gameElapsedTime = 0;
        
        // Calculate winnings
        const winnings = betAmount * currentMultiplier;
        
        // Update balance
        const balance = parseFloat(localStorage.getItem('userBalance')) || 0;
        const newBalance = balance + winnings;
        window.updateBalance(newBalance);
        
        // Show crash result with current multiplier
        crashResult.textContent = currentMultiplier.toFixed(2) + '×';
        crashResult.classList.remove('hidden');
        
        // Play win sound
        winSound.currentTime = 0;
        winSound.play().catch(e => console.log('Error playing sound:', e));
        
        // Reset UI
        resetGameUI();
        
        // Add to history - mark as a win
        addHistoryItem(currentMultiplier, true);
    }
    
    // Game crash (player loses if they haven't cashed out)
    function gameCrash() {
        gameActive = false;
        cancelAnimationFrame(animationFrameId);
        
        // Reset time tracking
        gameStartTime = 0;
        gameElapsedTime = 0;
        
        // Set multiplier to crash point
        currentMultiplier = crashPoint;
        
        // Show crash message
        crashResult.textContent = crashPoint.toFixed(2) + '×';
        crashResult.classList.remove('hidden');
        
        // Play crash sound
        crashSound.currentTime = 0;
        crashSound.play().catch(e => console.log('Error playing sound:', e));
        
        // Reset UI
        resetGameUI();
        
        // Add to history - mark as a loss
        addHistoryItem(crashPoint, false);
    }
    
    // Reset game UI after a round
    function resetGameUI() {
        betButton.disabled = false;
        cashoutButton.disabled = true;
        cashoutButton.classList.remove('active');
        betAmountInput.disabled = false;
    }
    
    // Add item to history
    function addHistoryItem(value, isWin) {
        // Add to history array (limit to 10 items)
        gameHistory.unshift({
            value: value,
            isWin: isWin
        });
        if (gameHistory.length > 10) {
            gameHistory.pop();
        }
        
        // Update history display
        updateHistoryDisplay();
    }
    
    // Update history display
    function updateHistoryDisplay() {
        historyItems.innerHTML = '';
        
        gameHistory.forEach(item => {
            const element = document.createElement('div');
            element.classList.add('history-item');
            element.textContent = item.value.toFixed(2) + '×';
            
            // Color based on win/loss status rather than value
            if (item.isWin) {
                element.classList.add('medium'); // Green for wins
            } else {
                element.classList.add('low'); // Red for losses
            }
            
            historyItems.appendChild(element);
        });
    }
    
    // Switch game mode (manual/auto)
    function switchGameMode(mode) {
        gameMode = mode;
        
        if (mode === 'manual') {
            manualButton.classList.add('active');
            autoButton.classList.remove('active');
            autoCashoutContainer.classList.add('hidden');
        } else {
            manualButton.classList.remove('active');
            autoButton.classList.add('active');
            autoCashoutContainer.classList.remove('hidden');
        }
    }
    
    // Update bet amount
    function updateBetAmount() {
        betAmount = parseFloat(betAmountInput.value) || 100;
        updateNetGainDisplay();
    }
    
    // Half bet amount
    function halfBet() {
        const currentBet = parseFloat(betAmountInput.value) || 0;
        const newBet = Math.max(0.01, currentBet / 2);
        betAmountInput.value = newBet.toFixed(2);
        updateBetAmount();
    }
    
    // Double bet amount
    function doubleBet() {
        const currentBet = parseFloat(betAmountInput.value) || 0;
        const newBet = currentBet * 2;
        betAmountInput.value = newBet.toFixed(2);
        updateBetAmount();
    }
    
    // Event listeners
    betButton.addEventListener('click', startGame);
    cashoutButton.addEventListener('click', cashout);
    manualButton.addEventListener('click', () => switchGameMode('manual'));
    autoButton.addEventListener('click', () => switchGameMode('auto'));
    betAmountInput.addEventListener('input', updateBetAmount);
    halfBetButton.addEventListener('click', halfBet);
    doubleBetButton.addEventListener('click', doubleBet);
    autoCashoutInput.addEventListener('input', () => {
        autoCashoutValue = parseFloat(autoCashoutInput.value) || 2.0;
    });
    
    // Window resize event
    window.addEventListener('resize', resizeChart);
    
    // Initialize
    initChart();
    updateBetAmount();
}); 