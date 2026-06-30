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
let demoUserPhotoBase64 = null;
let newProfilePhotoBase64 = null;
let payTab = 'scan';
let foundPayProfile = null;
let reqTab = 'type';
let foundReqProfile = null;
let camStream = null;
let mergeTargetDemoUser = null;
let mergeTargetRealUser = null;
let searchTimer = null;
let barcodeDetector = null;
let sbClient = null;
let realtimeChannel = null;
let presenceChannel = null;

let promptPinVal = '';
let usernameCheckTimer = null;
let pendingPinAction = null;
let pinCreationStep = 0; // 0: inactive, 1: creating, 2: confirming
let firstPinAttempt = '';
let debtsRevealed = false;
let isProfileEditing = false;
let isContactsEditing = false;
let historyRevealed = false;
let pendingTxAction = null;
let adminTargetUserId = null;
let adminTargetUsername = null;
let adminTargetUser = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
let appIsLocked = false;

const ADMIN_CODE = '*2006*';
const MAX_RECENT_LOGINS = 5;
let currentLang = 'en';
const NOTIFICATION_SOUND = document.getElementById('notification-sound');

// ═══════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════
async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: {
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
  // Format numbers with a space as a thousand separator instead of a comma.
  const numStr = String(Number(n || 0).toFixed(0)); // Using toFixed(0) to round to nearest integer for display
  const formattedNum = numStr.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return currentLang === 'km' ? `${formattedNum} រៀល` : `${formattedNum} KHR`;
}

const DAILY_INTEREST_RATE = 0.01;

