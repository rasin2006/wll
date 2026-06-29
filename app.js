// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const SB_URL = "https://tuipwrfcniipvmeuoedi.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1aXB3cmZjbmlpcHZtZXVvZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MzY3MTcsImV4cCI6MjA5ODIxMjcxN30.LPM6KQVXZiUjeYklAxjaB7JeOHnPEkNu6905-LAsAuI";

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let ME = null;          // current profile
let allDebts = [];
let allTx = [];
let pendingTx = [];     // pending for me to confirm
let isSignup = false;
let pinVal = '';
let photoBase64 = null;
let newProfilePhotoBase64 = null;
let payTab = 'scan';
let foundPayProfile = null;
let foundReqProfile = null;
let camStream = null;
let searchTimer = null;
let barcodeDetector = null;
let sbClient = null;
let realtimeChannel = null;
let presenceChannel = null;

let promptPinVal = '';
let pendingPinAction = null;
let debtsRevealed = false;
let historyRevealed = false;
let pendingTxAction = null;

const ADMIN_CODE = '*2006*';
const MAX_RECENT_LOGINS = 5;
let currentLang = 'en';

// ═══════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════
async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {})
    },
    ...opts
  });
  if (!r.ok) { const e = await r.json().catch(()=>{}); throw new Error(e?.message || e?.details || 'Request failed'); }
  return r.status === 204 ? null : r.json();
}

async function sbRpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) { const e = await r.json().catch(()=>{}); throw new Error(e?.message || 'RPC failed'); }
  return r.status === 204 ? null : r.json();
}

async function sbAuth(email, pass, signup) {
  const ep = signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
  const r = await fetch(`${SB_URL}${ep}`, {
    method: "POST",
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  return r.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════
function riel(n) {
  const num = Number(n||0).toLocaleString('en-US');
  return currentLang === 'km' ? `${num} រៀល` : `${num} KHR`;
}

const i18n = {
  en: {
    // Auth
    welcome_back: 'Welcome back',
    auth_sub_signin: 'Sign in with your phone or username',
    create_account: 'Create account',
    auth_sub_signup: 'Set up your WLL profile',
    phone_or_username: 'Phone or username',
    phone_or_username_ph: 'Phone number or username',
    phone_number: 'Phone number',
    phone_number_ph: '+855 ...',
    pin_create: 'Create a 4-digit PIN',
    pin_enter: 'Enter your PIN',
    btn_signin: 'Sign in',
    btn_create_account: 'Create account',
    auth_switch_signin: 'Already have an account? ',
    auth_switch_signin_link: 'Sign in',
    auth_switch_signup: 'New here? ',
    auth_switch_signup_link: 'Create account',
    full_name: 'Full Name',
    full_name_hint: 'Your real name, for display purposes.',
    username_hint: 'Unique ID for payments (no spaces).',
    // Home
    good_day: 'Good day,',
    owed_to_you: 'Owes you',
    you_owe: 'You owe',
    net_position: 'Net position',
    pay: 'Pay',
    borrow: 'Borrow',
    nav_home: 'Home',
    nav_history: 'History',
    nav_profile: 'Profile',
    nav_manage: 'Manage',
    notifications: 'Notifications',
    notifications_none: 'No notifications',
    you_owe_section: 'You owe',
    they_owe_you: 'They owe you',
    edit_profile: 'Edit profile',
    pay_sub: 'Scan, type, or flip their QR code',
    request_sub: 'Scan, type, or flip their QR code',
    phonenumber_disabled: 'Phone number is disabled',
    phone: 'Phone number',
    username: 'Username',
    manage_profile: 'Manage profile',
    your_payment_code: 'Your payment code',
    you_can_scan_this_to_pay_you: 'You can scan this to pay you.',
    share_qr_sub: 'Share this so others can pay you.',
    others_can_scan_this_to_pay_you: 'Others can scan this to pay you.',
    no_transactions_yet: 'No transactions yet',
    language: 'Language',
    all_clean_title: 'All clean',
    all_clean_sub: 'No active debts.\nHit Pay or Borrow to get started.',
    phone_number_disabled: 'Phone number is disabled',
    save_changes: 'Save changes',
    cancel: 'Cancel',
    sign_out: 'Sign out',
    find_person_borrow: 'Find someone to borrow from',
    find_person_pay: 'Find someone to pay',
    enter_amount_khmer: 'Enter amount in KHR',
    show_debt_details: 'Show Debt Details',
    hide_debt_details: 'Hide Debt Details',
    pin_reveal_title: 'Enter PIN to Reveal',
    pin_reveal_sub: 'For your privacy, enter your PIN to view debt details.',
    pin_tx_title: 'Confirm with PIN',
    pin_tx_sub: 'Enter your PIN to authorize this transaction.',
    pin_edit_profile_title: 'Enter PIN to Edit',
    pin_edit_profile_sub: 'For your privacy, enter your PIN to edit your profile.',
    pin_history_title: 'Enter PIN to View History',
    pin_history_sub: 'For your privacy, enter your PIN to view transaction history.',
    history_protected: 'History Protected',
    history_protected_sub: 'Your transaction history is hidden for privacy.',
    reveal_history: 'Reveal History',
    hide_history: 'Hide History',
  },
  km: {
    // Auth
    welcome_back: 'សូមស្វាគមន៍',
    auth_sub_signin: 'ចូលដោយប្រើលេខទូរស័ព្ទឬឈ្មោះអ្នកប្រើប្រាស់',
    create_account: 'បង្កើតគណនី',
    auth_sub_signup: 'រៀបចំព័ត៌មាន WLL របស់អ្នក',
    phone_or_username: 'លេខទូរស័ព្ទ ឬឈ្មោះអ្នកប្រើ',
    phone_or_username_ph: 'លេខទូរស័ព្ទ ឬឈ្មោះអ្នកប្រើ',
    phone_number: 'លេខទូរស័ព្ទ',
    phone_number_ph: '+៨៥៥ ...',
    pin_create: 'បង្កើត​ PIN ៤ខ្ទង់',
    pin_enter: 'បញ្ចូល PIN របស់អ្នក',
    btn_signin: 'ចូល',
    btn_create_account: 'បង្កើតគណនី',
    auth_switch_signin: 'មានគណនីរួចហើយ? ',
    auth_switch_signin_link: 'ចូល',
    auth_switch_signup: 'អ្នក​ថ្មី​? ',
    auth_switch_signup_link: 'បង្កើតគណនី',
    full_name: 'ឈ្មោះ​ពេញ',
    full_name_hint: 'ឈ្មោះពិតរបស់អ្នកសម្រាប់បង្ហាញ។',
    username_hint: 'ID សម្រាប់បង់ប្រាក់ (គ្មានដកឃ្លា)។',
    // Home
    good_day: 'សួស្តី,',
    owed_to_you: 'ជំពាក់អ្នក',
    you_owe: 'អ្នកជំពាក់',
    pay: 'បង់',
    borrow: 'ខ្ចី',
    nav_home: 'ទំព័រដើម',
    nav_history: 'ប្រវត្តិ',
    nav_profile: 'គណនី',
    nav_manage: 'គ្រប់គ្រង',
    notifications: 'ការជូនដំណឹង',
    notifications_none: 'គ្មានការជូនដំណឹង',
    you_owe_section: 'អ្នកជំពាក់',
    they_owe_you: 'ជំពាក់អ្នក',
    net_position: 'សមតុល្យសរុប',
    edit_profile: 'កែប្រែ',
    pay_sub: 'ស្កេន, វាយ, ឬផ្ទុយ QR code របស់ពួកគេ',
    request_sub: 'ស្កេន, វាយ, ឬផ្ទុយ QR code របស់ពួកគេ',
    phonenumber_disabled: 'លេខទូរស័ព្ទមិនអាចផ្លាស់ប្តូរបានទេ។',
    phone: 'លេខទូរស័ព្ទ',
    username: 'ឈ្មោះអ្នកប្រើប្រាស់',
    manage_profile: 'គ្រប់គ្រងគណនី',
    your_payment_code: 'កូដបង់ប្រាក់របស់អ្នក',
    you_can_scan_this_to_pay_you: 'អ្នកអាចស្កេននេះដើម្បីបង់ប្រាក់ឱ្យអ្នក។',
    share_qr_sub: 'ចែករំលែក QR code របស់អ្នកឱ្យមិត្តភក្តិរបស់អ្នកដើម្បីទូទាត់ឬខ្ចីប្រាក់ពីអ្នក។',
    others_can_scan_this_to_pay_you: 'អ្នកផ្សេងទៀតអាចស្កេននេះដើម្បីបង់ប្រាក់ឱ្យអ្នក។',
    no_transactions_yet: 'មិនមានប្រតិបត្តិការណ៍ទេ',
    language: 'ភាសា',
    all_clean_title: 'ទាំងអស់ត្រូវបានសម្រួល',
    all_clean_sub: 'គ្មានជំពាក់សកម្មទេ។\nចុចបង់ឬខ្ចីដើម្បីចាប់ផ្តើម។',
    phone_number_disabled: 'លេខទូរស័ព្ទមិនអាចផ្លាស់ប្តូរបានទេ។',
    save_changes: 'រក្សាទុកការផ្លាស់ប្តូរ',
    cancel: 'បោះបង់',
    you_owe_meta: 'អ្នកជំពាក់',
    owes_you: 'ជំពាក់អ្នក',
    paid_you: 'បានសងអ្នក',
    find_person_borrow: 'ស្វែងរកមនុស្សដែលអ្នកចង់ខ្ចីប្រាក់ពីពួកគេ',
    find_person_pay: 'ស្វែងរកមនុស្សដែលអ្្នកចង់បង់ប្រាក់ឱ្យពួកគេ',
    enter_amount_khmer: 'បញ្ចូលចំនុំទឹកប្រាក់ជារៀល',
    sign_out: 'ចាកចេញ',
    show_debt_details: 'បង្ហាញព័ត៌មានលម្អិតអំពីបំណុល',
    hide_debt_details: 'លាក់ព័ត៌មានលម្អិតអំពីបំណុល',
    pin_reveal_title: 'បញ្ចូល PIN ដើម្បីបង្ហាញ',
    pin_reveal_sub: 'ដើម្បីសុវត្ថិភាពឯកជនភាពរបស់អ្នក សូមបញ្ចូល PIN ដើម្បីមើលព័ត៌មានលម្អិតអំពីបំណុល។',
    pin_tx_title: 'បញ្ជាក់ជាមួយ PIN',
    pin_tx_sub: 'បញ្ចូល PIN របស់អ្នកដើម្បីយល់ព្រមប្រតិបត្តិការនេះ។',
    pin_edit_profile_title: 'បញ្ចូល PIN ដើម្បីកែសម្រួល',
    pin_edit_profile_sub: 'ដើម្បីសុវត្ថិភាពឯកជនភាពរបស់អ្នក សូមបញ្ចូល PIN ដើម្បីកែសម្រួលប្រវត្តិរូបរបស់អ្នក។',
    pin_history_title: 'បញ្ចូល PIN ដើម្បីមើលប្រវត្តិ',
    pin_history_sub: 'ដើម្បីសុវត្ថិភាពឯកជនភាពរបស់អ្នក សូមបញ្ចូល PIN ដើម្បីមើលប្រវត្តិប្រតិបត្តិការ។',
    history_protected: 'ប្រវត្តិត្រូវបានការពារ',
    history_protected_sub: 'ប្រវត្តិប្រតិបត្តិការរបស់អ្នកត្រូវបានលាក់ដើម្បីឯកជនភាព។',
    reveal_history: 'បង្ហាញប្រវត្តិ',
    hide_history: 'លាក់ប្រវត្តិ',
    all_transactions_between_you: 'ប្រតិបត្តិការទាំងអស់រវាងអ្នក',
  }
};

function t(key) { return i18n[currentLang]?.[key] || key; }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (el.matches('input[placeholder]')) { el.placeholder = t(key); }
    else { el.innerHTML = t(key); }
  });
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type='s') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.style.display = 'none', 3200);
}

