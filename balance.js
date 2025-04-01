// Initialize balance management
document.addEventListener('DOMContentLoaded', () => {
    // Get the elements
    const balanceElement = document.getElementById('header-balance');
    const resetButton = document.getElementById('reset-balance');
    const bettingContainer = document.querySelector('.betting-container');
    const gameBalanceEl = document.getElementById('game-balance');
    
    // Initialize balance if it doesn't exist (only on first run)
    if (!localStorage.getItem('userBalance')) {
        localStorage.setItem('userBalance', '10000');
    }
    
    // Update display with current balance
    updateBalanceDisplay();
    
    // Add reset button click handler
    resetButton.addEventListener('click', () => {
        localStorage.setItem('userBalance', '10000');
        updateBalanceDisplay();
        
        // Remove zero balance state if it exists
        if (bettingContainer) {
            bettingContainer.classList.remove('zero-balance');
        }
    });
    
    // Function to update balance
    window.updateBalance = function(newBalance) {
        if (typeof newBalance === 'undefined') {
            // If no new balance provided, just update displays using current value
            updateBalanceDisplay();
            return;
        }
        
        localStorage.setItem('userBalance', newBalance.toString());
        updateBalanceDisplay();
        
        // Check for zero balance and update UI state
        if (bettingContainer) {
            if (newBalance <= 0) {
                bettingContainer.classList.add('zero-balance');
            } else {
                bettingContainer.classList.remove('zero-balance');
            }
        }
    };
    
    // Function to update balance display
    function updateBalanceDisplay() {
        // Don't provide fallback value - if balance is 0, show 0
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        balanceElement.textContent = currentBalance;
        
        // Also update game-specific balance display if it exists
        if (gameBalanceEl) {
            gameBalanceEl.textContent = currentBalance.toFixed(2);
        }
        
        // Check for zero balance on initial load
        if (bettingContainer && currentBalance <= 0) {
            bettingContainer.classList.add('zero-balance');
        }
    }
}); 