function getDebtBalanceWithInterest(debt, asOfDate = new Date()) {
  const baseAmount = Number(debt?.net_amount || 0);
  const creditorId = debt?.net_creditor || null;
  const lastUpdated = debt?.updated_at ? new Date(debt.updated_at) : (debt?.created_at ? new Date(debt.created_at) : new Date());
  const msSinceUpdate = asOfDate - lastUpdated;
  const daysElapsed = Math.max(0, Math.floor(msSinceUpdate / 86400000));
  // Interest always follows the current creditor on the debt row.
  // If the balance direction flips, the new creditor starts receiving interest from that update onward.
  const accruedInterest = baseAmount * DAILY_INTEREST_RATE * daysElapsed;
  return {
    baseAmount,
    accruedInterest,
    daysElapsed,
    creditorId,
    totalAmount: Number((baseAmount + accruedInterest).toFixed(2))
  };
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
    photo_optional: 'Optional profile photo',
    photo_upload_label: 'Photo',
    fullname_placeholder: 'e.g. Alex King',
    username_placeholder: 'e.g. alex_king',
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
    my_qr: 'My QR',
    nav_home: 'Home',
    nav_history: 'History',
    nav_notifications: 'Notifications',
    online_users: 'online',
    nav_profile: 'Profile',
    nav_manage: 'Manage',
    notifications: 'Notifications',
    notifications_none: 'No notifications',
    you_owe_section: 'You owe',
    they_owe_you: 'They owe you',
    edit_profile: 'Edit profile',
    tap_to_refresh: 'Tap to refresh',
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
    add_demo_contact: 'Add Demo Contact',
    add_demo_contact_sub: 'Create a placeholder contact to track debts with someone not yet on WLL.',
    demo_contact_fullname_label: 'Full Name',
    demo_contact_username_label: 'Username (auto-generated)',
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
    pin_save_changes_title: 'Save Changes',
    pin_save_changes_sub: 'Enter your PIN to save your changes.',
    pin_history_title: 'Enter PIN to View History',
    pin_history_sub: 'For your privacy, enter your PIN to view transaction history.',
    history_protected: 'History Protected',
    history_protected_sub: 'Your transaction history is hidden for privacy.',
    reveal_history: 'Reveal History',
    hide_history: 'Hide History',
    forgot_pin: 'Forgot PIN?',
    forgot_pin_title: 'Forgot Your PIN?',
    forgot_pin_sub: 'To reset your PIN, please contact the WLL administrator for assistance. They will help you regain access to your account securely.',
    got_it: 'Got it',
    // Transaction/Notification text
    tx_empty_sub: 'No transactions with this person yet.',
    all_transactions_between_you: 'All transactions between you',
    history_with_user: 'History with {who}',
    // Merge
    merge_demo_contact: 'Merge Demo Contact',
    merge_demo_contact_sub: 'Find the real user account to merge "{who}" into.',
    search_for_real_user: 'Search for Real User',
    search_placeholder: 'Username, name, or phone...',
    request_merge: 'Request Merge',
    search_again: '← Search Again',
    // Admin
    admin_panel: 'Admin Panel',
    exit_admin_mode: 'Exit Admin Mode',
    loading_users: 'Loading users...',
    edit_user: 'Edit User',
    reset_pin: 'Reset PIN',
    delete_user: 'Delete User',
    demo_account: 'Demo Account',
    no_phone: 'No phone',
    net_position_admin: 'Net Position',
    tx_sent_pay: 'Paid {who}',
    tx_recv_pay: 'Payment from {who}',
    tx_sent_request: 'You owe {who}',
    tx_recv_request: '{who} requested to borrow',
    notif_pay_desc: '{who} wants to pay you',
    notif_nudge: '{who} nudged you!',
    notif_request_desc: '{who} requests to borrow from you',
    '2d': '2D',
    accept: 'Accept',
    decline: 'Decline',
    scan: 'Scan',
    type: 'Type',
    accept_merge: 'Accept merge',
    admin_mode_unlocked: 'Admin mode unlocked',
    admin_pin_reset_sub_text: 'Enter a new PIN for this user',
    borrow_request_sent: 'Borrow request sent',
    button: 'Button',
    canvas: 'Canvas',
    confirm_delete_user: 'Confirm Delete User',
    deleting_user_toast: 'Deleting User toast',
    demo_contact_created_offline_toast: 'Demo Contact Created Offline toast',
    demo_contact_created_toast: 'Demo Contact Created toast',
    edit_user_title: 'Edit User',
    error_contact_not_found: 'Error: Contact not found',
    error_delete_user_failed: 'Error: Delete user failed',
    error_empty_qr: 'Error: Empty qr',
    error_enter_id: 'Error: Enter id',
    error_enter_pin: 'Error: Enter pin',
    error_fullname_empty: 'Error: Fullname empty',
    error_fullname_required: 'Error: Fullname required',
    error_generic: 'Error: Generic',
    error_invalid_amount: 'Error: Invalid amount',
    error_invalid_demo_user: 'Error: Invalid demo user',
    error_invalid_phone: 'Error: Invalid phone',
    error_invalid_phone_long: 'Error: Invalid phone long',
    error_invalid_pin: 'Error: Invalid pin',
    error_login_failed: 'Error: Login failed',
    error_merge_request_exists: 'Error: Merge request exists',
    error_merge_request_failed: 'Error: Merge request failed',
    error_no_qr_in_image: 'Error: No qr in image',
    error_no_user_selected: 'Error: No user selected',
    error_phone_in_use: 'Error: Phone in use',
    error_phone_update_failed: 'Error: Phone update failed',
    error_pin_reset_failed: 'Error: Pin reset failed',
    error_profile_update_failed: 'Error: Profile update failed',
    error_signin_again: 'Error: Signin again',
    error_user_not_found: 'Error: User not found',
    error_username_empty: 'Error: Username empty',
    error_username_required: 'Error: Username required',
    error_username_spaces: 'Error: Username spaces',
    error_username_taken: 'Error: Username taken',
    img: 'Img',
    merge_declined_toast: 'Merge Declined toast',
    merge_notif_label: 'Merge Notif Label',
    merge_notif_note: 'Merge Notif Note',
    merge_notif_who: 'Merge Notif Who',
    merge_request_sent_toast: 'Merge Request Sent toast',
    merge_success_toast: 'Merge Success toast',
    no_real_users_found: 'No Real Users Found',
    no_users_found: 'No Users Found',
    nudge: 'Nudge',
    owes_you: 'Owes you',
    owes_you_user: '{who} owes you',
    pay_request_sent: 'Payment request sent',
    phone_updated_toast: 'Phone Updated toast',
    pin_confirm_sub: 'Pin Confirm',
    pin_confirm_title: 'Pin Confirm',
    pin_correct: 'Pin Correct',
    pin_create_sub: 'Pin Create',
    pin_create_title: 'Pin Create',
    pin_incorrect: 'Pin Incorrect',
    pin_reset_success_toast: 'Pin Reset Success toast',
    please_wait: 'Please Wait',
    profile_updated_toast: 'Profile Updated toast',
    real_user_account: 'Real User Account',
    refresh_failed_toast: 'Refresh Failed toast',
    refreshed_toast: 'Refreshed toast',
    refreshing: 'Refreshing',
    request_status_updated: 'Request Status Updated',
    requesting: 'Requesting',
    reset_pin_for_user: 'Reset PIN for user',
    resetting_pin_toast: 'Resetting Pin toast',
    sending: 'Sending',
    someone: 'Someone',
    tx_accepted_toast: 'Tx Accepted toast',
    tx_declined_toast: 'Tx Declined toast',
    tx_status_changed_accepted: '{who} accepted your request',
    tx_status_changed_declined: '{who} declined your request',
    tx_failed: 'Tx Failed',
    updating_phone_toast: 'Updating Phone toast',
    user: 'User',
    user_deleted_toast: 'User Deleted toast',
    welcome_back_toast: 'Welcome Back toast',
    welcome_toast: 'Welcome toast',
    you_owe_meta: 'You Owe Meta',
    upload: 'Upload',
    pay_someone: 'Pay someone',
    open_camera: 'Open camera',
    recipient_username: "Recipient's Username",
    find: 'Find',
    upload_qr_prompt: 'Tap to upload a QR image',
    amount_khr: 'Amount (KHR)',
    note_optional_placeholder: 'Note (optional)',
    send_payment_request: 'Send payment request',
    back: '← Back',
    borrow_money: 'Borrow money',
    lender_name_label: "Lender's Name or Username",
    note_borrow_placeholder: "What's this for?",
    record_debt: 'Record Debt',
    back_search: '← Search again',
    change: 'Change',
    you_owe_user: 'You owe {who}',
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
    photo_optional: 'រូបថត (ស្រេចចិត្ត)',
    photo_upload_label: 'រូបថត',
    fullname_placeholder: 'ឧ. ស្តេច អាឡិច',
    username_placeholder: 'ឧ. alex_king',
    full_name: 'ឈ្មោះ​ពេញ',
    full_name_hint: 'ឈ្មោះពិតរបស់អ្នកសម្រាប់បង្ហាញ។',
    username_hint: 'ID សម្រាប់បង់ប្រាក់ (គ្មានដកឃ្លា)។',
    // Home
    good_day: 'សួស្តី,',
    owed_to_you: 'ជំពាក់អ្នក',
    you_owe: 'អ្នកជំពាក់',
    pay: 'បង់',
    borrow: 'ខ្ចី',
    my_qr: 'QR របស់ខ្ញុំ',
    nav_home: 'ទំព័រដើម',
    nav_history: 'ប្រវត្តិ',
    nav_notifications: 'ការជូនដំណឹង',
    online_users: 'កំពុងប្រើ',
    nav_profile: 'គណនី',
    nav_manage: 'គ្រប់គ្រង',
    notifications: 'ការជូនដំណឹង',
    notifications_none: 'គ្មានការជូនដំណឹង',
    you_owe_section: 'អ្នកជំពាក់',
    they_owe_you: 'ជំពាក់អ្នក',
    net_position: 'សមតុល្យសរុប',
    tap_to_refresh: 'ចុចដើម្បីផ្ទុកឡើងវិញ',
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
    add_demo_contact: 'បន្ថែមគណនីសាកល្បង',
    add_demo_contact_sub: 'បង្កើតគណនីសម្រាប់កត់ត្រាការជំពាក់ជាមួយអ្នកដែលមិនទាន់មានគណនី WLL។',
    demo_contact_fullname_label: 'ឈ្មោះ​ពេញ',
    demo_contact_username_label: 'ឈ្មោះអ្នកប្រើប្រាស់ (បង្កើតដោយស្វ័យប្រវត្តិ)',
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
    pin_save_changes_title: 'រក្សាទុកការផ្លាស់ប្តូរ',
    pin_save_changes_sub: 'បញ្ចូល PIN របស់អ្នកដើម្បីរក្សាទុកការផ្លាស់ប្តូរ។',
    pin_history_title: 'បញ្ចូល PIN ដើម្បីមើលប្រវត្តិ',
    pin_history_sub: 'ដើម្បីសុវត្ថិភាពឯកជនភាពរបស់អ្នក សូមបញ្ចូល PIN ដើម្បីមើលប្រវត្តិប្រតិបត្តិការ។',
    history_protected: 'ប្រវត្តិត្រូវបានការពារ',
    history_protected_sub: 'ប្រវត្តិប្រតិបត្តិការរបស់អ្នកត្រូវបានលាក់ដើម្បីឯកជនភាព។',
    reveal_history: 'បង្ហាញប្រវត្តិ',
    hide_history: 'លាក់ប្រវត្តិ',
    forgot_pin: 'ភ្លេច PIN?',
    forgot_pin_title: 'ភ្លេច PIN របស់អ្នក?',
    forgot_pin_sub: 'ដើម្បីកំណត់ PIN របស់អ្នកឡើងវិញ សូមទាក់ទងអ្នកគ្រប់គ្រង WLL ដើម្បីទទួលបានជំនួយ។ ពួកគេនឹងជួយអ្នកឱ្យចូលប្រើគណនីរបស់អ្នកវិញដោយសុវត្ថិភាព។',
    got_it: 'យល់ព្រម',
    // Transaction/Notification text
    tx_empty_sub: 'មិនទាន់មានប្រតិបត្តិការជាមួយបុគ្គលនេះទេ។',
    all_transactions_between_you: 'ប្រតិបត្តិការទាំងអស់រវាងអ្នក',
    history_with_user: 'ប្រវត្តិជាមួយ {who}',
    // Merge
    merge_demo_contact: 'បញ្ចូលគណនីសាកល្បង',
    merge_demo_contact_sub: 'ស្វែងរកគណនីពិតដើម្បីបញ្ចូលគណនីសាកល្បង "{who}" ទៅក្នុងនោះ។',
    search_for_real_user: 'ស្វែងរកគណនីពិត',
    search_placeholder: 'ឈ្មោះ​អ្នកប្រើប្រាស់, ឈ្មោះ, ឬលេខទូរស័ព្ទ...',
    request_merge: 'ស្នើសុំបញ្ចូល',
    search_again: '← ស្វែងរកម្តងទៀត',
    // Admin
    admin_panel: 'ផ្ទាំងគ្រប់គ្រង',
    exit_admin_mode: 'ចាកចេញពីផ្ទាំងគ្រប់គ្រង',
    loading_users: 'កំពុងផ្ទុកអ្នកប្រើប្រាស់...',
    edit_user: 'កែប្រែអ្នកប្រើប្រាស់',
    reset_pin: 'កំណត់ PIN ឡើងវិញ',
    delete_user: 'លុបអ្នកប្រើប្រាស់',
    demo_account: 'គណនីសាកល្បង',
    no_phone: 'គ្មានលេខទូរស័ព្ទ',
    net_position_admin: 'សមតុល្យសរុប',
    tx_sent_pay: 'បានបង់ទៅ {who}',
    tx_recv_pay: 'ការទូទាត់ពី {who}',
    tx_sent_request: 'អ្នកជំពាក់ {who}',
    tx_recv_request: '{who} បានស្នើខ្ចី',
    notif_pay_desc: '{who} ចង់បង់ប្រាក់ឱ្យអ្នក',
    notif_nudge: '{who} បានស្កิดអ្នក!',
    notif_request_desc: '{who} ស្នើសុំខ្ចីប្រាក់ពីអ្នក',
    all_transactions_between_you: 'ប្រតិបត្តិការទាំងអស់រវាងអ្នក',
    '2d': '២ឌ',
    accept: 'យល់ព្រម',
    decline: 'បដិសេធ',
    scan: 'ស្កេន',
    type: 'វាយ',
    accept_merge: 'យល់ព្រមបញ្ចូល',
    admin_mode_unlocked: 'ដោះសោផ្ទាំងគ្រប់គ្រង',
    admin_pin_reset_sub_text: 'បញ្ចូល PIN បណ្ដោះអាសន្ន ៤ខ្ទង់សម្រាប់អ្នកប្រើប្រាស់នេះ។',
    borrow_request_sent: 'បានផ្ញើសំណើខ្ចី',
    button: 'ប៊ូតុង',
    canvas: 'ផ្ទាំងគំនូរ',
    confirm_delete_user: 'តើអ្នកប្រាកដទេថាចង់លុបអ្នកប្រើប្រាស់នេះ? សកម្មភាពនេះមិនអាចមិនធ្វើវិញបានទេ។',
    deleting_user_toast: 'កំពុងលុបអ្នកប្រើប្រាស់...',
    demo_contact_created_offline_toast: 'គណនីសាកល្បង "{who}" ត្រូវបានបង្កើតពេលគ្មានអ៊ីនធឺណិត (នឹងធ្វើសមកាលកម្មពេលក្រោយ)។',
    demo_contact_created_toast: 'គណនីសាកល្បង "{who}" ត្រូវបានបង្កើតដោយជោគជ័យ!',
    edit_user_title: 'កែប្រែ {who}',
    error_contact_not_found: 'រកមិនឃើញព័ត៌មានទំនាក់ទំនងទេ។ អ្នកប្រើប្រាស់អាចត្រូវបានលុប។',
    error_delete_user_failed: 'បរាជ័យក្នុងការលុបអ្នកប្រើប្រាស់៖ {error}',
    error_empty_qr: 'មិនអាចដំណើរការ QR code ទទេបានទេ។',
    error_enter_id: 'សូមបញ្ចូលលេខទូរស័ព្ទឬឈ្មោះអ្នកប្រើប្រាស់',
    error_enter_pin: 'សូមបញ្ចូល PIN ៤ខ្ទង់របស់អ្នក។',
    error_fullname_empty: 'ឈ្មោះពេញមិនអាចទទេបានទេ។',
    error_fullname_required: 'ត្រូវតែបញ្ចូលឈ្មោះពេញ',
    error_generic: 'មានបញ្ហាអ្វីមួយកើតឡើង',
    error_invalid_amount: 'សូមបញ្ចូលចំនួនទឹកប្រាក់ដែលត្រឹមត្រូវ',
    error_invalid_demo_user: 'ទិន្នន័យគណនីសាកល្បងមិនត្រឹមត្រូវ។',
    error_invalid_phone: 'សូមបញ្ចូលលេខទូរស័ព្ទកម្ពុជាដែលត្រឹមត្រូវ',
    error_invalid_phone_long: 'សូមបញ្ចូលលេខទូរស័ព្ទកម្ពុជាដែលត្រឹមត្រូវ (ឧ. ០១២៣៤៥៦៧៨ ឬ +៨៥៥១២៣៤៥៦៧៨)',
    error_invalid_pin: 'សូមបញ្ចូល PIN ៤ខ្ទង់ដែលត្រឹមត្រូវ។',
    error_login_failed: 'រកមិនឃើញគណនី ឬ PIN មិនត្រឹមត្រូវ',
    error_merge_request_exists: 'សំណើបញ្ចូលសម្រាប់អ្នកប្រើប្រាស់នេះមានរួចហើយ។',
    error_merge_request_failed: 'បរាជ័យក្នុងការផ្ញើសំណើបញ្ចូល។',
    error_no_qr_in_image: 'រកមិនឃើញ QR code ក្នុងរូបភាព',
    error_no_user_selected: 'គ្មានអ្នកប្រើប្រាស់ត្រូវបានជ្រើសរើស។',
    error_phone_in_use: 'លេខទូរស័ព្ទនេះត្រូវបានប្រើប្រាស់ដោយគណនីផ្សេងទៀតហើយ។',
    error_phone_update_failed: 'បរាជ័យក្នុងការធ្វើបច្ចុប្បន្នភាពលេខទូរស័ព្ទ។',
    error_pin_reset_failed: 'បរាជ័យក្នុងការកំណត់ PIN ឡើងវិញ៖ {error}',
    error_profile_update_failed: 'បរាជ័យក្នុងការធ្វើបច្ចុប្បន្នភាពព័ត៌មានគណនី',
    error_signin_again: 'សូមចូលគណនីម្តងទៀតមុនពេលបង្កើតគណនីសាកល្បង។',
    error_user_not_found: 'រកមិនឃើញអ្នកប្រើប្រាស់ "{who}" ទេ។',
    error_username_empty: 'ឈ្មោះអ្នកប្រើប្រាស់មិនអាចទទេបានទេ។',
    error_username_required: 'ត្រូវតែបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់',
    error_username_spaces: 'ឈ្មោះអ្នកប្រើប្រាស់មិនអាចមានដកឃ្លាបានទេ។',
    error_username_taken: 'ឈ្មោះអ្នកប្រើប្រាស់នេះត្រូវបានគេយកហើយ។',
    img: 'រូបភាព',
    merge_declined_toast: 'សំណើបញ្ចូលត្រូវបានបដិសេធ។',
    merge_notif_label: 'បញ្ចូល',
    merge_notif_note: 'ប្រវត្តិប្រតិបត្តិការទាំងអស់របស់ពួកគេជាមួយគណនីសាកល្បងនេះនឹងត្រូវបានផ្ទេរទៅឱ្យអ្នក។',
    merge_notif_who: '{who} ចង់បញ្ចូលគណនីសាកល្បងរបស់ពួកគេ "{demo_user}" ជាមួយគណនីរបស់អ្នក។',
    merge_request_sent_toast: 'សំណើបញ្ចូលបានផ្ញើទៅ {who}!',
    merge_success_toast: 'ការបញ្ចូលបានជោគជ័យ! ប្រវត្តិរបស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាព។',
    no_real_users_found: 'រកមិនឃើញអ្នកប្រើប្រាស់ពិតប្រាកដទេ។',
    no_users_found: 'រកមិនឃើញអ្នកប្រើប្រាស់ទេ',
    nudge: 'ស្កิด',
    owes_you_user: '{who} ជំពាក់អ្នក',
    pay_request_sent: 'សំណើបង់ប្រាក់បានផ្ញើទៅ {who}។',
    phone_updated_toast: 'លេខទូរស័ព្ទសម្រាប់ {who} ត្រូវបានធ្វើបច្ចុប្បន្នភាព។',
    pin_confirm_sub: 'សូមបញ្ចូល PIN ៤ខ្ទង់របស់អ្នកម្តងទៀត។',
    pin_confirm_title: 'បញ្ជាក់ PIN',
    pin_correct: 'PIN ត្រឹមត្រូវ។',
    pin_create_sub: 'បង្កើត PIN ៤ខ្ទង់សម្រាប់គណនីរបស់អ្នក។',
    pin_create_title: 'បង្កើត PIN',
    pin_incorrect: 'PIN មិនត្រឹមត្រូវ',
    pin_reset_success_toast: 'PIN សម្រាប់ {who} ត្រូវបានកំណត់ទៅ {pin} ឡើងវិញ។',
    please_wait: 'សូម​រង់ចាំ...',
    profile_updated_toast: 'ព័ត៌មានគណនីបានធ្វើបច្ចុប្បន្នភាពដោយជោគជ័យ!',
    real_user_account: 'គណនីពិត',
    refresh_failed_toast: 'ការផ្ទុកឡើងវិញបានបរាជ័យ។',
    refreshed_toast: 'បានផ្ទុកឡើងវិញ!',
    refreshing: 'កំពុងផ្ទុកឡើងវិញ...',
    request_status_updated: '{who} បាន{status}សំណើរបស់អ្នក។',
    requesting: 'កំពុងស្នើសុំ...',
    reset_pin_for_user: 'កំណត់ PIN ឡើងវិញសម្រាប់ {who}',
    resetting_pin_toast: 'កំពុងកំណត់ PIN ឡើងវិញ...',
    sending: 'កំពុងផ្ញើ...',
    someone: 'នរណាម្នាក់',
    tx_accepted_toast: 'ប្រតិបត្តិការបានយល់ព្រម! បញ្ជីជំពាក់បានធ្វើបច្ចុប្បន្នភាព ✅',
    tx_declined_toast: 'ប្រតិបត្តិការត្រូវបានបដិសេធ',
    tx_status_changed_accepted: '{who} បានទទួលសំណើរបស់អ្នក',
    tx_status_changed_declined: '{who} បានបដិសេធសំណើរបស់អ្នក',
    tx_failed: 'ប្រតិបត្តិការបានបរាជ័យ',
    updating_phone_toast: 'កំពុងធ្វើបច្ចុប្បន្នភាពលេខទូរស័ព្ទ...',
    user: 'អ្នកប្រើប្រាស់',
    user_deleted_toast: 'អ្នកប្រើប្រាស់ "{who}" ត្រូវបានលុប។',
    welcome_back_toast: 'សូមស្វាគមន៍មកវិញ, {who}!',
    welcome_toast: 'សូមស្វាគមន៍មកកាន់ WLL! 🎉',
    you_owe_user: 'អ្នកជំពាក់ {who}',
    upload: 'ផ្ទុកឡើង',
    pay_someone: 'បង់ប្រាក់ឱ្យនរណាម្នាក់',
    open_camera: 'បើកកាមេរ៉ា',
    recipient_username: 'ឈ្មោះអ្នកប្រើប្រាស់របស់អ្នកទទួល',
    find: 'ស្វែងរក',
    upload_qr_prompt: 'ចុចដើម្បីផ្ទុកឡើងរូបភាព QR',
    amount_khr: 'ចំនួនទឹកប្រាក់ (រៀល)',
    note_optional_placeholder: 'កំណត់ចំណាំ (ស្រេចចិត្ត)',
    send_payment_request: 'ផ្ញើសំណើបង់ប្រាក់',
    back: '← ត្រឡប់ក្រោយ',
    borrow_money: 'ខ្ចីប្រាក់',
    lender_name_label: 'ឈ្មោះអ្នកឱ្យខ្ចី ឬឈ្មោះអ្នកប្រើប្រាស់',
    note_borrow_placeholder: 'សម្រាប់អ្វី?',
    record_debt: 'កត់ត្រាបំណុល',
    back_search: '← ស្វែងរកម្តងទៀត',
    change: 'ផ្លាស់ប្តូរ',
  }
};