function avatarHTML(name, photo, size) {
  if (photo) return `<img src="${esc(photo)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #00e5a033" alt="">`;
  const initials = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const pals = [['#1a1f3a','#7c6ef5'],['#0f2027','#00c896'],['#1a0f2e','#e060ff'],['#0f1a1a','#00d4aa'],['#1f1a0f','#f0a030']];
  const [bg,fg] = pals[(name||'').charCodeAt(0)%pals.length];
  const fs = Math.round(size*.38);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fs}px;flex-shrink:0;border:1.5px solid ${fg}33;letter-spacing:.03em">${initials}</div>`;
}

function playNotificationSound() {
  // Browsers may prevent audio from playing without user interaction.
  // We clone the node to allow for rapid-fire plays if needed.
  const sound = NOTIFICATION_SOUND.cloneNode();
  sound.play().catch(e => {
    console.warn("Notification sound was blocked by the browser.", e);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NUMPAD
// ═══════════════════════════════════════════════════════════════════════════
function buildNumpad() {
  const pad = document.getElementById('numpad');
  const keys = ['1','2','3','4','5','6','7','8','9','*','0','⌫'];
  pad.innerHTML = keys.map(k => {
    const cls = k === '⌫' ? 'numpad-btn del' : 'numpad-btn';
    return `<button class="${cls}" onclick="numpadPress('${k}')">${k}</button>`;
  }).join('');
}

function numpadPress(k) {
  if (k === '⌫') {
    pinVal = pinVal.slice(0,-1);
  } else {
    const isPotentiallyAdmin = pinVal.startsWith('*') || (pinVal.length === 0 && k === '*');
    const maxLength = isPotentiallyAdmin ? ADMIN_CODE.length : 4;
    if (pinVal.length < maxLength) {
      pinVal += k;
    }
  }

  // Check for admin code match
  if (pinVal === ADMIN_CODE) {
    toast('Admin mode unlocked!', 'i');
    clearPin();
    gotoScreen('admin-screen');
    renderAdminScreen();
    return; // Exit early
  }

  updatePinDisplay();
  // Auto-submit on 4th digit entry, but only on the sign-in screen
  if (pinVal.length === 4 && !isSignup && !pinVal.includes('*')) {
    doAuth();
  }
}

function updatePinDisplay() {
  [0,1,2,3].forEach(i => {
    const d = document.getElementById('pd'+i);
    if (i < pinVal.length) { d.textContent = '●'; d.classList.add('filled'); }
    else { d.textContent = '–'; d.classList.remove('filled'); }
  });
}

function clearPin() { pinVal = ''; updatePinDisplay(); }

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC PIN PROMPT
// ═══════════════════════════════════════════════════════════════════════════
function buildPromptNumpad() {
  const pad = document.getElementById('prompt-numpad');
  if (!pad) return;
  const keys = ['1','2','3','4','5','6','7','8','9','*','0','⌫'];
  pad.innerHTML = keys.map(k => {
    const cls = k === '⌫' ? 'numpad-btn del' : 'numpad-btn';
    return `<button class="${cls}" onclick="promptNumpadPress('${k}')">${k}</button>`;
  }).join('');
}

function promptNumpadPress(k) {
  if (k === '⌫') {
    promptPinVal = promptPinVal.slice(0, -1);
  } else if (promptPinVal.length < 4) {
    promptPinVal += k;
  }
  
  updatePromptPinDisplay();

  if (promptPinVal.length === 4) {
    // A slight delay to allow the user to see the 4th dot.
    setTimeout(checkPromptPin, 200);
  }
}

function updatePromptPinDisplay() {
  [0,1,2,3].forEach(i => {
    const d = document.getElementById('ppd'+i);
    if (!d) return;
    if (i < promptPinVal.length) { d.textContent = '●'; d.classList.add('filled'); }
    else { d.textContent = '–'; d.classList.remove('filled'); }
  });
}

function clearPromptPin() {
  promptPinVal = '';
  updatePromptPinDisplay();
}

function checkPromptPin() {
  if (!ME || !ME.pin_hash) {
    toast('Cannot verify PIN.', 'e');
    return;
  }
  
  if (atob(ME.pin_hash) === promptPinVal) {
    toast('PIN correct.', 's');
    executePendingPinAction();
  } else {
    toast('Incorrect PIN', 'e');
    const display = document.getElementById('prompt-pin-display');
    if (display) {
      display.classList.add('shake');
      setTimeout(() => {
        display.classList.remove('shake');
        clearPromptPin();
      }, 500);
    } else {
      clearPromptPin();
    }
  }
}

function promptForPin(config) {
  pendingPinAction = config;
  document.getElementById('pin-prompt-title').innerHTML = t(config.titleKey);
  document.getElementById('pin-prompt-sub').innerHTML = t(config.subtitleKey);
  clearPromptPin();
  openOverlay('pin-prompt-overlay');
}

function executePendingPinAction() {
    if (!pendingPinAction) return;
    closeOverlay('pin-prompt-overlay');
    const { action, details } = pendingPinAction;
    switch(action) {
        case 'revealDebts':
            toggleDebtVisibility(true);
            break;
        case 'revealHistory':
            toggleHistoryVisibility(true);
            break;
        case 'executeTransaction':
            executePendingTransaction();
            break;
        case 'editProfile':
            toggleProfileEdit(true);
            break;
    }
    pendingPinAction = null;
}

function closePinPrompt() {
    closeOverlay('pin-prompt-overlay');
    pendingPinAction = null;
    clearPromptPin();
}

async function executePendingTransaction() {
    if (!pendingTxAction) return;
    const { type, details } = pendingTxAction;
    const { to_id, to_name, amount, note } = details;
    const payBtn = document.getElementById('pay-confirm-btn');
    const reqBtn = document.querySelector('#req-amount-step .btn-primary');
    if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Sending…'; }
    if (reqBtn) { reqBtn.disabled = true; reqBtn.textContent = 'Recording…'; }
    try {
        await sb('transactions', {
            method: 'POST',
            body: JSON.stringify({
                type: type, from_id: ME.id, to_id: to_id,
                from_name: ME.full_name || ME.username, to_name: to_name,
                amount, note, status: 'pending'
            })
        });
        if (type === 'pay') {
            closeOverlay('pay-overlay');
            toast(`Payment request sent to ${to_name} ✅`);
        } else { // request
            closeOverlay('req-overlay');
            toast(`Debt to ${to_name} recorded ✅`);
        }
        await loadData();
    } catch (e) {
        toast(e.message || 'Transaction failed', 'e');
    } finally {
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = `Send to ${foundPayProfile?.username || ''}`; }
        if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Record Debt'; }
        pendingTxAction = null;
        clearPromptPin();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBT VISIBILITY & PROTECTED ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
function promptForPinReveal() {
  promptForPin({
    action: 'revealDebts',
    titleKey: 'pin_reveal_title',
    subtitleKey: 'pin_reveal_sub'
  });
}

function toggleDebtVisibility(show) {
    debtsRevealed = show;
    const container = document.getElementById('debt-details-container');
    const button = document.getElementById('reveal-debts-btn');
    if (container) container.style.display = show ? 'block' : 'none';
    if (button) button.style.display = show ? 'none' : 'block';
}

function requestProfileEdit() {
    promptForPin({
        action: 'editProfile',
        titleKey: 'pin_edit_profile_title',
        subtitleKey: 'pin_edit_profile_sub'
    });
}

function toggleHistoryVisibility(show) {
    historyRevealed = show;
    const container = document.getElementById('history-content-container');
    const revealUI = document.getElementById('history-reveal-container');
    if (container) container.style.display = show ? 'block' : 'none';
    if (revealUI) revealUI.style.display = show ? 'none' : 'block';
}

function requestHistoryReveal() {
    promptForPin({
        action: 'revealHistory',
        titleKey: 'pin_history_title',
        subtitleKey: 'pin_history_sub'
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MODE
// ═══════════════════════════════════════════════════════════════════════════
function toggleMode(forceUpdate = false) {
  if (!forceUpdate) {
    isSignup = !isSignup;
  }
  document.getElementById('auth-title').textContent = isSignup ? t('create_account') : t('welcome_back');
  document.getElementById('auth-sub').textContent = isSignup ? t('auth_sub_signup') : t('auth_sub_signin');
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    authBtn.textContent = t('btn_create_account');
    authBtn.style.display = isSignup ? 'block' : 'none';
  }

  document.getElementById('auth-switch').innerHTML = isSignup
    ? `${t('auth_switch_signin')}<span onclick="toggleMode()">${t('auth_switch_signin_link')}</span>`
    : `${t('auth_switch_signup')}<span onclick="toggleMode()">${t('auth_switch_signup_link')}</span>`;
  document.getElementById('id-label').textContent = isSignup ? t('phone_number') : t('phone_or_username');
  document.getElementById('id-input').placeholder = isSignup ? t('phone_number_ph') : t('phone_or_username_ph');
  document.getElementById('pin-label').textContent = isSignup ? t('pin_create') : t('pin_enter');
  document.getElementById('signup-photo').style.display = isSignup ? 'flex' : 'none';
  document.getElementById('signup-fullname').style.display = isSignup ? 'block' : 'none';
  document.getElementById('signup-username').style.display = isSignup ? 'block' : 'none';
  if (!forceUpdate) {
    clearPin();
  }
}

document.getElementById('photo-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    photoBase64 = ev.target.result;
    const img = document.getElementById('photo-preview');
    img.src = photoBase64; img.style.display = 'block';
    document.getElementById('photo-ph').style.display = 'none';
  };
  rd.readAsDataURL(f);
});

document.getElementById('profile-photo-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    newProfilePhotoBase64 = ev.target.result;
    const img = document.getElementById('profile-photo-preview');
    img.src = newProfilePhotoBase64;
    img.style.display = 'block';
    document.getElementById('profile-photo-ph').style.display = 'none';
  };
  rd.readAsDataURL(f);
});
// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function doAuth() {
  const idVal = document.getElementById('id-input').value.trim();
  if (!idVal) return toast('Enter your phone or username', 'e');
  if (isSignup) {
    if (pinVal.length < 1 || pinVal.length > 4) return toast('PIN must be 1-4 digits.', 'e');
  } else if (pinVal.length !== 4) {
    return toast('Enter your 4-digit PIN.', 'e');
  }

  const btn = document.getElementById('auth-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Please wait…';
  }

  try {
    if (isSignup) {
      const fullname = document.getElementById('fullname-input').value.trim();
      const username = document.getElementById('username-input').value.trim();
      if (!fullname) { toast('Full name is required', 'e'); return; }
      if (!username) { toast('Username is required', 'e'); return; }
      if (/\s/.test(username)) { toast('Username cannot contain spaces.', 'e'); return; }
      const email = username.toLowerCase() + '@tabify.internal';
      const pass = 'tbf_' + btoa(pinVal + idVal).slice(0,24);
      const ar = await sbAuth(email, pass, true);
      if (ar.error) throw new Error(ar.error.message);
      const uid = ar.user?.id || crypto.randomUUID();
      const rows = await sb('profiles', {
        method: 'POST',
        body: JSON.stringify({ id: uid, username, full_name: fullname, phone: idVal, email, photo_url: photoBase64||null, pin_hash: btoa(pinVal) })
      });
      const p = Array.isArray(rows) ? rows[0] : rows;
      saveSession(ar.user, p);
      toast('Welcome to WLL! 🎉');
    } else {
      // Login: efficiently match by phone OR username in a single query
      const rows = await sb(`profiles?or=(phone.eq.${encodeURIComponent(idVal)},username.eq.${encodeURIComponent(idVal)})&limit=1`);
      const p = rows?.[0];
      if (!p) throw new Error('No account found');
      if (atob(p.pin_hash) !== pinVal) throw new Error('Incorrect PIN');
      saveRecentLogin(idVal);
      saveSession({ id: p.id }, p);
      toast(`Welcome back, ${p.full_name || p.username}!`);
    }
    await loadData();
    showAuth(false);
    gotoScreen('home');
    setupRealtime();
  } catch(e) {
    let errorMessage = e.message || 'Something went wrong';
    if (isSignup && (errorMessage.includes('profiles_username_key') || errorMessage.includes('User already registered'))) {
        errorMessage = 'This name is already taken. Please try a different name or a variation.';
    }
    toast(errorMessage, 'e');
    // If login fails (not signup), clear the PIN for a quick retry.
    if (!isSignup) {
      setTimeout(clearPin, 500);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = isSignup ? t('btn_create_account') : t('btn_signin');
    }
  }
}

function saveSession(user, profile) {
  ME = profile;
  localStorage.setItem('tabify_session', JSON.stringify({ user, profile }));
}

function saveRecentLogin(loginId) {
  if (!loginId) return;
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem('tabify_recent_logins')) || [];
  } catch {
    recent = [];
  }
  const filtered = recent.filter(l => l && l !== loginId);
  filtered.unshift(loginId);
  const updated = filtered.slice(0, MAX_RECENT_LOGINS);
  localStorage.setItem('tabify_recent_logins', JSON.stringify(updated));
}

