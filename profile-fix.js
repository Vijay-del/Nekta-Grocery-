// Override loadProfileUI to show all delivery details in profile card
window._profileFixLoaded = true;
window.loadProfileUI = function(){
  var n    = localStorage.getItem('custName')    || '';
  var ph   = localStorage.getItem('custPhone')   || '';
  var addr = localStorage.getItem('custAddress') || '';
  var loggedIn = localStorage.getItem('nk_loggedIn') === 'true';

  // Clean name — remove email-looking suffixes (e.g. "vijay mvijayysa" → "vijay")
  var cleanName = n;
  // If name looks like it came from an email username, just use first word
  if(cleanName && cleanName.indexOf('@') === -1 && cleanName.split(' ').length > 2){
    // keep only first two words max
    cleanName = cleanName.split(' ').slice(0,2).join(' ');
  }
  var firstName = cleanName ? cleanName.split(' ')[0] : '';

  // Name display
  var pname = document.getElementById('pname');
  if(pname) pname.textContent = cleanName || (loggedIn ? 'My Account' : 'Welcome!');

  // Time-based greeting
  var h = new Date().getHours();
  var greeting;
  if(h >= 5 && h < 12)       greeting = '\u2600\uFE0F Good morning' + (firstName ? ', ' + firstName + '!' : '!');
  else if(h >= 12 && h < 17) greeting = '\uD83C\uDF24\uFE0F Good afternoon' + (firstName ? ', ' + firstName + '!' : '!');
  else if(h >= 17 && h < 21) greeting = '\uD83C\uDF07 Good evening' + (firstName ? ', ' + firstName + '!' : '!');
  else                        greeting = '\uD83C\uDF19 Good night' + (firstName ? ', ' + firstName + '!' : '!');

  // prof-greeting
  var greetEl = document.getElementById('prof-greeting');
  if(greetEl) greetEl.textContent = greeting;

  // psub — phone number
  var psub = document.getElementById('psub');
  if(psub) psub.textContent = ph ? '\uD83D\uDCF1 ' + ph : (loggedIn ? 'Account active' : 'Tap below to sign in');

  // Address pill
  var addrEl = document.getElementById('paddr-s');
  if(addrEl) addrEl.textContent = addr ? addr.split(',').slice(0,2).join(',') : 'Tap to set address';

  // Avatar initials — update text content only, keep existing styles
  var pav = document.getElementById('pav');
  if(pav){
    if(cleanName) pav.textContent = cleanName.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
    else pav.textContent = '\uD83D\uDC64';
  }

  // Cart count
  if(typeof cartCnt === 'function'){
    var cnt = cartCnt();
    var pcart = document.getElementById('pcart-c');
    if(pcart) pcart.textContent = cnt + ' item' + (cnt !== 1 ? 's' : '');
  }

  // Favs count
  if(typeof favs !== 'undefined'){
    var fc = document.getElementById('pfav-c');
    if(fc) fc.textContent = favs.size + ' saved';
  }

  // Show sign-in button only when not logged in
  var loginBtn = document.getElementById('prof-login-btn');
  if(loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'block';
};