function t(key) { return i18n[currentLang]?.[key] || key; }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (el.dataset.i18nAttr) {
      el.setAttribute(el.dataset.i18nAttr, t(key));
    } else if (el.matches('input[placeholder]')) { el.placeholder = t(key); }
    else { el.innerHTML = t(key); }
  });
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getLocalDemoUsers() {
  try {
    return JSON.parse(localStorage.getItem('tabify_demo_users') || '[]');
  } catch {
    return [];
  }
}

function saveLocalDemoUsers(users) {
  localStorage.setItem('tabify_demo_users', JSON.stringify(users));
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
  if (!NOTIFICATION_SOUND) return;
  const sound = NOTIFICATION_SOUND.cloneNode();
  sound.play().catch(e => {
    console.warn("Notification sound was blocked by the browser.", e);
  });
}

async function getAllUniqueContacts() {
    const debtContacts = allDebts.map(d => {
        return d.user_a === ME.id ? d.user_b_profile : d.user_a_profile;
    }).filter(p => p); // Filter out null profiles (e.g., from deleted users)

    const debtContactIds = new Set(debtContacts.map(c => c.id));

    let remoteDemoUsers = [];
    try {
        remoteDemoUsers = await sb(`profiles?is_demo=eq.true&created_by=eq.${ME.id}`) || [];
    } catch (e) {
        console.warn('Could not load remote demo users:', e);
    }

    const localDemoUsers = getLocalDemoUsers().filter(u => u.created_by === ME.id && !debtContactIds.has(u.id));
    const mergedDemoUsers = [...remoteDemoUsers, ...localDemoUsers].filter((u, i, a) => u && a.findIndex(x => x.id === u.id) === i);
    const myDemoUsersWithoutDebts = mergedDemoUsers.filter(u => !debtContactIds.has(u.id));

    const allContacts = [...debtContacts, ...myDemoUsersWithoutDebts];
    return allContacts.filter((p, i, a) => p && a.findIndex(x => x && x.id === p.id) === i);
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
    toast(t('admin_mode_unlocked'), 'i');
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
  if (pinCreationStep > 0) {
    // Handle PIN creation/confirmation flow
    if (pinCreationStep === 1) {
      firstPinAttempt = promptPinVal;
      pinCreationStep = 2;
      promptForPin({ action: 'createPin' }); // Re-open prompt for confirmation
    } else if (pinCreationStep === 2) {
      if (firstPinAttempt === promptPinVal) {
        // PINs match, flash green and proceed
        document.getElementById('prompt-pin-display').classList.add('success');
        executePendingPinAction(); // PINs match, proceed with account creation
      } else {
        toast('PINs do not match. Please try again.', 'e');
        const display = document.getElementById('prompt-pin-display');
        display.classList.add('shake', 'error');
        setTimeout(() => {
            display.classList.remove('shake', 'error');
            pinCreationStep = 1; // Reset to first step
            promptForPin({ action: 'createPin' }); // Re-open prompt for initial creation
        }, 600);
      }
    }
  } else {
    // Handle standard PIN validation for existing users
    if (ME && ME.pin_hash && atob(ME.pin_hash) === promptPinVal) {
      document.getElementById('prompt-pin-display').classList.add('success');
      setTimeout(() => {
        toast(t('pin_correct'), 's');
        executePendingPinAction();
      }, 250);
    } else {
      toast(t('pin_incorrect'), 'e');
      const display = document.getElementById('prompt-pin-display');
      display.classList.add('shake', 'error');
      setTimeout(() => {
        display.classList.remove('shake', 'error');
        clearPromptPin();
      }, 500);
    }
  }
}

function promptForPin(config) {
  pendingPinAction = config;
  if (config.action === 'createPin') {
    const isConfirming = pinCreationStep === 2;
    document.getElementById('pin-prompt-title').innerHTML = isConfirming ? t('pin_confirm_title') : t('pin_create_title');
    document.getElementById('pin-prompt-sub').innerHTML = isConfirming ? t('pin_confirm_sub') : t('pin_create_sub');
  } else {
    document.getElementById('pin-prompt-title').innerHTML = t(config.titleKey);
    document.getElementById('pin-prompt-sub').innerHTML = t(config.subtitleKey);
  }
  clearPromptPin();
  openOverlay('pin-prompt-overlay');
}

function executePendingPinAction() {
    if (!pendingPinAction) return;
    closeOverlay('pin-prompt-overlay');
    if (pendingPinAction.action === 'createPin') {
      doAuth(true); // Re-call doAuth to complete signup
    }
    if (pendingPinAction.action === 'unlockApp') {
        appIsLocked = false;
        closeOverlay('pin-prompt-overlay');
        return;
    }
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
        case 'saveProfile':
            executeSaveProfileChanges(details.updates);
            break;
        case 'resolveTransaction':
            executeResolveTransaction(details.txId, details.status);
            break;
        case 'resolveMerge':
            executeResolveMergeRequest(details.reqId, details.status);
            break;
    }
    pendingPinAction = null;
}

function closePinPrompt() {
    closeOverlay('pin-prompt-overlay');
    pendingPinAction = null;
    pinCreationStep = 0;
    firstPinAttempt = '';
    clearPromptPin();
}

function getLedgerParticipantsForCurrentUser(txType, currentUserId, fromId, toId) {
    if (txType === 'pay') {
        // A "pay" action from the current user (fromId) to another user (toId) means the current user is paying.
        // For the ledger, this reduces the current user's debt or increases the other user's debt.
        // The current user is the "payer" in the context of the apply_payment function.
        return { payer_id: fromId, payee_id: toId };
    }

    // A "borrow/request" action from the current user (fromId) means they are asking for money from the other user (toId).
    // For the ledger, this is like the other user is "paying" the current user.
    // The other user is the "payer" in the context of the apply_payment function.
    return { payer_id: toId, payee_id: fromId };
}

async function broadcastToUser(userId, event, payload) {
    if (!sbClient || !userId || userId === ME?.id) return;
    const channel = sbClient.channel(`user-channel-${userId}`);
    try {
        await channel.send({ type: 'broadcast', event, payload });
    } finally {
        channel.unsubscribe();
    }
}

async function executePendingTransaction() {
    if (!pendingTxAction) return;
    const { type, details } = pendingTxAction;
    const { to_id, to_name, amount, note } = details;
    const payBtn = document.getElementById('pay-confirm-btn');
    const reqBtn = document.querySelector('#req-amount-step .btn-primary');
    if (payBtn) { payBtn.disabled = true; payBtn.textContent = t('sending'); }
    if (reqBtn) { reqBtn.disabled = true; reqBtn.textContent = t('requesting'); }

    const otherUser = foundPayProfile || foundReqProfile;
    const isDemoTransaction = Boolean(otherUser?.is_demo);
    const status = isDemoTransaction ? 'accepted' : 'pending';

    try {
        const [newTx] = await sb('transactions', {
            method: 'POST',
            body: JSON.stringify({
                type: type, from_id: ME.id, to_id: to_id,
                from_name: ME.full_name || ME.username, to_name: to_name,
                amount, note, status: status,
                resolved_at: isDemoTransaction ? new Date().toISOString() : null
            })
        });

        if (isDemoTransaction) {
            const { payer_id, payee_id } = getLedgerParticipantsForCurrentUser(newTx.type, ME.id, newTx.from_id, newTx.to_id);
            await sbRpc('apply_payment', { payer_id, payee_id, amt: newTx.amount });
        }

        // Send a direct real-time notification, just like a nudge.
        if (!isDemoTransaction) {
            await broadcastToUser(to_id, 'new_tx', {
                from_username: ME.username,
                from_fullname: ME.full_name,
                tx: newTx
            });
        }

        if (type === 'pay') {
            toast(t('pay_request_sent').replace('{who}', to_name), 's');
        } else {
            toast(t('borrow_request_sent').replace('{who}', to_name), 's');
        }

        // Close the correct overlay
        if (type === 'pay') closeOverlay('pay-overlay');
        else closeOverlay('req-overlay');

        await loadDataWithFeedback();
    } catch (e) {
        toast(e.message || t('tx_failed'), 'e');
    } finally {
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = `Send to ${otherUser?.username || ''}`; }
        if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Request Borrow'; }
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
    authBtn.textContent = isSignup ? t('btn_create_account') : t('btn_signin');
    authBtn.style.display = isSignup ? 'block' : 'none';
  }

  document.getElementById('auth-switch').innerHTML = isSignup
    ? `${t('auth_switch_signin')}<span onclick="toggleMode()">${t('auth_switch_signin_link')}</span>`
    : `${t('auth_switch_signup')}<span onclick="toggleMode()">${t('auth_switch_signup_link')}</span>`;
  document.getElementById('main-pin-section').style.display = isSignup ? 'none' : 'block';
  document.getElementById('signup-photo').style.display = isSignup ? 'flex' : 'none';
  document.getElementById('signup-fullname').style.display = isSignup ? 'block' : 'none';
  document.getElementById('signup-username').style.display = isSignup ? 'block' : 'none';
  document.getElementById('signup-phone').style.display = isSignup ? 'block' : 'none';
  document.getElementById('login-id-field').style.display = isSignup ? 'none' : 'block';
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