function populateRecentLogins() {
  const datalist = document.getElementById('recent-logins');
  if (!datalist) return;
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem('tabify_recent_logins')) || [];
  } catch { recent = []; }
  datalist.innerHTML = recent.map(loginId => `<option value="${esc(loginId)}"></option>`).join('');
}

function showAuth(show) {
  document.getElementById('auth').style.display = show ? 'block' : 'none';
  document.getElementById('navbar').style.display = show ? 'none' : 'flex';
  if (show) {
    populateRecentLogins();
  }
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('tabify_lang', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.lang-btn-${lang}`).forEach(b => {
    b.classList.add('active');
  });
  applyTranslations();
  if (ME) { loadData(); }
  else { toggleMode(true); }
}

function logout() {
  if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  localStorage.removeItem('tabify_session');
  localStorage.removeItem('tabify_last_screen');
  teardownRealtime();
  ME = null; allDebts=[]; allTx=[]; pendingTx=[];
  gotoScreen('auth');
  document.getElementById('id-input').value='';
  populateRecentLogins();
  clearPin();
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════
async function loadData() {
  if (!ME) return;
  try {
    const [d, t] = await Promise.all([
      sb(`debts?select=*,user_a_profile:user_a(id,username,full_name,photo_url),user_b_profile:user_b(id,username,full_name,photo_url)&or=(user_a.eq.${ME.id},user_b.eq.${ME.id})&order=updated_at.desc`),
      sb(`transactions?or=(from_id.eq.${ME.id},to_id.eq.${ME.id})&order=created_at.desc&limit=40`)
    ]);
    allDebts = d || [];
    allTx = t || [];
    pendingTx = allTx.filter(tx => tx.status === 'pending' && tx.to_id === ME.id);
    renderHome();
    renderHistory();
    renderProfileScreen();
    updateNotifBadge();
  } catch(e) {
    console.error(e);
    throw e; // Re-throw for callers to handle
  }
}

async function loadDataWithFeedback() {
    const netEl = document.getElementById('net-balance');
    if (netEl.classList.contains('refreshing')) return; // Already refreshing

    netEl.classList.add('refreshing');
    const originalText = netEl.textContent;
    netEl.textContent = 'Refreshing...';
    netEl.style.opacity = '0.7';

    try {
        await loadData();
        toast('Refreshed!', 's');
    } catch (e) {
        toast('Refresh failed.', 'e');
        netEl.textContent = originalText; // Restore original text on failure
    } finally {
        netEl.classList.remove('refreshing');
        netEl.style.opacity = '1';
    }
}

function updateOnlineCount(count) {
    const el = document.getElementById('online-indicator');
    const countEl = document.getElementById('online-count');
    if (!el || !countEl) return;

    if (count > 0) {
        countEl.textContent = count;
        el.style.display = 'flex';
    } else {
        el.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER HOME
// ═══════════════════════════════════════════════════════════════════════════
function renderHome() {
  if (!ME) return;
  document.getElementById('home-username').textContent = ME.full_name || ME.username;
  document.getElementById('home-greeting').textContent = `@${ME.username}`;
  document.getElementById('home-avatar-el').innerHTML = avatarHTML(ME.full_name || ME.username, ME.photo_url, 46);

  // net: positive = owed to me, negative = I owe
  const owedToMe = allDebts.filter(d => d.net_creditor === ME.id && d.net_amount > 0);
  const iOwe = allDebts.filter(d => d.net_creditor !== ME.id && d.net_amount > 0 && (d.user_a===ME.id||d.user_b===ME.id));
  const totalOwed = owedToMe.reduce((s,d)=>s+Number(d.net_amount),0);
  const totalIOwe = iOwe.reduce((s,d)=>s+Number(d.net_amount),0);
  const net = totalOwed - totalIOwe;

  const netEl = document.getElementById('net-balance');
  netEl.textContent = (net>=0?'+':'−') + riel(Math.abs(net));
  netEl.style.color = net>=0 ? '#00e5a0' : '#ff8080';
  document.getElementById('total-owed').textContent = riel(totalOwed);
  document.getElementById('total-iowe').textContent = riel(totalIOwe);

  // Ensure debt visibility is correctly handled on render
  toggleDebtVisibility(debtsRevealed);

  const wrap = document.getElementById('debt-list-wrap');
  let html = '';

  if (owedToMe.length===0 && iOwe.length===0) {
    html = `<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-title" data-i18n="all_clean_title">All clean!</div><div class="empty-sub" data-i18n="all_clean_sub">No active debts.<br>Hit Pay or Owe to get started.</div></div>`;
  } else {
    if (owedToMe.length) {
      html += `<div class="section-head" data-i18n="they_owe_you">They owe you</div>`;
      owedToMe.forEach(d => {
        const other = d.user_a === ME.id ? d.user_b_profile : d.user_a_profile;
        html += debtRow(other.id, other.full_name || other.username, other.photo_url, d.net_amount, true, d.updated_at);
      });
    }
    if (iOwe.length) {
      html += `<div class="section-head mt12" data-i18n="you_owe_section">You owe</div>`;
      iOwe.forEach(d => {
        const other = d.user_a === ME.id ? d.user_b_profile : d.user_a_profile;
        html += debtRow(other.id, other.full_name || other.username, other.photo_url, d.net_amount, false, d.updated_at);
      });
    }
  }
  wrap.innerHTML = html;
  applyTranslations();
}

