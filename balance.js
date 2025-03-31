// Initialize balance management
document.addEventListener('DOMContentLoaded', () => {
    // Get the elements
    const balanceElement = document.getElementById('header-balance');
    const resetButton = document.getElementById('reset-balance');
    const bettingContainer = document.querySelector('.betting-container');
    
    // Initialize balance if it doesn't exist
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
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 10000;
        balanceElement.textContent = currentBalance;
        
        // Check for zero balance on initial load
        if (bettingContainer && currentBalance <= 0) {
            bettingContainer.classList.add('zero-balance');
        }
    }
}); 