document.getElementById('demo-user-photo-file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    demoUserPhotoBase64 = ev.target.result;
    const img = document.getElementById('demo-user-photo-preview');
    img.src = demoUserPhotoBase64; img.style.display = 'block';
    document.getElementById('demo-user-photo-ph').style.display = 'none';
  };
  rd.readAsDataURL(f);
});

// --- Username Generation and Validation ---
function generateUsername(fullname) {
    const khmerRegex = /[\u1780-\u17FF]/;
    if (khmerRegex.test(fullname)) {
        // If Khmer characters are present, generate a default username
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `user${randomNum}`;
    } else {
        // For English names, create a username from the full name
        return fullname
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/[^a-z0-9_]/g, '') // Remove invalid characters
            .slice(0, 24); // Limit length
    }
}

async function checkUsernameAvailability() {
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();

    if (username.length < 3) {
        usernameInput.style.borderColor = ''; // Reset border color
        return;
    }

    try {
        // Use HEAD request with count to check for existence without fetching data
        const res = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=username`, {
            method: 'HEAD',
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' }
        });
        const count = res.headers.get('content-range')?.split('/')?.[1] || '0';
        
        usernameInput.style.borderColor = parseInt(count) > 0 ? '#ff8080' : '';

    } catch (e) {
        console.error("Username check failed:", e);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function doAuth(isCompletingPin = false) {
  const idVal = document.getElementById(isSignup ? 'phone-input' : 'id-input').value.trim();

  if (isSignup) {
    // For signup, PIN is now handled in a separate flow
  } else {
    if (!idVal) return toast(t('error_enter_id'), 'e');
    if (pinVal.length !== 4) {
      // If it's not an admin code attempt, show PIN error
      if (!pinVal.startsWith('*')) {
        toast(t('error_enter_pin'), 'e');
        return;
      }
    }
  }

  const btn = document.getElementById('auth-btn');
  if (btn) {
    btn.disabled = true; btn.textContent = t('please_wait');
  }

  try {
    if (isSignup) {
      if (!isCompletingPin) {
        // This is the initial click on "Create Account"
        const fullname = document.getElementById('fullname-input').value.trim();
        const username = document.getElementById('username-input').value.trim();
        if (!fullname) { toast(t('error_fullname_required'), 'e'); return; }
        const phoneRegex = /^(\+855|0)[1-9]\d{7,8}$/;
        if (!phoneRegex.test(idVal)) { toast(t('error_invalid_phone'), 'e'); return; }
        if (!username) { toast(t('error_username_required'), 'e'); return; }
        if (/\s/.test(username)) { toast(t('error_username_spaces'), 'e'); return; }
        
        pinCreationStep = 1;
        promptForPin({ action: 'createPin' });
        return; // Stop here and let the PIN flow take over
      }
      // This part runs *after* PINs are confirmed
      const fullname = document.getElementById('fullname-input').value.trim();
      const username = document.getElementById('username-input').value.trim();
      if (!fullname) { toast(t('error_fullname_required'), 'e'); return; }
      // --- Phone Number Validation ---
      // This regex checks for Cambodian phone numbers.
      // It allows numbers starting with '0' followed by 8-9 digits,
      // or starting with '+855' followed by 8-9 digits.
      const phoneRegex = /^(\+855|0)[1-9]\d{7,8}$/;
      if (!phoneRegex.test(idVal)) { toast(t('error_invalid_phone_long'), 'e'); return; }
      if (!username) { toast(t('error_username_required'), 'e'); return; }
      if (/\s/.test(username)) { toast(t('error_username_spaces'), 'e'); return; }
      const email = username.toLowerCase() + '@tabify.internal';
      const pass = 'tbf_' + btoa(firstPinAttempt + idVal).slice(0,24);
      const ar = await sbAuth(email, pass, true);
      if (ar.error) throw new Error(ar.error.message);
      const uid = ar.user?.id || crypto.randomUUID();
      const rows = await sb('profiles', {
        method: 'POST',
        body: JSON.stringify({ id: uid, username, full_name: fullname, phone: idVal, email, photo_url: photoBase64||null, pin_hash: btoa(firstPinAttempt) })
      });
      const p = Array.isArray(rows) ? rows[0] : rows;
      saveSession(ar.user, p);
      toast(t('welcome_toast'));
    } else {
      // Login: Use the secure RPC function to validate PIN on the server.
      const profiles = await sbRpc('secure_login', {
        user_identifier: idVal,
        user_pin: pinVal
      });
      const p = profiles?.[0];
      if (!p) throw new Error(t('error_login_failed'));
      saveRecentLogin(idVal);
      saveSession({ id: p.id }, p);
      toast(t('welcome_back_toast').replace('{who}', p.full_name || p.username));
    }
    requestNotificationPermission();
    await loadData();
    showAuth(false);
    gotoScreen('home');
    setupRealtime();
  } catch(e) {
    let errorMessage = e.message || t('error_generic');
    if (isSignup && (errorMessage.includes('profiles_username_key') || errorMessage.includes('User already registered'))) {
        errorMessage = 'This name is already taken. Please try a different name or a variation.';
    }
    toast(errorMessage, 'e');
    // If login fails (not signup), clear the PIN for a quick retry.
    if (!isSignup) {
      const display = document.getElementById('pin-display');
      if (display) {
        display.classList.add('shake');
        setTimeout(() => display.classList.remove('shake'), 500);
      }
      setTimeout(clearPin, 500);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('btn_create_account');
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
      sb(`debts?select=*,user_a_profile:user_a(id,username,full_name,photo_url,is_demo,created_by),user_b_profile:user_b(id,username,full_name,photo_url,is_demo,created_by)&or=(user_a.eq.${ME.id},user_b.eq.${ME.id})&order=updated_at.desc`),
      sb(`transactions?or=(from_id.eq.${ME.id},to_id.eq.${ME.id})&order=created_at.desc&limit=40`),
      sb(`merge_requests?real_user_id=eq.${ME.id}&status=eq.pending&select=*,demo_user:demo_user_id(username,full_name,photo_url),requested_by:requested_by_id(username,full_name)`)
    ]);
    allDebts = d || [];
    allTx = t || [];
    pendingTx = allTx.filter(tx => tx.status === 'pending' && tx.to_id === ME.id);
    await Promise.all([
      renderHome(), renderHistory(), renderProfileScreen()
    ]);
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
    netEl.textContent = t('refreshing');
    netEl.style.opacity = '0.7';

    try {
        await loadData(); // This will re-render and update the text
        toast(t('refreshed_toast'), 's');
    } catch (e) {
        toast(t('refresh_failed_toast'), 'e');
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
  const totalOwed = owedToMe.reduce((s,d)=>s+getDebtBalanceWithInterest(d).totalAmount,0);
  const totalIOwe = iOwe.reduce((s,d)=>s+getDebtBalanceWithInterest(d).totalAmount,0);
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
        const debtBalance = getDebtBalanceWithInterest(d);
        html += debtRow(other.id, other.full_name || other.username, other.photo_url, debtBalance.totalAmount, true, d.updated_at);
      });
    }
    if (iOwe.length) {
      html += `<div class="section-head mt12" data-i18n="you_owe_section">You owe</div>`;
      iOwe.forEach(d => {
        const other = d.user_a === ME.id ? d.user_b_profile : d.user_a_profile;
        const debtBalance = getDebtBalanceWithInterest(d);
        html += debtRow(other.id, other.full_name || other.username, other.photo_url, debtBalance.totalAmount, false, d.updated_at);
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
      <div class="debt-meta">${metaText}</div>
    </div>
    <div class="debt-right">
      <div class="debt-val" style="color:${color}">${prefix}${riel(amount)}</div>
      <div class="debt-date">${dt}</div>
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
    let label = '';
    if (isPay) {
      label = sent ? t('tx_sent_pay').replace('{who}', who) : t('tx_recv_pay').replace('{who}', who);
    } else { // 'request'
      label = sent ? t('tx_sent_request').replace('{who}', who) : t('tx_recv_request').replace('{who}', who);
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

async function openPeerHistory(otherUserId) {
  if (!otherUserId) return;

  // Find the debt relationship, if one exists.
  const debtWithUser = allDebts.find(d => d.user_a === otherUserId || d.user_b === otherUserId);
  
  // Find the profile of the other user.
  let otherUser;
  if (debtWithUser) {
    otherUser = debtWithUser.user_a === otherUserId ? debtWithUser.user_a_profile : debtWithUser.user_b_profile;
  } else {
    // This handles demo contacts that have no debt row yet.
    const allContacts = await getAllUniqueContacts();
    otherUser = allContacts.find(u => u.id === otherUserId);
  }

  // The profile might be null if the user was deleted.
  if (!otherUser) return toast(t('error_contact_not_found'), 'e');

  const peerTx = allTx.filter(tx => 
    (tx.from_id === ME.id && tx.to_id === otherUserId) ||
    (tx.from_id === otherUserId && tx.to_id === ME.id)
  );

  let netPositionHTML = '';
  if (debtWithUser && debtWithUser.net_amount > 0) {
      const isOwedToMe = debtWithUser.net_creditor === ME.id;
      const debtBalance = getDebtBalanceWithInterest(debtWithUser);
      const amount = debtBalance.totalAmount;
      const color = isOwedToMe ? '#00e5a0' : '#ff8080';
      const text = isOwedToMe ? t('owes_you_user').replace('{who}', otherUser.username) : t('you_owe_user').replace('{who}', otherUser.username);

      netPositionHTML = `
        <div style="text-align: right; margin-left: auto;">
            <div style="font-size: 16px; font-weight: 700; color: ${color};">${riel(amount)}</div>
            <div style="font-size: 12px; color: #7d8590;">${text}</div>
        </div>`;
  }

  const headerEl = document.getElementById('peer-history-header');
  headerEl.innerHTML = `
    <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 12px;">
      ${avatarHTML(otherUser.full_name || otherUser.username, otherUser.photo_url, 48)}
      <div>
        <div class="sheet-title" style="margin-bottom:2px;">${t('history_with_user').replace('{who}', esc(otherUser.username))}</div>
        <div class="sheet-sub" style="margin-bottom:0;" data-i18n="all_transactions_between_you">All transactions between you</div>
      </div>
      ${netPositionHTML}
    </div>
  `;

  const listEl = document.getElementById('peer-history-list');
  if (!peerTx.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📋</div><div class="empty-sub" data-i18n="tx_empty_sub"></div></div>';
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
        <button class="action-btn req-btn-main" onclick='borrowFromUserInHistory(${JSON.stringify(otherUser)})' style="background-color: #161b22; border: 1.5px solid #21262d; color: #e6edf3;">
          <span class="ab-icon"><i class="fi fi-rr-handshake"></i></span> 
          <span class="ab-label" data-i18n="borrow">Borrow</span>
        </button>
        <button class="action-btn" onclick="sendNudge('${esc(otherUser.id)}')" style="background-color: #2e2a0f; border: 1.5px solid #6e6020; color: #f0a030;">
          <span class="ab-icon">👋</span>
          <span class="ab-label" data-i18n="nudge">Nudge</span>
        </button>
      `;
  }

  openOverlay('peer-history-overlay');
  applyTranslations();
}