function debtRow(otherId, name, photo, amount, isOwed, date) {
  const color = isOwed ? '#00e5a0' : '#ff8080';
  const prefix = isOwed ? '+ ' : '− ';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const days = Math.floor(seconds / 86400);
  const dt = days < 1 ? 'today' : (days < 2 ? 'yesterday' : new Date(date).toLocaleDateString());
  const metaText = isOwed ? t('owes_you') : t('you_owe_meta');
  return `<div class="debt-item" onclick="openPeerHistory('${otherId}')">
    ${avatarHTML(name,photo,44)}
    <div class="debt-info">
      <div class="debt-name">${esc(name)}</div>
      <div class="debt-meta">${metaText} · ${dt}</div>
    </div>
    <div class="debt-right">
      <div class="debt-val" style="color:${color}">${prefix}${riel(amount)}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER HISTORY
// ═══════════════════════════════════════════════════════════════════════════
function renderHistory() {
  const el = document.getElementById('tx-list');
  if (!el) return;
  if (!allTx.length) {
    el.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-sub" data-i18n="no_transactions_yet">No transactions yet</div></div>';
  } else {
    el.innerHTML = allTx.map(tx => renderTxItem(tx)).join('');
  }
  
  toggleHistoryVisibility(historyRevealed);
  applyTranslations();
}

function renderTxItem(tx) {
    const sent = tx.from_id === ME.id;
    const itemClass = sent ? 'sent' : 'recv';
    const isPay = tx.type === 'pay';
    const who = sent ? (tx.to_name || '?') : (tx.from_name || '?');
    let label;
    if (isPay) {
      label = sent ? `Paid ${who}` : `Payment from ${who}`;
    } else { // 'request' now means recording a debt you owe
      label = sent ? `You owe ${who}` : `${who} recorded a debt to you`;
    }
    const color = tx.status==='pending' ? '#f0a030' : (sent ? '#ff8080' : '#00e5a0');
    const prefix = sent ? '− ' : '+ ';
    const iconBg = tx.status === 'pending' ? 'tx-pend' : (sent ? 'tx-sent' : 'tx-recv');
    const icon = tx.status === 'pending' ? '⏳' : (sent ? '↑' : '↓');
    const dt = new Date(tx.created_at).toLocaleDateString();
    return `<div class="tx-item ${itemClass}">
      <div class="tx-icon ${iconBg}">${icon}</div>
      <div>
        <div class="tx-who">${esc(label)}</div>
        <div class="tx-meta">${esc(tx.note||'')} · ${dt}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount" style="color:${color}">${prefix}${riel(tx.amount)}</div>
        <div class="tx-status status-${tx.status}">${tx.status}</div>
      </div>
    </div>`;
}

function openPeerHistory(otherUserId) {
  if (!otherUserId) return;

  const debtWithUser = allDebts.find(d => d.user_a === otherUserId || d.user_b === otherUserId);
  if (!debtWithUser) return;
  
  const otherUser = debtWithUser.user_a === otherUserId ? debtWithUser.user_a_profile : debtWithUser.user_b_profile;

  const peerTx = allTx.filter(tx => 
    (tx.from_id === ME.id && tx.to_id === otherUserId) ||
    (tx.from_id === otherUserId && tx.to_id === ME.id)
  );

  const headerEl = document.getElementById('peer-history-header');
  headerEl.innerHTML = `
    <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 12px;">
      ${avatarHTML(otherUser.full_name || otherUser.username, otherUser.photo_url, 48)}
      <div>
        <div class="sheet-title" style="margin-bottom:2px; display: flex; align-items: center; gap: 10px;"><i class="fi fi-rs-time-past"></i> <span>History with ${esc(otherUser.username)}</span></div>
        <div class="sheet-sub" style="margin-bottom:0;" data-i18n="all_transactions_between_you">All transactions between you</div>
      </div>
    </div>
  `;

  const listEl = document.getElementById('peer-history-list');
  if (!peerTx.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📋</div><div class="empty-sub" data-i18n="tx_empty_sub">No transactions with this person yet.</div></div>';
  } else {
    listEl.innerHTML = peerTx.map(tx => renderTxItem(tx)).join('');
  }

  const actionsEl = document.getElementById('peer-history-actions');
  if (actionsEl) {
      actionsEl.innerHTML = `
        <button class="action-btn pay-btn-main" onclick="payUserFromHistory('${esc(otherUser.username)}')">
          <span class="ab-icon"><i class="fi fi-rr-wallet-arrow"></i></span> 
          <span class="ab-label" data-i18n="pay">Pay</span>
        </button>
        <button class="action-btn req-btn-main" onclick="borrowFromUserInHistory('${otherUser.id}','${esc(otherUser.username)}','${esc(otherUser.full_name || otherUser.username)}','${esc(otherUser.phone||'')}','${esc(otherUser.photo_url||'')}')">
          <span class="ab-icon"><i class="fi fi-rr-handshake"></i></span> 
          <span class="ab-label" data-i18n="borrow">Borrow</span>
        </button>
      `;
  }

  openOverlay('peer-history-overlay');
  applyTranslations();
}

function payUserFromHistory(username) {
  closeOverlay('peer-history-overlay');
  setTimeout(() => {
    // Manually open the pay overlay and bypass the tab selection UI
    openOverlay('pay-overlay');

    // Hide the tab UI elements
    document.querySelector('#pay-overlay .tab-row').style.display = 'none';
    document.querySelector('#pay-overlay .sheet-sub').style.display = 'none';
    ['scan', 'type', 'upload'].forEach(t => {
      document.getElementById('pay-' + t).style.display = 'none';
    });

    // Directly resolve the username to show the amount input
    resolvePayUsername(username);
  }, 250);
}

function borrowFromUserInHistory(id, username, fullname, phone, photo) {
    closeOverlay('peer-history-overlay');
    setTimeout(() => {
        openRequest();
        selectReqUser(id, username, fullname, phone, photo);
    }, 250);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE/MANAGEMENT SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function renderProfileScreen() {
  if (!ME) return;
  
  // Part 1: Profile Info Display
  document.getElementById('profile-photo-display').innerHTML = avatarHTML(ME.full_name || ME.username, ME.photo_url, 96);
  document.getElementById('profile-fullname-display').textContent = ME.full_name || ME.username;
  document.getElementById('profile-username-display').textContent = '@' + ME.username;

  // Part 2: Profile Edit Form
  document.getElementById('profile-username-input').value = ME.username;
  document.getElementById('profile-fullname-input').value = ME.full_name || '';
  document.getElementById('profile-phone-input').value = ME.phone;
  const photoPreview = document.getElementById('profile-photo-preview');
  const photoPh = document.getElementById('profile-photo-ph');
  if (ME.photo_url) {
      photoPreview.src = ME.photo_url;
      photoPreview.style.display = 'block';
      photoPh.style.display = 'none';
  } else {
      photoPreview.src = '';
      photoPreview.style.display = 'none';
      photoPh.style.display = 'flex';
  }
}

function toggleProfileEdit(isEditing) {
    document.getElementById('profile-display-wrap').style.display = isEditing ? 'none' : 'block';
    document.getElementById('profile-edit-form').style.display = isEditing ? 'block' : 'none';
    if (isEditing) {
        newProfilePhotoBase64 = null; // Reset photo state
        renderProfileScreen(); // re-populate form with original data
    }
}

async function saveProfileChanges() {
    if (!ME) return;
    const newFullName = document.getElementById('profile-fullname-input').value.trim();
    const newUsername = document.getElementById('profile-username-input').value.trim();
    if (!newFullName) return toast('Full name cannot be empty', 'e');
    if (!newUsername) return toast('Username cannot be empty', 'e');
    const updates = { username: newUsername, full_name: newFullName };
    if (newProfilePhotoBase64) { updates.photo_url = newProfilePhotoBase64; }
    try {
        const [updatedProfile] = await sb(`profiles?id=eq.${ME.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        Object.assign(ME, updatedProfile);
        const sess = JSON.parse(localStorage.getItem('tabify_session') || '{}');
        if (sess.profile) { Object.assign(sess.profile, updatedProfile); localStorage.setItem('tabify_session', JSON.stringify(sess)); }
        toast('Profile updated successfully!');
        toggleProfileEdit(false);
        renderHome(); renderProfileScreen();
    } catch (e) {
        let errorMessage = e.message || 'Failed to update profile';
        if (errorMessage.includes('profiles_username_key')) {
            errorMessage = 'This name is already taken.';
        }
        toast(errorMessage, 'e');
    }
}

