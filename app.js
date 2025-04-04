document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Betting controls
    const betAmountInput = document.getElementById('bet-amount');
    const profitAmountInput = document.getElementById('profit-amount');
    const rollValueInput = document.getElementById('roll-value');
    const multiplierValueInput = document.getElementById('multiplier-value');
    const winChanceInput = document.getElementById('win-chance');
    const rollDiceButton = document.getElementById('roll-dice');
    const halfBetButton = document.getElementById('half-bet');
    const doubleBetButton = document.getElementById('double-bet');
    const maxBetButton = document.getElementById('max-bet');
    const swapButton = document.querySelector('.swap-btn');
    
    // DOM Elements - Balance
    const headerBalanceElement = document.getElementById('header-balance');
    
    // DOM Elements - Results
    const resultBubbleElement = document.getElementById('result-bubble');
    const bubbleResultElement = document.getElementById('bubble-result');
    
    // DOM Elements - Slider
    const sliderHandle = document.getElementById('slider-handle');
    const sliderTrackLoss = document.querySelector('.slider-track-loss');
    const sliderTrackWin = document.querySelector('.slider-track-win');
    
    // DOM Elements - History
    const historyListElement = document.getElementById('history-list');
    const winCountElement = document.getElementById('win-count');
    const lossCountElement = document.getElementById('loss-count');
    const totalProfitElement = document.getElementById('total-profit');
    
    // Audio
    const tickSound = document.getElementById('tick-sound');
    const winSound = document.getElementById('win-sound');
    const lossSound = document.getElementById('loss-sound');

    // App State
    let state = {
        betAmount: 100,
        profitOnWin: 98,
        winChance: 50,
        isRollOver: true,
        rollValue: 50,
        multiplier: 1.98,
        lastSliderValue: 50,
        audioCtx: null,
        minWinChance: 2,
        maxWinChance: 98,
        resultBubbleTimer: null,
        history: [],
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        isAnimating: false,
        lastClickTime: 0,
        clickDebounceTime: 200,
        pendingBets: 0,
    };

    // Initialize the app
    initializeApp();

    function initializeApp() {
        // Ensure rollValue is consistent with winChance on startup
        state.rollValue = (100 - state.winChance).toFixed(2);
        
        // Make input fields for roll value, multiplier, and win chance read-only
        rollValueInput.readOnly = true;
        multiplierValueInput.readOnly = true; 
        winChanceInput.readOnly = true;
        
        // Add titles to explain that these can only be changed via slider
        rollValueInput.title = "Adjust using the slider below";
        multiplierValueInput.title = "Adjust using the slider below";
        winChanceInput.title = "Adjust using the slider below";
        
        updateUI();
        setupEventListeners();
        createFallbackTickSound();
        updateSlider(parseFloat(state.rollValue));
        updateHistoryStats();
    }

    function createFallbackTickSound() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            state.audioCtx = audioCtx;
        } catch (e) {
            console.log('Web Audio API not supported in this browser');
        }
    }

    function playTickSound() {
        if (tickSound && tickSound.readyState >= 2) {
            tickSound.currentTime = 0;
            tickSound.play().catch(err => {
                playFallbackTickSound();
            });
        } else {
            playFallbackTickSound();
        }
    }

    function playFallbackTickSound() {
        if (!state.audioCtx) return;
        
        try {
            const oscillator = state.audioCtx.createOscillator();
            const gainNode = state.audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, state.audioCtx.currentTime);
            
            gainNode.gain.setValueAtTime(0.1, state.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.1);
            
            oscillator.connect(gainNode);
            gainNode.connect(state.audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(state.audioCtx.currentTime + 0.1);
        } catch (e) {
            console.log('Error generating tick sound', e);
        }
    }

    function playWinSound() {
        if (winSound) {
            winSound.currentTime = 0;
            winSound.play().catch(err => {
                console.log('Error playing win sound:', err);
                playFallbackWinSound();
            });
        } else {
            playFallbackWinSound();
        }
    }

    function playLossSound() {
        if (lossSound) {
            lossSound.currentTime = 0;
            lossSound.play().catch(err => {
                console.log('Error playing loss sound:', err);
                playFallbackLossSound();
            });
        } else {
            playFallbackLossSound();
        }
    }

    function playFallbackWinSound() {
        if (!state.audioCtx) return;
        
        try {
            const oscillator = state.audioCtx.createOscillator();
            const gainNode = state.audioCtx.createGain();
            
            // Higher pitched happy sound for win
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, state.audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, state.audioCtx.currentTime + 0.2);
            
            gainNode.gain.setValueAtTime(0.1, state.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.3);
            
            oscillator.connect(gainNode);
            gainNode.connect(state.audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(state.audioCtx.currentTime + 0.3);
        } catch (e) {
            console.log('Error generating fallback win sound', e);
        }
    }

    function playFallbackLossSound() {
        if (!state.audioCtx) return;
        
        try {
            const oscillator = state.audioCtx.createOscillator();
            const gainNode = state.audioCtx.createGain();
            
            // Lower pitched sad sound for loss
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(300, state.audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, state.audioCtx.currentTime + 0.3);
            
            gainNode.gain.setValueAtTime(0.1, state.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.4);
            
            oscillator.connect(gainNode);
            gainNode.connect(state.audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(state.audioCtx.currentTime + 0.4);
        } catch (e) {
            console.log('Error generating fallback loss sound', e);
        }
    }

    function updateUI() {
        // Get current balance
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        
        // Ensure bet amount doesn't exceed balance
        if (state.betAmount > currentBalance) {
            state.betAmount = Math.floor(currentBalance);
            // Recalculate profit
            state.multiplier = (99 / state.winChance);
            state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
        }
        
        // Update all balance displays
        headerBalanceElement.textContent = currentBalance;
        document.querySelector('.amount-label').textContent = currentBalance;
        
        // Update betting inputs with validated values
        betAmountInput.value = state.betAmount;
        profitAmountInput.value = state.profitOnWin;
        rollValueInput.value = state.rollValue;
        multiplierValueInput.value = state.multiplier.toFixed(4);
        winChanceInput.value = state.winChance;
    }

    function animateBalanceChange(element, newValue) {
        const currentValue = parseInt(element.textContent);
        if (currentValue === newValue) return;
        
        // Animate the number counting up or down
        const duration = 500; // ms
        const startTime = performance.now();
        const change = newValue - currentValue;
        
        function updateNumber(timestamp) {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Use easeOutExpo for a nice animation effect
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const currentNum = Math.floor(currentValue + change * easeProgress);
            element.textContent = currentNum.toFixed(0);
            
            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        }
        
        requestAnimationFrame(updateNumber);
    }

    function updateSlider(value) {
        // Calculate percentage for slider handle position (0-100)
        const percentage = value; // Always roll over mode
        const sliderPosition = Math.min(Math.max(percentage, 0), 100);
        
        // Set handle position
        sliderHandle.style.left = `${sliderPosition}%`;
        
        // Update track colors - use percentages instead of flex
        // Roll Over colors are always used now
        sliderTrackLoss.style.width = `${sliderPosition}%`;
        sliderTrackWin.style.width = `${100 - sliderPosition}%`;
        sliderTrackLoss.style.left = '0';
        sliderTrackWin.style.right = '0';
        // Set colors
        sliderTrackLoss.style.backgroundColor = 'var(--slider-loss-color)';
        sliderTrackWin.style.backgroundColor = 'var(--slider-win-color)';
    }

    function recalculateFromWinChance() {
        // Round and ensure win chance is within bounds
        state.winChance = roundToWholePercent(state.winChance);
        state.winChance = Math.min(Math.max(state.winChance, state.minWinChance), state.maxWinChance);
        
        // Set roll value based on win chance (always Roll Over)
        state.rollValue = (100 - state.winChance).toFixed(2);
        
        // Calculate multiplier: 99 / win chance (house edge included)
        state.multiplier = (99 / state.winChance);
        
        // Calculate potential profit
        state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
        
        // Update UI and slider
        updateUI();
        updateSlider(state.rollValue);
    }

    function recalculateFromRollValue() {
        // Set win chance based on roll value (always Roll Over)
        let newWinChance = (100 - parseFloat(state.rollValue));
        
        // Round to whole percentage
        newWinChance = roundToWholePercent(newWinChance);
        
        // Ensure win chance is within bounds
        newWinChance = Math.min(Math.max(newWinChance, state.minWinChance), state.maxWinChance);
        state.winChance = newWinChance;
        
        // Recalculate roll value to ensure consistency
        state.rollValue = (100 - state.winChance).toFixed(2);
        
        // Calculate multiplier: 99 / win chance (house edge included)
        state.multiplier = (99 / state.winChance);
        
        // Calculate potential profit
        state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
        
        // Update UI and slider
        updateUI();
        updateSlider(parseFloat(state.rollValue));
    }

    function setupEventListeners() {
        // Bet amount changes
        betAmountInput.addEventListener('input', updateBetAmount);
        betAmountInput.addEventListener('change', updateBetAmount);

        function updateBetAmount() {
            let value = parseFloat(betAmountInput.value);
            if (isNaN(value) || value < 1) value = 1;
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
            if (value > currentBalance) value = currentBalance;
            state.betAmount = Math.floor(value); // Ensure whole number
            
            // Calculate profit directly
            state.multiplier = (99 / state.winChance);
            state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
            
            updateUI();
        }

        // Remove event listeners for roll value, multiplier, and win chance inputs
        // Win chance input - event listeners removed
        // Roll value input - event listeners removed
        // Multiplier value input - event listeners removed

        // Quick bet options
        halfBetButton.addEventListener('click', () => {
            state.betAmount = Math.max(1, Math.floor(state.betAmount / 2));
            
            // Calculate profit directly
            state.multiplier = (99 / state.winChance);
            state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
            
            updateUI();
        });

        doubleBetButton.addEventListener('click', () => {
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
            state.betAmount = Math.min(currentBalance, Math.floor(state.betAmount * 2));
            
            // Calculate profit directly
            state.multiplier = (99 / state.winChance);
            state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
            
            updateUI();
        });

        maxBetButton.addEventListener('click', () => {
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
            if (currentBalance > 0) {
                state.betAmount = Math.floor(currentBalance); // Ensure whole number
                
                // Calculate profit directly
                state.multiplier = (99 / state.winChance);
                state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
                
                updateUI();
            }
        });

        // Roll dice button with debounce to prevent spam clicking
        rollDiceButton.addEventListener('click', () => {
            const now = Date.now();
            
            // If the button is disabled or we're still animating or we're within debounce time, exit early
            if (rollDiceButton.disabled || 
                state.isAnimating || 
                state.pendingBets > 0 || 
                now - state.lastClickTime < state.clickDebounceTime) {
                return;
            }
            
            // Update last click time for debounce
            state.lastClickTime = now;
            
            if (state.betAmount > state.balance) {
                alert('Not enough balance');
                return;
            }
            
            // Immediately disable the button and set animation state
            rollDiceButton.disabled = true;
            state.isAnimating = true;
            state.pendingBets++;
            
            // Immediately deduct the bet amount from balance to prevent race conditions
            // This happens before the roll so quick clicks can't exploit balance checks
            state.balance -= state.betAmount;
            
            // Update UI to reflect the deducted amount before rolling
            updateUI();
            
            // Proceed with roll after a small delay to ensure UI updates
            setTimeout(() => rollDice(), 10);
        });
        
        // Slider drag functionality
        let isDragging = false;
        
        // Mouse events
        sliderHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            
            // Define the handler function
            const mouseMoveHandler = (e) => handleDrag(e);
            const mouseUpHandler = () => {
                isDragging = false;
                document.removeEventListener('mousemove', mouseMoveHandler);
            };
            
            // Add the listeners
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler, { once: true });
            
            // Also clean up on mouseout/mouseleave in case the mouse leaves the window
            document.addEventListener('mouseleave', mouseUpHandler, { once: true });
        });
        
        // Touch events
        sliderHandle.addEventListener('touchstart', (e) => {
            isDragging = true;
            
            // Define the handler function
            const touchMoveHandler = (e) => handleTouchDrag(e);
            const touchEndHandler = () => {
                isDragging = false;
                document.removeEventListener('touchmove', touchMoveHandler);
            };
            
            // Add the listeners
            document.addEventListener('touchmove', touchMoveHandler);
            document.addEventListener('touchend', touchEndHandler, { once: true });
            document.addEventListener('touchcancel', touchEndHandler, { once: true });
        });
        
        function handleDrag(e) {
            if (!isDragging) return;
            
            const sliderTrack = document.querySelector('.slider-track');
            const rect = sliderTrack.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            const value = Math.min(Math.max(position * 100, 0), 100);
            
            updateSliderVisually(value);
        }
        
        function handleTouchDrag(e) {
            if (!isDragging) return;
            
            // Prevent scrolling while dragging
            e.preventDefault();
            
            const sliderTrack = document.querySelector('.slider-track');
            const rect = sliderTrack.getBoundingClientRect();
            const position = (e.touches[0].clientX - rect.left) / rect.width;
            const value = Math.min(Math.max(position * 100, 0), 100);
            
            updateSliderVisually(value);
        }
        
        // Function to round win chance to nearest 1%
        function roundToWholePercent(value) {
            return Math.round(value);
        }

        function updateSliderVisually(value) {
            try {
                // Calculate roll value based on position (always Roll Over)
                state.rollValue = value.toFixed(2);
                
                // Calculate win chance from roll value
                let newWinChance = (100 - parseFloat(state.rollValue));
                
                // Round to whole percentage and ensure within bounds
                newWinChance = roundToWholePercent(newWinChance);
                newWinChance = Math.min(Math.max(newWinChance, state.minWinChance), state.maxWinChance);
                state.winChance = newWinChance;
                
                // Recalculate roll value to match rounded win chance
                state.rollValue = (100 - state.winChance).toFixed(2);
                
                // Play tick sound on significant movement
                if (Math.abs(value - state.lastSliderValue) >= 1) {
                    playTickSound();
                    state.lastSliderValue = value;
                }
                
                // Update slider handle visually immediately
                // Use the recalculated value to keep it aligned with whole percentages
                const sliderPos = parseFloat(state.rollValue);
                sliderHandle.style.left = `${sliderPos}%`;
                
                // Update track colors (always Roll Over)
                sliderTrackLoss.style.width = `${sliderPos}%`;
                sliderTrackWin.style.width = `${100 - sliderPos}%`;
                sliderTrackLoss.style.left = '0';
                sliderTrackWin.style.right = '0';
                // Set colors
                sliderTrackLoss.style.backgroundColor = 'var(--slider-loss-color)';
                sliderTrackWin.style.backgroundColor = 'var(--slider-win-color)';
                
                // Calculate multiplier based on new win chance
                state.multiplier = (99 / state.winChance);
                
                // Calculate profit
                state.profitOnWin = Math.floor(state.betAmount * (state.multiplier - 1));
                
                // Update all UI elements immediately
                betAmountInput.value = state.betAmount;
                profitAmountInput.value = state.profitOnWin;
                rollValueInput.value = state.rollValue;
                multiplierValueInput.value = state.multiplier.toFixed(4);
                winChanceInput.value = state.winChance;
            } catch (error) {
                console.error("Error in updateSliderVisually:", error);
            }
        }
        
        // Also handle clicks/taps on the slider track
        document.querySelector('.slider-track').addEventListener('click', handleDrag);
        document.querySelector('.slider-track').addEventListener('touchend', handleTouchDrag);
    }

    function rollDice() {
        try {
            // Check if required elements exist
            if (!rollDiceButton || !resultBubbleElement) {
                console.error("Required DOM elements not found");
                state.pendingBets--;
                state.isAnimating = state.pendingBets > 0;
                if (rollDiceButton) rollDiceButton.disabled = false;
                return;
            }

            // Get current balance
            const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;

            // Check if enough balance for bet
            if (state.betAmount > currentBalance) {
                alert('Not enough balance for this bet!');
                state.pendingBets--;
                state.isAnimating = false;
                rollDiceButton.disabled = false;
                return;
            }
            
            // First, clear any existing timers and hide any existing bubbles
            if (state.resultBubbleTimer) {
                clearTimeout(state.resultBubbleTimer);
                state.resultBubbleTimer = null;
            }
            
            rollDiceButton.textContent = 'ROLLING...';
            
            // Deduct bet amount immediately
            const balanceAfterBet = currentBalance - state.betAmount;
            window.updateBalance(balanceAfterBet);
            
            // Generate a random number between 0 and 100
            const roll = Math.random() * 100;
            const rollResult = parseFloat(roll.toFixed(2));
            
            // Determine if the bet is a win or loss (always Roll Over)
            const isWin = rollResult > parseFloat(state.rollValue);
            
            // Calculate new balance based on win/loss
            let newBalance = balanceAfterBet;
            if (isWin) {
                // If win, add original bet back plus profit
                newBalance += state.betAmount + state.profitOnWin;
                window.updateBalance(newBalance);
                playWinSound();
            } else {
                // Bet amount already deducted
                playLossSound();
            }
            
            // Position the bubble above the result value on the slider
            const bubblePosition = rollResult;
            positionResultBubble(bubblePosition, rollResult, isWin);
            
            // Show result bubble
            resultBubbleElement.classList.remove('hidden');
            
            // Add to history
            const profitForHistory = isWin ? state.profitOnWin : -state.betAmount;
            addToHistory(state.betAmount, rollResult, isWin, profitForHistory);
            
            // Set a timer to hide the bubble after 5 seconds
            state.resultBubbleTimer = setTimeout(() => {
                resultBubbleElement.classList.add('hidden');
                state.resultBubbleTimer = null;
            }, 5000);
            
            // Update UI
            updateUI();
        } catch (error) {
            console.error("Error in rollDice:", error);
        } finally {
            state.pendingBets--;
            state.isAnimating = state.pendingBets > 0;
            if (!state.isAnimating && rollDiceButton) {
                rollDiceButton.disabled = false;
                rollDiceButton.textContent = 'ROLL DICE';
            }
        }
    }

    function positionResultBubble(position, result, isWin) {
        try {
            // Calculate the position along the slider
            const sliderTrack = document.querySelector('.slider-track');
            if (!sliderTrack) {
                console.error("Slider track element not found");
                return;
            }
            
            const sliderWidth = sliderTrack.offsetWidth;
            
            // Ensure position stays within slider boundaries with some padding
            const leftPos = Math.min(Math.max(position, 5), 95);
            
            // Set position and result
            resultBubbleElement.style.left = `${leftPos}%`;
            bubbleResultElement.textContent = result.toFixed(2);
            
            // Set win/loss class based on actual win/loss, not the position
            resultBubbleElement.classList.remove('win', 'loss');
            if (isWin) {
                resultBubbleElement.classList.add('win');
            } else {
                resultBubbleElement.classList.add('loss');
            }
        } catch (error) {
            console.error("Error in positionResultBubble:", error);
        }
    }

    // History management
    function addToHistory(bet, result, isWin, profit) {
        // Create history item
        const historyItem = {
            id: Date.now(),
            bet: bet,
            result: result,
            isWin: isWin,
            profit: profit,
            timestamp: new Date()
        };
        
        // Add to history array (limit to 100 items)
        state.history.unshift(historyItem);
        if (state.history.length > 100) {
            state.history.pop();
        }
        
        // Update stats
        if (isWin) {
            state.winCount++;
        } else {
            state.lossCount++;
        }
        state.totalProfit += profit;
        
        // Update UI
        updateHistoryDisplay();
        updateHistoryStats();
    }

    function updateHistoryDisplay() {
        // Clear the "no history" message if needed
        if (state.history.length > 0) {
            const noHistoryElement = document.querySelector('.no-history');
            if (noHistoryElement) {
                noHistoryElement.remove();
            }
        }
        
        // Only update if we have items
        if (state.history.length === 0) return;
        
        // Create history item element for the most recent bet
        const item = state.history[0];
        const historyItemElement = document.createElement('div');
        historyItemElement.className = `history-item ${item.isWin ? 'win' : 'loss'}`;
        historyItemElement.id = `history-${item.id}`;
        
        // Calculate time
        const time = item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        historyItemElement.innerHTML = `
            <div class="bet-details">
                <span class="bet-amount">Bet: ${item.bet}</span>
                <span class="bet-result">Result: ${item.result.toFixed(2)} (${item.isWin ? 'Win' : 'Loss'})</span>
            </div>
            <div class="bet-outcome">
                <span class="bet-profit ${item.profit >= 0 ? 'positive' : 'negative'}">
                    ${item.profit >= 0 ? '+' : ''}${item.profit}
                </span>
                <span class="bet-time">${time}</span>
            </div>
        `;
        
        // Add to DOM with animation
        historyItemElement.style.opacity = '0';
        historyItemElement.style.transform = 'translateY(-10px)';
        historyListElement.insertBefore(historyItemElement, historyListElement.firstChild);
        
        // Trigger animation
        setTimeout(() => {
            historyItemElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            historyItemElement.style.opacity = '1';
            historyItemElement.style.transform = 'translateY(0)';
        }, 10);
    }

    function updateHistoryStats() {
        // Update stats display
        winCountElement.textContent = state.winCount;
        lossCountElement.textContent = state.lossCount;
        
        // Update total profit with color
        totalProfitElement.textContent = state.totalProfit >= 0 ? 
            `+${state.totalProfit}` : 
            `${state.totalProfit}`;
        totalProfitElement.className = `stat-value ${state.totalProfit >= 0 ? 'positive' : 'negative'}`;
    }
}); 