function payUserFromHistory(username) {
  closeOverlay('peer-history-overlay');
  setTimeout(() => {
    openPay();
    document.getElementById('type-token-input').value = username;
    lookupPayUsername();
  }, 250);
}

function borrowFromUserInHistory(user) {
    closeOverlay('peer-history-overlay');
    setTimeout(() => {
        openRequest();
        selectReqUser(user);
    }, 250);
}

async function sendNudge(toUserId) {
    if (!toUserId || !sbClient) return;
    const channel = sbClient.channel(`user-channel-${toUserId}`);
    toast(`Nudged!`, 's');
    await channel.send({
        type: 'broadcast',
        event: 'nudge',
        payload: { from_username: ME.username, from_fullname: ME.full_name }
    }, 250);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE/MANAGEMENT SCREEN
// ═══════════════════════════════════════════════════════════════════════════
async function renderProfileScreen() {
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
  const contactsSection = document.getElementById('profile-contacts-section');
  if (contactsSection) {
    // Check if the contacts list is currently visible before re-rendering
    const contactsListEl = document.getElementById('profile-contacts-list');
    const isContactsListVisible = contactsListEl && contactsListEl.style.display !== 'none';

    const uniqueContacts = await getAllUniqueContacts();
    const editToggleButton = isContactsEditing
        ? `<button class="btn-ghost" onclick="toggleContactsEdit(false)" style="width: 100%; margin-top: 12px;">Done Editing</button>`
        : `<button class="btn-ghost" onclick="toggleContactsEdit(true)" style="width: 100%; margin-top: 12px;"><i class="fi fi-rr-user-pen" style="margin-right: 8px;"></i> Edit Contacts</button>`;

    if (uniqueContacts.length > 0) {
        contactsSection.innerHTML = `
            <div style="display: flex; align-items: center; margin: 0 0 10px;">
                <div class="section-head" style="margin: 0; cursor: pointer;" onclick="document.getElementById('profile-contacts-list').style.display = document.getElementById('profile-contacts-list').style.display === 'none' ? 'block' : 'none';">
                    CONTACTS (${uniqueContacts.length})
                </div>
            </div>
            <div id="profile-contacts-list" style="display: ${isContactsListVisible ? 'block' : 'none'};">
                ${uniqueContacts
                  .map((contact) => {
                    let actionButtons = '';
                    if (contact.is_demo) {
                        actionButtons = `
                            <button class="icon-btn" onclick="event.stopPropagation(); promptConfirmMerge('${contact.id}')" style="background: #1a1a2e; border-color: #4444aa; color: #9090ff; margin-left: 10px;" title="Merge Demo User"><i class="fi fi-rr-search-alt"></i></button>
                            <button class="icon-btn" onclick="event.stopPropagation(); deleteUser('${contact.id}', '${esc(contact.username)}')" style="background: #2e0f0f; border-color: #6e2020; color: #ff8080; margin-left: 8px;" title="Delete Demo User"><i class="fi fi-rr-trash"></i></button>
                        `;
                    } else if (isContactsEditing) {
                        // Placeholder for potential future actions on real contacts in edit mode
                        actionButtons = '';
                    }

                    return `
                    <div class="debt-item" style="align-items: center;" onclick="handleContactClick(event, '${contact.id}')">
                        ${avatarHTML(contact.full_name || contact.username, contact.photo_url, 44)}
                        <div class="debt-info" style="cursor: pointer;">
                            <div class="debt-name">${esc(contact.full_name || contact.username)}</div>
                            <div class="debt-meta">
                                @${esc(contact.username)}
                                ${contact.is_demo ? '<span style="color:#f0a030; font-weight:600; font-size:11px; margin-left: 6px;">(DEMO)</span>' : ''}
                            </div>
                        </div>
                        <div class="debt-right" style="display: flex;">${actionButtons}</div>
                    </div>
                    `;
                  })
                  .join('')}
            </div>
        `;
    } else {
        contactsSection.innerHTML = ''; // Clear if no contacts
    }
  }
  applyTranslations();
}

function handleContactClick(event, contactId) {
    // If the click was on a button or an icon inside a button, stop.
    // The button's own onclick will handle it.
    if (event.target.closest('button')) {
        return;
    }
    // Otherwise, open the peer history.
    openPeerHistory(contactId);
}

function openAddDemoUserOverlay() {
    // Reset form
    document.getElementById('demo-user-fullname-input').value = '';
    document.getElementById('demo-user-username-input').value = '';
    document.getElementById('demo-user-photo-preview').style.display = 'none';
    document.getElementById('demo-user-photo-ph').style.display = 'flex';
    demoUserPhotoBase64 = null;
    openOverlay('add-demo-user-overlay');
}

document.getElementById('demo-user-fullname-input').addEventListener('input', (e) => {
    const fullname = e.target.value;
    const usernameInput = document.getElementById('demo-user-username-input');
    if (fullname.trim()) {
        usernameInput.value = generateUsername(fullname);
    } else {
        usernameInput.value = '';
    }
});

async function createDemoUser() {
    const fullname = document.getElementById('demo-user-fullname-input').value.trim();
    const username = document.getElementById('demo-user-username-input').value.trim();

    if (!fullname) return toast(t('error_fullname_required'), 'e');
    if (!username) return toast(t('error_username_required'), 'e');
    if (!ME?.id) return toast(t('error_signin_again'), 'e');

    const payload = {
        id: crypto.randomUUID(),
        full_name: fullname,
        username: username,
        photo_url: demoUserPhotoBase64 || null,
        is_demo: true,
        created_by: ME.id
    };

    let savedUser;
    try {
        // First, try to save to the server.
        [savedUser] = await sb('profiles', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        toast(t('demo_contact_created_toast').replace('{who}', savedUser.username), 's');
    } catch (e) {
        // If server save fails (e.g., offline), save locally as a fallback.
        console.warn("Server save failed, saving demo user locally.", e.message);
        const localUsers = getLocalDemoUsers();
        savedUser = { ...payload, created_at: new Date().toISOString() };
        localUsers.push(savedUser); // This line is correct
        saveLocalDemoUsers(localUsers);
        toast(t('demo_contact_created_offline_toast').replace('{who}', username), 'i');
    } finally {
        closeOverlay('add-demo-user-overlay');
        await loadData();
    }
}

async function promptConfirmMerge(demoUserId) {
    if (!demoUserId) return toast(t('error_invalid_demo_user'), 'e');

    const contacts = await getAllUniqueContacts();
    const demoUser = contacts.find(c => c.id === demoUserId && c.is_demo);
    if (!demoUser) return toast(t('error_invalid_demo_user'), 'e');

    mergeTargetDemoUser = demoUser;
    document.getElementById('confirm-merge-demo-name').textContent = demoUser.username;
    resetMergeSearch();
    openOverlay('confirm-merge-overlay');
}

function resetMergeSearch() {
    mergeTargetRealUser = null;
    document.getElementById('merge-search-input').value = '';
    document.getElementById('merge-search-results').innerHTML = '';
    document.getElementById('merge-confirm-section').style.display = 'none';
    document.getElementById('merge-search-field').style.display = 'block';
}

async function searchMergeUsers(q) {
    clearTimeout(searchTimer);
    const res = document.getElementById('merge-search-results');
    if (!q || q.length < 2) { res.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
        try {
            // Search for real users only, excluding the current user and any demo users
            const users = await sb(`profiles?or=(username.ilike.*${q}*,full_name.ilike.*${q}*,phone.ilike.*${q}*)&is_demo=eq.false&id=not.eq.${ME.id}&limit=5&select=id,username,full_name,photo_url`);
            if (!users || !users.length) {
                res.innerHTML = `<div style="color:#7d8590;font-size:14px;padding:8px 0" data-i18n="no_real_users_found">${t('no_real_users_found')}</div>`;
                return;
            }
            res.innerHTML = users.map(p => `
                <div class="search-result" onclick='selectMergeUser(${JSON.stringify(p)})'>
                    ${avatarHTML(p.full_name || p.username, p.photo_url || null, 40)}
                    <div>
                        <div style="font-weight:600;font-size:15px">${esc(p.full_name || p.username)}</div>
                        <div style="font-size:12px;color:#7d8590">@${esc(p.username)}</div>
                    </div>
                </div>`).join('');
        } catch (e) {
            console.error('Merge search failed:', e);
        }
    }, 350);
}

function selectMergeUser(user) {
    mergeTargetRealUser = user;
    document.getElementById('merge-found-card').innerHTML = `
        ${avatarHTML(user.full_name || user.username, user.photo_url || null, 48)}
        <div style="flex:1">
            <div style="font-weight:700;font-size:17px">${esc(user.username)}</div>
            <div style="font-size:13px;color:#7d8590" data-i18n="real_user_account">Real User Account</div>
        </div>`;
    document.getElementById('merge-search-field').style.display = 'none';
    document.getElementById('merge-confirm-section').style.display = 'block';
}

async function sendMergeRequest() {
    if (!mergeTargetDemoUser || !mergeTargetRealUser) return toast('Targets for merge not set.', 'e');
    
    try {
        await sb('merge_requests', {
            method: 'POST',
            body: JSON.stringify({
                demo_user_id: mergeTargetDemoUser.id,
                real_user_id: mergeTargetRealUser.id,
                requested_by_id: ME.id
            })
        });
        toast(t('merge_request_sent_toast').replace('{who}', mergeTargetRealUser.username), 's');
        closeOverlay('confirm-merge-overlay');
    } catch (e) {
        toast(e.message.includes('duplicate key') ? t('error_merge_request_exists') : t('error_merge_request_failed'), 'e');
    }
}

function toggleContactsEdit(isEditing) {
    isContactsEditing = isEditing;
    renderProfileScreen();
}

function toggleProfileEditForm(isEditing) {
    document.getElementById('profile-display-wrap').style.display = isEditing ? 'none' : 'block';
    document.getElementById('profile-edit-form').style.display = isEditing ? 'block' : 'none';
    if (isEditing) {
        renderProfileScreen(); // re-populate form with original data
    } 
}

async function executeSaveProfileChanges(updates) {
    if (!ME) return;
    try {
        const [updatedProfile] = await sb(`profiles?id=eq.${ME.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        Object.assign(ME, updatedProfile);
        const sess = JSON.parse(localStorage.getItem('tabify_session') || '{}');
        if (sess.profile) { Object.assign(sess.profile, updatedProfile); localStorage.setItem('tabify_session', JSON.stringify(sess)); }
        toast(t('profile_updated_toast'), 's');
        toggleProfileEditForm(false);
        renderHome(); renderProfileScreen();
    } catch (e) {
        let errorMessage = e.message || t('error_profile_update_failed');
        if (errorMessage.includes('profiles_username_key')) {
            errorMessage = t('error_username_taken');
        }
        toast(errorMessage, 'e');
    }
}

function saveProfileChanges() {
    if (!ME) return;
    const newFullName = document.getElementById('profile-fullname-input').value.trim();
    const newUsername = document.getElementById('profile-username-input').value.trim();
    if (!newFullName) return toast(t('error_fullname_empty'), 'e');
    if (!newUsername) return toast(t('error_username_empty'), 'e');
    const updates = { username: newUsername, full_name: newFullName };
    if (newProfilePhotoBase64) { updates.photo_url = newProfilePhotoBase64; }

    pendingPinAction = {
        action: 'saveProfile',
        details: { updates }
    };

    promptForPin({ ...pendingPinAction, titleKey: 'pin_save_changes_title', subtitleKey: 'pin_save_changes_sub' });
}

async function renderAdminScreen() {
    const screen = document.getElementById('admin-screen');
    screen.innerHTML = `<div style="padding: 52px 20px 90px;">
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom:20px;" >
            <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;" data-i18n="admin_panel">Admin Panel</div>
            <button class="icon-btn" onclick="logout()" data-i18n-attr="title" data-i18n="exit_admin_mode" style="font-size:15px">⏻</button>
        </div>
        <div id="admin-user-list"><div class="empty-state">Loading users...</div></div>
    </div>`;

    try {
        const [allUsers, allDebts] = await Promise.all([
            sb('profiles?select=*&order=username.asc'),
            sb('debts?select=*')
        ]);

        const realUsers = allUsers.filter(u => !u.is_demo);
        const demoUsers = allUsers.filter(u => u.is_demo);

        const demoUsersByCreator = demoUsers.reduce((acc, user) => {
            if (user.created_by) {
                if (!acc[user.created_by]) {
                    acc[user.created_by] = [];
                }
                acc[user.created_by].push(user);
            }
            return acc;
        }, {});

        const renderUserRow = (user, isDemo = false) => {
            const pos = userNetPositions[user.id] || { owedTo: 0, owes: 0 };
            const net = (pos.owedTo - pos.owes);
            const netColor = net >= 0 ? '#00e5a0' : '#ff8080';
            const netPrefix = net >= 0 ? '+' : '−';
            const indentStyle = isDemo ? 'margin-left: 20px; border-left: 2px solid #21262d; padding-left: 12px;' : '';

            return `
                <div class="debt-item" style="align-items: center; ${indentStyle}">
                    ${avatarHTML(user.full_name || user.username, user.photo_url, 40)}
                    <div class="debt-info"><div class="debt-name">${esc(user.username)}</div><div class="debt-meta">${esc(user.phone || (isDemo ? t('demo_account') : t('no_phone')))}</div></div>
                    <div class="debt-right"><div class="debt-val" style="color:${netColor}">${netPrefix}${riel(Math.abs(net))}</div><div class="debt-meta" data-i18n="net_position_admin">Net Position</div></div>
                    ${!isDemo ? `<button class="icon-btn" onclick='promptAdminUserEdit(${JSON.stringify(user)})' style="background: #0f2e1e; border-color: #00e5a0; color: #00e5a0; margin-left: 10px;" data-i18n-attr="title" data-i18n="edit_user"><i class="fi fi-rr-user-pen"></i></button>` : ''}
                    <button class="icon-btn" onclick="promptAdminPinReset('${user.id}', '${esc(user.username)}')" style="background: #1a1a2e; border-color: #4444aa; color: #9090ff; margin-left: 10px;" data-i18n-attr="title" data-i18n="reset_pin">🔑</button>
                    <button class="icon-btn" onclick="deleteUser('${user.id}', '${esc(user.username)}')" style="background: #2e0f0f; border-color: #6e2020; color: #ff8080; margin-left: 8px;" data-i18n-attr="title" data-i18n="delete_user"><i class="fi fi-rr-trash"></i></button>
                </div>`;
        };

        const userNetPositions = {};
        allUsers.forEach(u => {
            userNetPositions[u.id] = { owedTo: 0, owes: 0, profile: u };
        });

        allDebts.forEach(debt => {
            const creditorId = debt.net_creditor;
            const debtBalance = getDebtBalanceWithInterest(debt);
            const amount = debtBalance.totalAmount;
            const debtorId = debt.user_a === creditorId ? debt.user_b : debt.user_a;

            if (userNetPositions[creditorId]) {
                userNetPositions[creditorId].owedTo += amount;
            }
            if (userNetPositions[debtorId]) {
                userNetPositions[debtorId].owes += amount;
            }
        });

        const listEl = document.getElementById('admin-user-list');
        if (!realUsers.length) {
            listEl.innerHTML = `<div class="empty-state" data-i18n="no_users_found">${t('no_users_found')}</div>`;
            return;
        }
        
        listEl.innerHTML = realUsers.map(user => {
            let userHtml = renderUserRow(user);
            const createdDemoUsers = demoUsersByCreator[user.id];
            if (createdDemoUsers && createdDemoUsers.length > 0) { // This line is correct
                userHtml += `
                    <div style="padding-left: 20px; cursor: pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none';">
                        <span style="font-size: 12px; color: #7d8590;">▶ Show ${createdDemoUsers.length} Demo Accounts</span>
                    </div>
                    <div class="demo-user-container" style="display: none;">
                        ${createdDemoUsers.map(demoUser => renderUserRow(demoUser, true)).join('')}
                    </div>`;
            }
            return userHtml;
        }).join('');

        applyTranslations();
    } catch (e) {
        document.getElementById('admin-user-list').innerHTML = `<div class="empty-state" style="color:red">Error loading admin data: ${e.message}</div>`;
        console.error(e);
    }
}

function promptAdminUserEdit(user) {
    adminTargetUser = user;
    document.getElementById('admin-user-edit-title').textContent = t('edit_user_title').replace('{who}', user.username);
    document.getElementById('admin-edit-username-input').value = user.username;
    document.getElementById('admin-edit-phone-input').value = user.phone;
    openOverlay('admin-user-edit-overlay');
}

async function executeAdminUserUpdate() {
    const newPhone = document.getElementById('admin-edit-phone-input').value.trim();
    if (!adminTargetUser) return toast(t('error_no_user_selected'), 'e');

    const phoneRegex = /^(\+855|0)[1-9]\d{7,8}$/;
    if (!phoneRegex.test(newPhone)) {
        return toast(t('error_invalid_phone'), 'e');
    }

    try {
        toast(t('updating_phone_toast'), 'i');
        await sb(`profiles?id=eq.${adminTargetUser.id}`, { method: 'PATCH', body: JSON.stringify({ phone: newPhone }) });
        toast(t('phone_updated_toast').replace('{who}', adminTargetUser.username), 's');
        closeOverlay('admin-user-edit-overlay');
        renderAdminScreen(); // Refresh the admin list to show new data
    } catch (e) {
        let errorMessage = e.message || t('error_phone_update_failed');
        if (errorMessage.includes('profiles_phone_key')) {
            errorMessage = t('error_phone_in_use');
        }
        toast(errorMessage, 'e');
    }
}

function promptAdminPinReset(userId, username) {
    adminTargetUserId = userId;
    adminTargetUsername = username;
    document.getElementById('admin-pin-reset-title').textContent = t('reset_pin_for_user').replace('{who}', username);
    document.getElementById('admin-pin-reset-sub').textContent = t('admin_pin_reset_sub_text');
    document.getElementById('admin-new-pin-input').value = '';
    openOverlay('admin-pin-reset-overlay');
}

async function executeAdminPinReset() {
    const newPin = document.getElementById('admin-new-pin-input').value;
    if (!/^\d{4}$/.test(newPin)) {
        return toast(t('error_invalid_pin'), 'e');
    }
    if (!adminTargetUserId) { return toast(t('error_no_user_selected'), 'e'); }

    try {
        toast(t('resetting_pin_toast'), 'i');
        const newPinHash = btoa(newPin);
        await sb(`profiles?id=eq.${adminTargetUserId}`, { method: 'PATCH', body: JSON.stringify({ pin_hash: newPinHash }) });
        toast(t('pin_reset_success_toast').replace('{who}', adminTargetUsername).replace('{pin}', newPin), 's');
        closeOverlay('admin-pin-reset-overlay');
    } catch (e) {
        toast(t('error_pin_reset_failed').replace('{error}', e.message), 'e');
    } finally {
        adminTargetUserId = null; adminTargetUsername = null;
    }
}

async function deleteUser(userId, username) {
    if (!confirm(t('confirm_delete_user').replace('{who}', username))) return;
    
    try {
        toast(t('deleting_user_toast'), 'i');
        await sb(`profiles?id=eq.${userId}`, { method: 'DELETE' });

        // Also remove from local storage if it's a demo user
        const localDemoUsers = getLocalDemoUsers();
        const updatedLocalUsers = localDemoUsers.filter(u => u.id !== userId);
        saveLocalDemoUsers(updatedLocalUsers);

        toast(t('user_deleted_toast').replace('{who}', username), 's');
        
        // Check which screen is active and refresh it.
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen && activeScreen.id === 'admin-screen') {
            renderAdminScreen();
        } else {
            // loadData() refreshes the home, history, and profile screens.
            await loadData();
        }

    } catch (e) {
        toast(t('error_delete_user_failed').replace('{error}', e.message), 'e');
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
    // No need to await loadData() here. The realtime listeners keep pendingTx up-to-date.
    // We will fetch fresh data in the background *after* showing the overlay.
    const list = document.getElementById('notif-list');
    if (!pendingTx.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">✅</div><div class="empty-sub">No pending notifications</div></div>';
    } else {
      list.innerHTML = pendingTx.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => {
        const isPay = tx.type === 'pay';
        const label = isPay ? 'PAYMENT' : 'DEBT';
        const cls = isPay ? 'notif-pay' : 'notif-req';
    const who = tx.from_name || t('someone');
        const desc = isPay ? t('notif_pay_desc').replace('{who}', who) : t('notif_request_desc').replace('{who}', who);
        return `<div class="notif-item" id="notif-item-${tx.id}">
      <div class="notif-top"><span class="notif-type ${cls}">${isPay ? t('payment') : t('debt')}</span><span style="font-size:13px;color:#7d8590">${new Date(tx.created_at).toLocaleDateString()}</span></div>
          <div class="notif-who">${desc}</div>
          <div class="notif-amount">${riel(tx.amount)}</div>
          ${tx.note ? `<div class="notif-note">"${esc(tx.note)}"</div>` : ''}
          <div class="notif-actions">
        <button class="notif-accept" onclick="resolveTransaction('${tx.id}','accepted', this)" data-i18n="accept">Accept</button>
        <button class="notif-decline" onclick="resolveTransaction('${tx.id}','declined')" data-i18n="decline">Decline</button>
          </div>
        </div>`;
      }).join('');
    }
    
    // Open the overlay immediately with current data.
    openOverlay('notif-overlay');

    const mergeRequests = await sb(`merge_requests?real_user_id=eq.${ME.id}&status=eq.pending&select=*,demo_user:demo_user_id(username,full_name),requested_by:requested_by_id(username,full_name)`);
    if (mergeRequests && mergeRequests.length > 0) {
    list.innerHTML = (list.innerHTML.includes('empty-state') ? '' : list.innerHTML) + mergeRequests.map(req => {
        const who = req.requested_by.full_name || req.requested_by.username;
        return `<div class="notif-item" id="notif-item-${req.id}">
        <div class="notif-top"><span class="notif-type" style="background:#1a1a3a; color:#7c6ef5;" data-i18n="merge_notif_label">MERGE</span></div>
        <div class="notif-who">${t('merge_notif_who').replace('{who}', who).replace('{demo_user}', req.demo_user.username)}</div>
        <div class="notif-note" data-i18n="merge_notif_note">All of their transaction history with this demo contact will be transferred to you.</div>
          <div class="notif-actions">
          <button class="notif-accept" onclick="resolveMergeRequest('${req.id}', 'accepted', this)" data-i18n="accept_merge">Accept Merge</button>
          <button class="notif-decline" onclick="resolveMergeRequest('${req.id}', 'declined')" data-i18n="decline">Decline</button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    toast(e.message || 'Could not refresh notifications.', 'e');
  } finally {
    btn.disabled = false;
  }
}

async function resolveTransaction(txId, status, btnEl) {
    if (status === 'declined') {
        // Declining does not require a PIN for a smoother user experience.
        executeResolveTransaction(txId, status);
    } else if (status === 'accepted') {
        if (btnEl) {
            btnEl.disabled = true;
            const parent = btnEl.closest('.notif-item');
            if (parent) parent.classList.add('is-processing');
        }
        // Accepting a transaction is a financial action and requires PIN confirmation.
        pendingPinAction = {
            action: 'resolveTransaction',
            details: { txId, status }
        };
        promptForPin({
            ...pendingPinAction,
            titleKey: 'pin_tx_title',
            subtitleKey: 'pin_tx_sub'
        });
    }
}

async function executeResolveTransaction(txId, status) {
    try {
        const tx = allTx.find(t => t.id === txId);
        if (!tx) return;
        await sb(`transactions?id=eq.${txId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status, resolved_at: new Date().toISOString() })
        });
        const otherUserId = tx.from_id === ME.id ? tx.to_id : tx.from_id;
        const otherUserName = tx.from_id === ME.id ? (tx.to_name || t('someone')) : (tx.from_name || t('someone'));

        if (status === 'accepted') {
            const { payer_id, payee_id } = getLedgerParticipantsForCurrentUser(tx.type, ME.id, tx.from_id, tx.to_id);
            await sbRpc('apply_payment', {
                payer_id,
                payee_id,
                amt: tx.amount
            });
            toast(t('tx_accepted_toast'));
            await broadcastToUser(otherUserId, 'tx_status_changed', {
                from_username: ME.username,
                from_fullname: ME.full_name,
                txId,
                status,
                who: otherUserName,
                amount: tx.amount,
                note: tx.note,
                txType: tx.type
            });
            animateAndRemove(`notif-item-${txId}`, () => { pendingTx = pendingTx.filter(t => t.id !== txId); updateNotifBadge(); });
            return;
        } else {
            toast(t('tx_declined_toast'));
            await broadcastToUser(otherUserId, 'tx_status_changed', {
                from_username: ME.username,
                from_fullname: ME.full_name,
                txId,
                status,
                who: otherUserName,
                amount: tx.amount,
                note: tx.note,
                txType: tx.type
            });
            animateAndRemove(`notif-item-${txId}`, () => { pendingTx = pendingTx.filter(t => t.id !== txId); updateNotifBadge(); });
            return;
        }
    } catch (e) {
        toast(e.message || 'Failed to resolve transaction', 'e');
    }
}

async function resolveMergeRequest(reqId, status, btnEl) {
    if (status === 'declined') {
        // Declining a merge request does not require a PIN.
        executeResolveMergeRequest(reqId, status);
    } else if (status === 'accepted') {
        if (btnEl) {
            btnEl.disabled = true;
            const parent = btnEl.closest('.notif-item');
            if (parent) parent.classList.add('is-processing');
        }
        // Accepting a merge is a significant action and requires PIN confirmation.
        pendingPinAction = {
            action: 'resolveMerge',
            details: { reqId, status }
        };
        promptForPin({
            ...pendingPinAction, titleKey: 'pin_tx_title', subtitleKey: 'pin_tx_sub'
        });
    }
}

async function executeResolveMergeRequest(reqId, status) {
    try {
        const [req] = await sb(`merge_requests?id=eq.${reqId}&select=*`);
        if (!req) throw new Error('Merge request not found.');
        await sb(`merge_requests?id=eq.${reqId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: status, resolved_at: new Date().toISOString() })
        });
        if (status === 'accepted') {
            await sbRpc('execute_merge', { p_demo_user_id: req.demo_user_id, p_real_user_id: req.real_user_id });
            toast(t('merge_success_toast'), 's');
            animateAndRemove(`notif-item-${reqId}`, () => { pendingTx = pendingTx.filter(t => t.id !== reqId); updateNotifBadge(); });
            return;
        } else {
            toast(t('merge_declined_toast'), 'i');
            animateAndRemove(`notif-item-${reqId}`, () => { pendingTx = pendingTx.filter(t => t.id !== reqId); updateNotifBadge(); });
            return;
        }
    } catch (e) { toast(`Failed to resolve merge: ${e.message}`, 'e'); }
}

