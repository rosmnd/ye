(function () {
  'use strict';

  const dateDisplay = document.getElementById('dateDisplay');
  const timeDisplay = document.getElementById('timeDisplay');
  const form = document.getElementById('demoLoginForm');
  const message = document.getElementById('demoLoginMessage');
  const button = document.getElementById('demoLoginButton');

  function updateDateTime() {
    const now = new Date();
    dateDisplay.textContent = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(now);
    timeDisplay.textContent = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now);
  }

  updateDateTime();
  window.setInterval(updateDateTime, 1000);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    message.hidden = false;
    message.classList.remove('is-success');

    const username = document.getElementById('demoUsername').value.trim().toLowerCase();
    const password = document.getElementById('demoPassword').value;
    const validAdmin = username === 'admin' && password === 'admin';

    if (!validAdmin && !validClient) {
      message.textContent = 'Use admin / admin or client / client.';
      return;
    }

    message.classList.add('is-success');
    message.textContent = 'Demo login accepted. Opening the module directory...';
    button.disabled = true;
    button.textContent = 'Opening modules...';
    window.setTimeout(function () {
      window.location.href = '../../modules.html';
    }, 350);
  });
})();
