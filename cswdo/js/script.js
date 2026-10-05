/* =====================================================
   CSWDO MIS - Login Page JavaScript
   Password Visibility Toggle + Live Date/Time
   ===================================================== */

(function() {
  'use strict';

  // =====================================================
  // LIVE DATE/TIME - Philippine Time (Asia/Manila)
  // =====================================================
  function updateDateTime() {
    const now = new Date();
    
    // Set timezone to Asia/Manila
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    
    const dateOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const timeOptions = { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    };
    
    const dateDisplay = document.getElementById('dateDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    
    if (dateDisplay) {
      dateDisplay.textContent = manilaTime.toLocaleDateString('en-US', dateOptions);
    }
    
    if (timeDisplay) {
      timeDisplay.textContent = manilaTime.toLocaleTimeString('en-US', timeOptions);
    }
  }

  // Initialize clock and update every second
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // =====================================================
  // PASSWORD VISIBILITY TOGGLE
  // =====================================================
  
  function setupPasswordToggle(toggleId, inputId) {
    const togglePassword = document.getElementById(toggleId);
    const passwordInput = document.getElementById(inputId);
    
    if (!togglePassword || !passwordInput) {
      return;
    }
    
    togglePassword.addEventListener('click', function(e) {
      e.preventDefault();
      
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      const eyeOpen = this.querySelectorAll('.eyeOpen');
      const eyeClosed = this.querySelectorAll('.eyeClosed');
      
      if (type === 'password') {
        // Password hidden - show open eye
        eyeOpen.forEach(function(el) {
          el.style.display = 'block';
        });
        eyeClosed.forEach(function(el) {
          el.style.display = 'none';
        });
      } else {
        // Password visible - show crossed eye
        eyeOpen.forEach(function(el) {
          el.style.display = 'none';
        });
        eyeClosed.forEach(function(el) {
          el.style.display = 'block';
        });
      }
      
      this.setAttribute(
        'aria-label',
        type === 'password' ? 'Show password' : 'Hide password'
      );
      
      this.setAttribute('aria-pressed', type === 'password' ? 'false' : 'true');
    });
  }

  // Initialize password toggles
  setupPasswordToggle('togglePassword', 'password');

  // =====================================================
  // LOGIN FORM SUBMISSION (Frontend only)
  // =====================================================
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      
      // Basic front-end validation
      if (!username || !password) {
        console.log('Please fill in all fields');
        return;
      }
      
      // Frontend validation passed - no backend implementation
      console.log('Login form submitted (backend not implemented)');
      console.log('Username/Email:', username);
      
      // Visual feedback (for demo purposes only)
      const loginButton = this.querySelector('.loginButton');
      if (loginButton) {
        loginButton.textContent = 'Signing in...';
        loginButton.disabled = true;
        
        setTimeout(function() {
          loginButton.textContent = 'Login';
          loginButton.disabled = false;
          // No alert - navigation handled naturally
          console.log('Login requires backend implementation');
        }, 1500);
      }
    });
  }
  
  // Note: Register link in HTML uses href="register.html" directly
  // No JavaScript interception needed
  
  // Note: Forgot password link in HTML uses href="forgot-password.html" directly
  // No JavaScript interception needed

})();