function animateAndRemove(elementId, onComplete) {
    const itemEl = document.getElementById(elementId);
    if (!itemEl) return;

    const animationDuration = 200; // Must match CSS animation duration
    itemEl.classList.add('removing');

    setTimeout(() => {
        itemEl.remove();
        if (onComplete) {
            onComplete();
        }
        // After removal, check if the list is now empty
        if (document.querySelectorAll('#notif-list .notif-item').length === 0) {
            closeOverlay('notif-overlay');
        }
    }, animationDuration);
}
// ═══════════════════════════════════════════════════════════════════════════
// PAY FLOW
// ═══════════════════════════════════════════════════════════════════════════
function openPay() {
  loadData();
  resetPayFound();
  openOverlay('pay-overlay');
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
  try {
    const video = document.getElementById('cam-video');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const snapshotCanvas = document.getElementById('cam-snapshot');
      const camView = document.getElementById('cam-view');
      snapshotCanvas.width = camView.clientWidth;
      snapshotCanvas.height = camView.clientHeight;
      const ctx = snapshotCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
      const imageData = ctx.getImageData(0, 0, snapshotCanvas.width, snapshotCanvas.height);

      if (typeof jsQR === 'undefined') {
        console.error("jsQR library not loaded. Stopping scanner.");
        if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
        toast('QR scanning library failed to load.', 'e');
        setPayTab('type'); // Fallback to a non-camera UI
        return; // Stop the scan loop
      }

      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        snapshotCanvas.style.display = 'block';
        const camFrame = document.querySelector('.cam-frame');
        if (camFrame) camFrame.classList.add('detected');
        if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
        resolvePayUsername(code.data.trim());
        return; // Stop the scan loop
      }
    }
  } catch (e) {
    console.error("Error during jsQR scan:", e);
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

async function scanWithBarcodeDetector() {
  const video = document.getElementById('cam-video');
  if (video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector) {
    try {
      const barcodes = await barcodeDetector.detect(video);
      if (barcodes.length > 0) {
        const code = barcodes[0];
        
        const snapshotCanvas = document.getElementById('cam-snapshot');
        const camView = document.getElementById('cam-view');
        snapshotCanvas.width = camView.clientWidth;
        snapshotCanvas.height = camView.clientHeight;
        const ctx = snapshotCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
        snapshotCanvas.style.display = 'block';

        const camFrame = document.querySelector('.cam-frame');
        if (camFrame) camFrame.classList.add('detected');

        if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
        barcodeDetector = null;
        
        resolvePayUsername(code.rawValue.trim());
        return;
      }
    } catch (e) {
      console.error('BarcodeDetector error:', e);
    }
  }
  
  if (camStream) {
    requestAnimationFrame(scanWithBarcodeDetector);
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

    const restartScanning = () => {
        setTimeout(() => {
            document.getElementById('cam-snapshot').style.display = 'none';
            document.querySelector('.cam-frame')?.classList.remove('detected');
            startCamera();
        }, 1000);
    };

    if (!username) {
        toast(t('error_empty_qr'), 'e');
        restartScanning();
        return;
    }

    try {
        const rows = await sb(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
        if (!rows?.length) {
            toast(t('error_user_not_found').replace('{who}', esc(username)), 'e');
            restartScanning();
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
        ['pay-scan', 'pay-type', 'pay-upload'].forEach(id => document.getElementById(id).style.display = 'none');
        document.getElementById('pay-found').style.display = 'block';
    } catch (e) {
        toast(e.message || 'Lookup failed', 'e');
        restartScanning();
    }
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
        toast(t('error_no_qr_in_image'), 'e');
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
  document.getElementById('cam-snapshot').style.display = 'none';

  // Restore visibility of tab UI for the normal flow
  document.querySelector('#pay-overlay .tab-row').style.display = 'flex';
  document.querySelector('#pay-overlay .sheet-sub').style.display = 'block';

  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  barcodeDetector = null;
  setPayTab('type');
}

async function submitPay() {
  const amountValue = document.getElementById('pay-amount').value.replace(/\s/g, '');
  const amount = parseFloat(amountValue);
  const note = document.getElementById('pay-note').value.trim();
  if (!amount || isNaN(amount) || amount <= 0) return toast(t('error_invalid_amount'), 'e');
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
      const [byPhone, byUser, byFullName] = await Promise.all([
          sb(`profiles?phone=ilike.*${encodeURIComponent(q)}*&limit=3`).catch(() => []),
          sb(`profiles?username=ilike.*${encodeURIComponent(q)}*&limit=3`).catch(() => []),
          sb(`profiles?full_name=ilike.*${encodeURIComponent(q)}*&limit=3`).catch(() => [])
      ]);
      const merged = [...(byPhone || []), ...(byUser || []), ...(byFullName || [])];
      const unique = merged.filter((p, i, a) => p.id !== ME.id && a.findIndex(x => x.id === p.id) === i).slice(0, 4);
      if (!unique.length) { res.innerHTML = `<div style="color:#7d8590;font-size:14px;padding:8px 0" data-i18n="no_users_found">${t('no_users_found')}</div>`; return; }
      res.innerHTML = unique.map(p => `
        <div class="search-result" onclick="selectPayUser('${esc(p.username)}')">
          ${avatarHTML(p.full_name || p.username, p.photo_url || null, 40)}
          <div>
            <div style="font-weight:600;font-size:15px">${esc(p.full_name || p.username)}</div>
            <div style="font-size:12px;color:#7d8590">@${esc(p.username)}</div>
          </div>
        </div>`).join('');
    } catch { }
  }, 350);
}

function renderSearchResult(user, onclickFunction) {
    // Safely escape user data to prevent XSS issues
    const userJson = esc(JSON.stringify(user));
    const fullName = esc(user.full_name || user.username);
    const username = esc(user.username);

    return `
        <div class="search-result" onclick='${onclickFunction}(${userJson})'>
            ${avatarHTML(user.full_name || user.username, user.photo_url || null, 40)}
            <div>
                <div style="font-weight:600;font-size:15px">${fullName}</div>
                <div style="font-size:12px;color:#7d8590">@${username}</div>
            </div>
        </div>`;
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

function setReqTab(tab) {
  reqTab = tab;
  ['scan','type','upload'].forEach(t => {
    const tabBtn = document.getElementById('req-tab-'+t);
    if (tabBtn) tabBtn.classList.toggle('active', t===tab);
    const tabContent = document.getElementById('req-'+t);
    if (tabContent) tabContent.style.display = t===tab ? 'block' : 'none';
  });
  
  document.getElementById('req-amount-step').style.display = 'none';
  document.querySelector('#req-overlay .tab-row').style.display = 'flex';
  document.querySelector('#req-overlay .sheet-sub').style.display = 'block';

  if (tab !== 'scan' && camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  if (tab === 'scan') {
    startReqCamera();
  }
}

async function searchUsers(q) {
  clearTimeout(searchTimer);
  const res = document.getElementById('req-results');
  if (!q||q.length<2) { res.innerHTML=''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const [byPhone, byUser, byFullName] = await Promise.all([
        sb(`profiles?phone=ilike.*${encodeURIComponent(q)}*&limit=5&select=id,username,full_name,phone,photo_url,is_demo,created_by`).catch(()=>[]),
        sb(`profiles?username=ilike.*${encodeURIComponent(q)}*&limit=5&select=id,username,full_name,phone,photo_url,is_demo,created_by`).catch(()=>[]),
        sb(`profiles?full_name=ilike.*${encodeURIComponent(q)}*&limit=5&select=id,username,full_name,phone,photo_url,is_demo,created_by`).catch(()=>[])
      ]);
      const merged = [...(byPhone||[]),...(byUser||[]), ...(byFullName||[])];
      const unique = merged.filter((p,i,a)=>p.id!==ME.id && (!p.is_demo || p.created_by === ME.id) && a.findIndex(x=>x.id===p.id)===i).slice(0,5);
      res.innerHTML = unique.map(p => renderSearchResult(p, 'selectReqUser')).join('');
    } catch {}
  }, 350);
}

function selectReqUser(user, usernameArg, fullNameArg, phoneArg, photoArg) {
  const normalizedUser = typeof user === 'object' && user !== null && !Array.isArray(user)
    ? user
    : {
        id: user,
        username: usernameArg,
        full_name: fullNameArg,
        phone: phoneArg,
        photo_url: photoArg
      };

  const { id, username, full_name, phone, photo_url } = normalizedUser;
  foundReqProfile = normalizedUser;

  document.getElementById('req-found-card').innerHTML = `
    ${avatarHTML(full_name || username, photo_url || null, 48)}
    <div style="flex:1">
      <div style="font-weight:700;font-size:17px">${esc(username || '')}</div>
      <div style="font-size:13px;color:#7d8590">${esc(phone || '')}</div>
    </div>`;
  
  document.querySelector('#req-overlay .tab-row').style.display = 'none';
  document.querySelector('#req-overlay .sheet-sub').style.display = 'none';
  ['req-scan', 'req-type', 'req-upload'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('req-amount-step').style.display='block';
}

function resetReqStep() {
  foundReqProfile=null;
  document.getElementById('req-search').value='';
  document.getElementById('req-results').innerHTML='';
  document.getElementById('req-amount-step').style.display='none';
  document.getElementById('req-amount').value='';
  document.getElementById('req-note').value='';
  
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  barcodeDetector = null;
  setReqTab('type');
}

async function submitRequest() {
  const amountValue = document.getElementById('req-amount').value.replace(/\s/g, '');
  const amount = parseFloat(amountValue);
  const note = document.getElementById('req-note').value.trim();
  if (!amount || isNaN(amount) || amount <= 0) return toast(t('error_invalid_amount'), 'e');
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

async function startReqCamera() {
    if (camStream) return;
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            if (permissionStatus.state === 'denied') {
                toast('Camera access is blocked. Please allow it in your browser settings.', 'e');
                setReqTab('type');
                return;
            }
        }
        camStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
        const vid = document.getElementById('req-cam-video');
        vid.srcObject = camStream;
        vid.onloadedmetadata = () => {
            vid.play();
            document.getElementById('req-cam-view').style.display = 'block';
            document.getElementById('req-cam-start-btn').style.display = 'none';
            if ('BarcodeDetector' in window) {
                barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
                requestAnimationFrame(scanReqWithBarcodeDetector);
            } else {
                requestAnimationFrame(scanReqQR);
            }
        };
    } catch(e) {
        let msg = 'Could not start camera. Please use Type or Upload instead.';
        if (e.name === 'NotAllowedError') msg = 'Camera permission denied.';
        else if (e.name === 'NotFoundError') msg = 'No camera found on this device.';
        toast(msg, 'e');
        setReqTab('type');
    }
}

async function scanReqWithBarcodeDetector() {
    const video = document.getElementById('req-cam-video');
    if (video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector) {
        try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
                if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
                barcodeDetector = null;
                resolveReqUsername(barcodes[0].rawValue.trim());
                return;
            }
        } catch (e) {
            console.error('BarcodeDetector error:', e);
        }
    }
    if (camStream) {
        requestAnimationFrame(scanReqWithBarcodeDetector);
    }
}