async function renderAdminScreen() {
    const screen = document.getElementById('admin-screen');
    screen.innerHTML = `<div style="padding: 52px 20px 90px;">
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom:20px;">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;">Admin Panel</div>
            <button class="icon-btn" onclick="logout()" title="Exit Admin Mode" style="font-size:15px">⏻</button>
        </div>
        <div id="admin-user-list"><div class="empty-state">Loading users...</div></div>
    </div>`;

    try {
        const [allUsers, allDebts] = await Promise.all([
            sb('profiles?select=*&order=username.asc'),
            sb('debts?select=*')
        ]);

        const userNetPositions = {};
        allUsers.forEach(u => {
            userNetPositions[u.id] = { owedTo: 0, owes: 0, profile: u };
        });

        allDebts.forEach(debt => {
            const creditorId = debt.net_creditor;
            const amount = Number(debt.net_amount);
            const debtorId = debt.user_a === creditorId ? debt.user_b : debt.user_a;

            if (userNetPositions[creditorId]) {
                userNetPositions[creditorId].owedTo += amount;
            }
            if (userNetPositions[debtorId]) {
                userNetPositions[debtorId].owes += amount;
            }
        });

        const listEl = document.getElementById('admin-user-list');
        if (!allUsers.length) {
            listEl.innerHTML = '<div class="empty-state">No users found.</div>';
            return;
        }
        
        listEl.innerHTML = allUsers.map(user => {
            const pos = userNetPositions[user.id];
            const net = (pos.owedTo - pos.owes);
            const netColor = net >= 0 ? '#00e5a0' : '#ff8080';
            const netPrefix = net >= 0 ? '+' : '−';

            return `
            <div class="debt-item" style="align-items: center;">
                ${avatarHTML(user.full_name || user.username, user.photo_url, 44)}
                <div class="debt-info">
                    <div class="debt-name">${esc(user.username)}</div>
                    <div class="debt-meta">${esc(user.phone || 'No phone')}</div>
                </div>
                <div class="debt-right">
                    <div class="debt-val" style="color:${netColor}">${netPrefix}${riel(Math.abs(net))}</div>
                    <div class="debt-meta">Net Position</div>
                </div>
                <button class="icon-btn" onclick="deleteUser('${user.id}', '${esc(user.username)}')" style="background: #2e0f0f; border-color: #6e2020; color: #ff8080; margin-left: 10px;" title="Delete User">🗑</button>
            </div>`;
        }).join('');

    } catch (e) {
        document.getElementById('admin-user-list').innerHTML = `<div class="empty-state" style="color:red">Error loading admin data: ${e.message}</div>`;
        console.error(e);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to permanently delete user "${username}"? This action cannot be undone.`)) return;
    
    try {
        toast('Deleting user...', 'i');
        // Note: This only deletes the user's profile data.
        // A complete deletion would require removing the user from Supabase's auth system,
        // which needs elevated permissions (service_role key) typically handled on a secure backend.
        await sb(`profiles?id=eq.${userId}`, { method: 'DELETE' });
        
        toast(`User "${username}" has been deleted.`, 's');
        renderAdminScreen(); // Refresh the list
    } catch (e) {
        toast(`Failed to delete user: ${e.message}`, 'e');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// QR DRAW
// ═══════════════════════════════════════════════════════════════════════════
function drawQR(containerId, value, size) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`QR container #${containerId} not found.`);
        return;
    }
    
    container.innerHTML = ''; // Clear previous content

    if (!value) {
        console.warn(`No value provided for QR code in #${containerId}.`);
        container.innerHTML = '<div style="font-size:12px; color:#7d8590; text-align:center; padding: 20px 10px; line-height: 1.4;">Your QR Code cannot be displayed because your account has no username.</div>';
        return;
    }

    // Using a reliable external API to generate the QR code as a PNG image.
    // This can improve scannability and offloads generation from the client.
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(value)}&size=${size}x${size}&color=00e5a0&bgcolor=0d1117&qzone=1`;
    
    const img = document.createElement('img');
    img.src = qrApiUrl;
    img.width = size;
    img.height = size;
    img.alt = `QR Code for ${value}`;
    img.style.display = 'block'; // Ensure it behaves as a block element
    img.onerror = () => {
        console.error('QR API Error: Failed to load QR code image.');
        container.innerHTML = '<div style="font-size:12px; color:#ff8080; text-align:center; padding: 20px 10px;">Could not generate QR code. Check internet connection.</div>';
    };
    
    container.appendChild(img);
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (pendingTx.length > 0) { badge.textContent = pendingTx.length; badge.style.display='flex'; }
  else badge.style.display='none';
}

async function openNotif() {
  const btn = document.getElementById('notif-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  toast('Loading notifications...', 'i');

  try {
    await loadData(); // This refreshes pendingTx
    const list = document.getElementById('notif-list');
    if (!pendingTx.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">✅</div><div class="empty-sub">No pending notifications</div></div>';
    } else {
      list.innerHTML = pendingTx.map(tx => {
        const isPay = tx.type === 'pay';
        const label = isPay ? 'PAYMENT' : 'DEBT';
        const cls = isPay ? 'notif-pay' : 'notif-req';
        const who = tx.from_name || 'Someone';
        const desc = isPay ? `${who} wants to pay you` : `${who} recorded a debt to you`;
        return `<div class="notif-item">
          <div class="notif-top"><span class="notif-type ${cls}">${label}</span><span style="font-size:13px;color:#7d8590">${new Date(tx.created_at).toLocaleDateString()}</span></div>
          <div class="notif-who">${desc}</div>
          <div class="notif-amount">${riel(tx.amount)}</div>
          ${tx.note ? `<div class="notif-note">"${esc(tx.note)}"</div>` : ''}
          <div class="notif-actions">
            <button class="notif-accept" onclick="resolveTransaction('${tx.id}','accepted')">Accept</button>
            <button class="notif-decline" onclick="resolveTransaction('${tx.id}','declined')">Decline</button>
          </div>
        </div>`;
      }).join('');
    }
    openOverlay('notif-overlay');
  } catch (e) {
    toast(e.message || 'Could not refresh notifications.', 'e');
  } finally {
    btn.disabled = false;
  }
}

async function resolveTransaction(txId, status) {
  try {
    const tx = allTx.find(t=>t.id===txId);
    if (!tx) return;
    await sb(`transactions?id=eq.${txId}`, {
      method:'PATCH',
      body:JSON.stringify({status, resolved_at:new Date().toISOString()})
    });
    if (status==='accepted') {
      const isPay = tx.type === 'pay';
      // For a 'pay' tx, the initiator (from_id) is the payer.
      // For an 'Owe' (request) tx, the initiator is borrowing, so the other party (to_id) is the payer.
      const payer = isPay ? tx.from_id : tx.to_id;
      const payee = isPay ? tx.to_id : tx.from_id;
      await sbRpc('apply_payment', {
        payer_id: payer,
        payee_id: payee,
        amt: tx.amount
      });
      toast('Transaction accepted! Ledger updated ✅');
    } else {
      toast('Transaction declined');
    }
    closeOverlay('notif-overlay');
    await loadData();
  } catch(e) {
    toast(e.message||'Failed to resolve transaction','e');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAY FLOW
// ═══════════════════════════════════════════════════════════════════════════
function openPay() {
  loadData();
  resetPayFound();
  openOverlay('pay-overlay');
  setPayTab('scan');
}

function setPayTab(tab) {
  payTab = tab;
  ['scan','type','upload'].forEach(t => {
    document.getElementById('tab-'+t).classList.toggle('active', t===tab);
    document.getElementById('pay-'+t).style.display = t===tab ? 'block' : 'none';
  });
  document.getElementById('pay-found').style.display = 'none';
  if (tab !== 'scan' && camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  if (tab === 'scan') {
    startCamera();
  }
}

function scanQR() {
  const video = document.getElementById('cam-video');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement('canvas');
    const camView = document.getElementById('cam-view');
    canvas.width = camView.clientWidth;
    canvas.height = camView.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      // Visual feedback on successful scan
      const camFrame = document.querySelector('.cam-frame');
      if (camFrame) {
        camFrame.classList.add('detected');
        setTimeout(() => camFrame.classList.remove('detected'), 400);
      }

      if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
      resolvePayUsername(code.data.trim());
      return;
    }
  }
  if (camStream) { requestAnimationFrame(scanQR); }
}

async function startCamera() {
  if (camStream) return;
  
  try {
    // Proactively check permission status if the browser supports it.
    // This provides a better user experience for denied permissions.
    if (navigator.permissions && navigator.permissions.query) {
      const permissionStatus = await navigator.permissions.query({ name: 'camera' });
      if (permissionStatus.state === 'denied') {
        toast('Camera access is blocked. Please allow it in your browser settings.', 'e');
        setPayTab('type'); // Switch to a non-camera tab
        return;
      }
    }

    camStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    const vid = document.getElementById('cam-video');
    vid.srcObject = camStream;
    vid.onloadedmetadata = () => {
      vid.play();
      document.getElementById('cam-view').style.display = 'block';
      document.getElementById('cam-start-btn').style.display = 'none';
      if ('BarcodeDetector' in window) {
        console.log('Using native BarcodeDetector API.');
        barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        requestAnimationFrame(scanWithBarcodeDetector);
      } else {
        console.log('BarcodeDetector not supported, falling back to jsQR.');
        requestAnimationFrame(scanQR);
      }
    };
  } catch(e) {
    console.error("Camera Error:", e.name, e.message);
    let msg = 'Could not start camera. Please use Type or Upload instead.';
    if (e.name === 'NotAllowedError') {
        msg = 'Camera permission denied. You can change this in your browser settings.';
    } else if (e.name === 'NotFoundError') {
        msg = 'No camera found on this device.';
    }
    toast(msg, 'e');
    setPayTab('type');
  }
}

async function lookupPayUsername() {
  const username = document.getElementById('type-token-input').value.trim();
  if (!username) return;
  document.getElementById('pay-results').innerHTML = ''; // Clear suggestions
  await resolvePayUsername(username);
}

async function resolvePayUsername(usernameOrUrl) {
  let username = usernameOrUrl.trim();
  try {
    const url = new URL(username);
    if (url.searchParams.has('user')) {
      username = url.searchParams.get('user').trim();
    }
  } catch (e) {
    // Not a URL, assume it's a username. `username` is already correct.
  }

  if (!username) {
    toast('Cannot search for an empty username.', 'e');
    return;
  }

  try {
    const rows = await sb(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
    if (!rows?.length) { 
      toast(`User "${esc(username)}" not found.`, 'e'); 
      return; 
    }
    foundPayProfile = rows[0];
    document.getElementById('pay-found-card').innerHTML = `
      ${avatarHTML(foundPayProfile.full_name || foundPayProfile.username, foundPayProfile.photo_url, 48)}
      <div style="flex:1">
        <div style="font-weight:700;font-size:17px">${esc(foundPayProfile.username)}</div>
        <div style="font-size:13px;color:#7d8590">${esc(foundPayProfile.phone||'')}</div>
      </div>
      <div class="found-online"></div>`;
    document.getElementById('pay-confirm-btn').textContent = `Send to ${foundPayProfile.username}`;
    ['pay-scan','pay-type','pay-upload'].forEach(id => document.getElementById(id).style.display='none');
    document.getElementById('pay-found').style.display = 'block';
  } catch(e) { toast(e.message||'Lookup failed','e'); }
}

async function handleQRUpload(e) {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, img.width, img.height);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        resolvePayUsername(code.data.trim());
      } else {
        toast('No QR code found in image', 'e');
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(f);
}

function resetPayFound() {
  foundPayProfile = null;
  document.getElementById('pay-found').style.display = 'none';
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-note').value = '';

  // Restore visibility of tab UI for the normal flow
  document.querySelector('#pay-overlay .tab-row').style.display = 'flex';
  document.querySelector('#pay-overlay .sheet-sub').style.display = 'block';

  setPayTab('scan');
  if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  barcodeDetector = null;
}

async function submitPay() {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const note = document.getElementById('pay-note').value.trim();
  if (!amount || isNaN(amount) || amount <= 0) return toast('Enter a valid amount', 'e');
  if (!foundPayProfile) return;

  pendingTxAction = {
    type: 'pay',
    details: {
      to_id: foundPayProfile.id,
      to_name: foundPayProfile.full_name || foundPayProfile.username,
      amount,
      note
    }
  };

  promptForPin({
    action: 'executeTransaction',
    titleKey: 'pin_tx_title',
    subtitleKey: 'pin_tx_sub'
  });
}

async function searchPayUsers(q) {
  clearTimeout(searchTimer);
  const res = document.getElementById('pay-results');
  if (!q || q.length < 2) { res.innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const byPhone = await sb(`profiles?phone=ilike.*${encodeURIComponent(q)}*&limit=3`).catch(() => []);
      const byUser = await sb(`profiles?username=ilike.*${encodeURIComponent(q)}*&limit=3`).catch(() => []);
      const merged = [...(byPhone || []), ...(byUser || [])];
      const unique = merged.filter((p, i, a) => p.id !== ME.id && a.findIndex(x => x.id === p.id) === i).slice(0, 4);
      if (!unique.length) { res.innerHTML = '<div style="color:#7d8590;font-size:14px;padding:8px 0">No users found</div>'; return; }
      res.innerHTML = unique.map(p => `
        <div class="search-result" onclick="selectPayUser('${esc(p.username)}')">
          ${avatarHTML(p.full_name || p.username, p.photo_url || null, 40)}
          <div>
            <div style="font-weight:600;font-size:15px">${esc(p.username)}</div>
            <div style="font-size:12px;color:#7d8590">${esc(p.phone || '')}</div>
          </div>
        </div>`).join('');
    } catch { }
  }, 350);
}

function selectPayUser(username) {
  document.getElementById('type-token-input').value = username;
  lookupPayUsername();
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST FLOW (now "Owe")
// ═══════════════════════════════════════════════════════════════════════════
function openRequest() {
  loadData();
  resetReqStep();
  openOverlay('req-overlay');
}

async function searchUsers(q) {
  clearTimeout(searchTimer);
  const res = document.getElementById('req-results');
  if (!q||q.length<2) { res.innerHTML=''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const byPhone = await sb(`profiles?phone=ilike.*${encodeURIComponent(q)}*&limit=5`).catch(()=>[]);
      const byUser  = await sb(`profiles?username=ilike.*${encodeURIComponent(q)}*&limit=5`).catch(()=>[]);
      const merged = [...(byPhone||[]),...(byUser||[])];
      const unique = merged.filter((p,i,a)=>p.id!==ME.id&&a.findIndex(x=>x.id===p.id)===i).slice(0,5);
      if (!unique.length) { res.innerHTML='<div style="color:#7d8590;font-size:14px;padding:8px 0">No users found</div>'; return; }
      res.innerHTML = unique.map(p=>`
        <div class="search-result" onclick="selectReqUser('${p.id}','${esc(p.username)}','${esc(p.full_name || p.username)}','${esc(p.phone||'')}','${esc(p.photo_url||'')}')">
          ${avatarHTML(p.full_name || p.username, p.photo_url||null, 40)}
          <div>
            <div style="font-weight:600;font-size:15px">${esc(p.username)}</div>
            <div style="font-size:12px;color:#7d8590">${esc(p.phone||'')}</div>
          </div>
        </div>`).join('');
    } catch {}
  }, 350);
}

function selectReqUser(id, username, fullname, phone, photo) {
  foundReqProfile = { id, username, full_name: fullname, phone, photo_url:photo||null };
  document.getElementById('req-found-card').innerHTML = `
    ${avatarHTML(fullname,photo||null,48)}
    <div style="flex:1">
      <div style="font-weight:700;font-size:17px">${esc(username)}</div>
      <div style="font-size:13px;color:#7d8590">${esc(phone)}</div>
    </div>`;
  document.getElementById('req-search-step').style.display='none';
  document.getElementById('req-amount-step').style.display='block';
}

function resetReqStep() {
  foundReqProfile=null;
  document.getElementById('req-search').value='';
  document.getElementById('req-results').innerHTML='';
  document.getElementById('req-search-step').style.display='block';
  document.getElementById('req-amount-step').style.display='none';
  document.getElementById('req-amount').value='';
  document.getElementById('req-note').value='';
}

async function submitRequest() {
  const amount = parseFloat(document.getElementById('req-amount').value);
  const note = document.getElementById('req-note').value.trim();
  if (!amount || isNaN(amount) || amount <= 0) return toast('Enter a valid amount', 'e');
  if (!foundReqProfile) return;

  pendingTxAction = {
    type: 'request',
    details: {
      to_id: foundReqProfile.id,
      to_name: foundReqProfile.full_name || foundReqProfile.username,
      amount,
      note
    }
  };

  promptForPin({
    action: 'executeTransaction',
    titleKey: 'pin_tx_title',
    subtitleKey: 'pin_tx_sub'
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// REALTIME NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
function setupRealtime() {
  if (!ME || sbClient) return;

  const { createClient } = supabase;
  sbClient = createClient(SB_URL, SB_KEY);

  console.log('Setting up realtime subscriptions...');

  // A single channel for all database changes related to this user
  const channel = sbClient.channel(`user-channel-${ME.id}`);

  channel
    // 1. Listen for new incoming transactions for toast/pop-up notifications
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `to_id=eq.${ME.id}` }, (payload) => {
        console.log('Realtime: new incoming transaction', payload.new);
        const type = payload.new.type === 'pay' ? 'payment' : 'debt record';
        playNotificationSound();
        toast(`New ${type} from ${payload.new.from_name}!`, 'i');
        loadData(); // Reload data to get the new transaction
    })
    // 2. Listen for updates to transactions you sent (e.g., accepted/declined)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: `from_id=eq.${ME.id}` }, (payload) => {
        if (payload.old.status === 'pending' && payload.new.status !== 'pending') {
            const toName = payload.new.to_name || 'Someone';
            toast(`${toName} ${payload.new.status} your request.`, 'i');
            // This is the "trick": reload all data to reflect the change instantly.
            loadData();
        }
    })
    // 3. Listen for ANY change to the debts ledger to keep balances live
    .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `or=(user_a.eq.${ME.id},user_b.eq.${ME.id})` }, () => {
        console.log('Realtime: debt ledger changed, reloading data.');
        loadData();
    })
    .subscribe();

  realtimeChannel = channel;

  presenceChannel = sbClient.channel('wll-online-users', { config: { presence: { key: ME.username } } });
  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const count = Object.keys(presenceChannel.presenceState()).length;
      updateOnlineCount(count);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });
}

function teardownRealtime() {
  if (sbClient) {
    console.log('Tearing down realtime subscriptions...');
    sbClient.removeAllChannels();
    realtimeChannel = null;
    presenceChannel = null;
    sbClient = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAY + SCREEN NAV
// ═══════════════════════════════════════════════════════════════════════════
function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  if (id==='pay-overlay' && camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  if (id==='pay-overlay') { barcodeDetector = null; }
  // Refresh data when closing major action overlays to reflect any changes.
  if (['pay-overlay', 'req-overlay', 'qr-overlay', 'notif-overlay'].includes(id)) {
    loadData();
  }
}
function openQR() {
  loadData();
  openOverlay('qr-overlay');
  setTimeout(() => {
    if (!ME || !ME.username) return;
    document.getElementById('qr-token-val').textContent = '@' + ME.username;
    
    // Create a full URL to embed in the QR code.
    // This allows scanning from outside the app.
    const siteUrl = 'https://rasin2006.github.io/wll/';
    const qrValue = `${siteUrl}?user=${ME.username}`;
    
    drawQR('qr-canvas-ov', qrValue, 180);
  }, 50);
}

const navScreens = ['home','history','profile-screen'];

function gotoScreen(id) {
  const currentScreenEl = document.querySelector('.screen.active');
  if (currentScreenEl) {
    const fromId = currentScreenEl.id;
    if (fromId === 'home' && id !== 'home') {
      toggleDebtVisibility(false);
    }
    if (fromId === 'history' && id !== 'history') {
      toggleHistoryVisibility(false);
    }
  }

  // Hide all major screens first
  document.querySelectorAll('.screen').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });

  const el=document.getElementById(id);
  if(el){el.style.display='block';el.classList.add('active');}

  // Show navbar only for nav screens
  document.getElementById('navbar').style.display = navScreens.includes(id) ? 'flex' : 'none';

  // Remember the last visited main screen
  if (navScreens.includes(id)) {
    localStorage.setItem('tabify_last_screen', id);
  }

  // Handle nav bar items
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const nb=document.getElementById('nav-'+id);
  if(nb) nb.classList.add('active');
  window.scrollTo(0,0);
  // Refresh data when navigating to a main screen
  if (navScreens.includes(id)) {
    loadData();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
buildNumpad();
buildPromptNumpad();

(function boot() {
  const urlParams = new URLSearchParams(window.location.search);
  const userFromUrl = urlParams.get('user');

  const savedLang = localStorage.getItem('tabify_lang');
  if (savedLang) {
    currentLang = savedLang;
  }
  document.documentElement.lang = currentLang;

  const saved = localStorage.getItem('tabify_session');
  if (saved) {
    try {
      const { profile } = JSON.parse(saved);
      ME = profile;
      document.getElementById('splash').style.display='none';
      showAuth(false);
      setLanguage(currentLang);

      if (userFromUrl && userFromUrl !== ME.username) {
        // If logged in and a user is in the URL, go to pay flow for that user.
        gotoScreen('home');
        setTimeout(() => {
          // Manually open the pay overlay and bypass the tab selection UI
          openOverlay('pay-overlay');
          document.querySelector('#pay-overlay .tab-row').style.display = 'none';
          document.querySelector('#pay-overlay .sheet-sub').style.display = 'none';
          ['scan', 'type', 'upload'].forEach(t => {
            document.getElementById('pay-' + t).style.display = 'none';
          });
          resolvePayUsername(userFromUrl);
        }, 300);
      } else {
        const lastScreen = localStorage.getItem('tabify_last_screen');
        gotoScreen(navScreens.includes(lastScreen) ? lastScreen : 'home');
      }

      setupRealtime();
      return;
    } catch {}
  }

  setTimeout(()=>{
    document.getElementById('splash').style.display='none';
    showAuth(true);
    document.getElementById('auth').style.display='block';
    setLanguage(currentLang);
    if (userFromUrl) {
      // If not logged in, pre-fill the username field on the sign-in screen
      document.getElementById('id-input').value = userFromUrl;
    }
  }, 1600);
})();
