// ═══════════════════════════════════════════════════════════════
// NEKTA ADMIN AUTH — PIN verification
// PIN: nekta2026  (change via: hashAdminPin('newpin').then(h=>console.log(h)) then update ADMIN_PIN_HASH)
// ═══════════════════════════════════════════════════════════════
'use strict';

// bcrypt hash of 'nekta2026' — replace to change PIN
var ADMIN_PIN_HASH = '$2a$08$UzjXiYXCDXKuQ8TUuupNyeyY9aOOk/YJNKrPoLe39m6hSH4/NZALm';

// SHA-256 fast-path removed — now using bcrypt only for better security

function getBcrypt() {
  return window.bcrypt || (window.dcodeIO && window.dcodeIO.bcrypt) || null;
}

async function _sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

async function verifyAdminPin(inputPin) {
  if (!inputPin) return false;
  try {
    // ── PIN check (bcrypt) ──────────────────────────────────────────
    var bcrypt = getBcrypt();
    if (bcrypt && ADMIN_PIN_HASH.startsWith('$2')) {
      var pinOk = await bcrypt.compare(inputPin, ADMIN_PIN_HASH);
      return pinOk;
    }
    return false;
  } catch(e) { console.warn('verifyAdminPin error:', e); return false; }
}

async function hashAdminPin(pin) {
  var bcrypt = getBcrypt();
  if (!bcrypt) return null;
  return await bcrypt.hash(pin, 8);
}

window.verifyAdminPin = verifyAdminPin;
window.hashAdminPin   = hashAdminPin;