function scanReqQR() {
    const video = document.getElementById('req-cam-video');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
            if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
            resolveReqUsername(code.data.trim());
            return;
        }
    }
    if (camStream) { requestAnimationFrame(scanReqQR); }
}

async function handleReqQRUpload(e) {
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
                resolveReqUsername(code.data.trim());
            } else {
                toast(t('error_no_qr_in_image'), 'e');
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(f);
}

async function resolveReqUsername(usernameOrUrl) {
    let username = usernameOrUrl.trim();
    try {
        const url = new URL(username);
        if (url.searchParams.has('user')) {
            username = url.searchParams.get('user').trim();
        }
    } catch (e) {}

    if (!username) { return toast(t('error_empty_qr'), 'e'); }

    try {
        const rows = await sb(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
        if (!rows?.length) { return toast(t('error_user_not_found').replace('{who}', esc(username)), 'e'); }
        const p = rows[0];
        selectReqUser(p.id, p.username, p.full_name, p.phone, p.photo_url);
    } catch (e) {
        toast(e.message || 'Lookup failed', 'e');
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// REALTIME NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
function setupRealtime() {
  if (!ME || sbClient) return;

  sbClient = supabase.createClient(SB_URL, SB_KEY);

  console.log('Setting up realtime subscriptions...');

  // A single channel for all database changes related to this user
  const channel = sbClient.channel(`user-channel-${ME.id}`);

  channel
    // 1. Listen for ANY change to transactions involving the user.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `or=(from_id.eq.${ME.id},to_id.eq.${ME.id})` }, payload => {
        console.log('Realtime: transaction change detected.', payload);

        // The 'new_tx' broadcast event now handles the initial notification.
        // This listener will now primarily handle updates and ensure data consistency.

        // if (payload.eventType === 'INSERT' && payload.new.to_id === ME.id) {
        //     // A new payment or borrow request was sent to me. Show a toast.
        //     const who = payload.new.from_name || t('someone');
        //     const title = payload.new.type === 'pay'
        //         ? t('notif_pay_desc').replace('{who}', who)
        //         : t('notif_request_desc').replace('{who}', who);
        //     const body = `${riel(payload.new.amount)}` + (payload.new.note ? `\nNote: "${payload.new.note}"` : '');

        //     toast(title, 'i');
        //     playNotificationSound();

        //     // Send a browser notification if the window is not in focus
        //     if (document.hidden && Notification.permission === 'granted') {
        //         new Notification(title, {
        //             body: body,
        //             icon: '/path/to/your/app_icon.png' // Optional: Add an icon URL
        //         });
        //     }
        /* } else */ if (payload.eventType === 'UPDATE' && payload.new.from_id === ME.id && payload.old.status === 'pending' && payload.new.status !== 'pending') {
            // A request I sent was just accepted or declined.
            const toName = payload.new.to_name || t('someone');
            const statusText = payload.new.status; // 'accepted' or 'declined'
            toast(t('request_status_updated').replace('{who}', toName).replace('{status}', statusText), 'i');
            playNotificationSound();
        }

        loadData(); // Reload all data to reflect the change instantly.
    })
    // 3. Listen for ANY change to the debts ledger to keep balances live
    .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `or=(user_a.eq.${ME.id},user_b.eq.${ME.id})` }, () => {
        console.log('Realtime: debt ledger changed, reloading data.');
        loadData();
    })
    // 4. Listen for updates to merge requests you initiated.
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merge_requests', filter: `requested_by_id=eq.${ME.id}` }, (payload) => {
        if (payload.old.status === 'pending' && payload.new.status !== 'pending') {
            const toastMessage = payload.new.status === 'accepted' ? t('merge_success_toast') : t('merge_declined_toast');
            toast(toastMessage, payload.new.status === 'accepted' ? 's' : 'i');
            playNotificationSound();
            loadData(); // Reload data to reflect the change.
        }
    })
    // 6. Listen for the new direct transaction broadcast events.
    .on('broadcast', { event: 'new_tx' }, async ({ payload }) => {
        console.log('Realtime: new_tx broadcast received.', payload);
        const { from_fullname, from_username, tx } = payload;
        const who = from_fullname || from_username || t('someone');
        const title = tx.type === 'pay'
            ? t('notif_pay_desc').replace('{who}', who)
            : t('notif_request_desc').replace('{who}', who);
        const body = `${riel(tx.amount)}` + (tx.note ? `\nNote: "${tx.note}"` : '');

        toast(title, 'i');
        playNotificationSound();

        if (document.hidden && Notification.permission === 'granted') {
            const notification = new Notification(title, { body, icon: '/path/to/your/app_icon.png' });
            setTimeout(() => notification.close(), 3000);
        }

        // Refresh data to show the new notification in the list.
        await loadData();

        // If the new transaction is a borrow request, open the notification panel.
        if (tx.type === 'request' || tx.type === 'pay') {
            openNotif();
        }
    })
    .on('broadcast', { event: 'tx_status_changed' }, async ({ payload }) => {
        console.log('Realtime: tx_status_changed received.', payload);
        const who = payload.from_fullname || payload.from_username || t('someone');
        const message = payload.status === 'accepted'
            ? t('tx_status_changed_accepted').replace('{who}', who)
            : t('tx_status_changed_declined').replace('{who}', who);

        toast(message, payload.status === 'accepted' ? 's' : 'i');
        playNotificationSound();

        if (document.hidden && Notification.permission === 'granted') {
            new Notification(message, { icon: '/path/to/your/app_icon.png' });
        }

        await loadData();
    })
    // 5. Listen for direct 'nudge' broadcast events.
    .on('broadcast', { event: 'nudge' }, ({ payload }) => {
        console.log('Realtime: nudge received.', payload);
        const who = payload.from_fullname || payload.from_username || t('someone');
        const message = t('notif_nudge').replace('{who}', who);

        toast(message, 'i');
        playNotificationSound();

        if (document.hidden && Notification.permission === 'granted') {
            new Notification(message, { icon: '/path/to/your/app_icon.png' });
        }
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

function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            console.log('Notification permission already granted.');
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                }
            });
        }
    } else {
        console.log('This browser does not support desktop notification');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAY + SCREEN NAV
// ═══════════════════════════════════════════════════════════════════════════
function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) {
  document.getElementById(id).classList.remove('open'); // This line is correct
  if (id==='pay-overlay' && camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
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
    if (fromId === 'profile-screen' && id !== 'profile-screen') { isContactsEditing = false; }
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

function resetInactivityTimer() {
    if (appIsLocked) return;
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.log("User inactive for 15 minutes. Locking app.");
        appIsLocked = true;
        promptForPin({
            action: 'unlockApp',
            titleKey: 'session_expired_title',
            subtitleKey: 'session_expired_sub'
        });
        // Make the overlay non-dismissible
        const pinOverlay = document.getElementById('pin-prompt-overlay');
        pinOverlay.onclick = null; // Remove the close handler
        const cancelButton = pinOverlay.querySelector('.btn-ghost');
        if (cancelButton) cancelButton.style.display = 'none';

    }, INACTIVITY_TIMEOUT);
}

function setupActivityListeners() {
    ['click', 'keydown', 'touchstart'].forEach(eventType => {
        window.addEventListener(eventType, resetInactivityTimer, true);
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
buildNumpad();

// --- Real-time Phone Number Validation ---
document.getElementById('phone-input').addEventListener('input', (e) => {
    const input = e.target;
    const phone = input.value.trim();
    const phoneRegex = /^(\+855|0)[1-9]\d{7,8}$/;
    if (phone.length > 0 && !phoneRegex.test(phone)) {
        input.style.borderColor = '#ff8080'; // Red border for invalid
    } else {
        input.style.borderColor = ''; // Reset to default
    }
});

// --- Event Listeners for Username Generation ---
document.getElementById('fullname-input').addEventListener('input', () => {
    const fullname = document.getElementById('fullname-input').value;
    const usernameInput = document.getElementById('username-input');
    if (fullname.trim()) {
        usernameInput.value = generateUsername(fullname);
        checkUsernameAvailability(); // Check the generated username
    }
});

document.getElementById('username-input').addEventListener('input', () => {
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(checkUsernameAvailability, 400); // Debounced check
});

function formatAmountInput(inputElement) {
    let value = inputElement.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (value) {
        // Format with spaces
        let formattedValue = value.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        inputElement.value = formattedValue;
    } else {
        inputElement.value = '';
    }
}

document.getElementById('pay-amount').addEventListener('input', (e) => formatAmountInput(e.target));
document.getElementById('req-amount').addEventListener('input', (e) => formatAmountInput(e.target));


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
      resetInactivityTimer();
      setupActivityListeners();
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
