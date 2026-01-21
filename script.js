// ⚠️ ВСТАВТЕ ТУТ ВАШЕ ПОСИЛАННЯ НА WORKER (наприклад https://dnd-game.vash-nik.workers.dev)
const SCRIPT_URL = 'https://dragonstable.erykalovnikita305.workers.dev'; 

let user = {
    id: null,
    name: null,
    room: null,
    role: null
};

let intervalId = null;
let lastLogState = '';
let currentAuthMode = 'login'; 

// --- СТАРТ ---
window.onload = function() {
    console.log("Script loaded successfully");
    const savedId = localStorage.getItem('rpg_uid');
    const savedName = localStorage.getItem('rpg_name');
    
    if (savedId && savedName) {
        user.id = savedId;
        user.name = savedName;
        showDashboard();
    }
};

// --- КОМУНІКАЦІЯ ---
async function apiCall(action, params = {}) {
    const bodyData = { action, ...params };

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Server raw response:", text);
            throw new Error(`Server Error: ${text.substring(0, 50)}...`);
        }
    } catch (error) {
        console.error("API Error:", error);
        return { status: 'error', message: error.message };
    }
}

// --- АВТОРИЗАЦІЯ ---
function switchAuthMode(mode) {
    currentAuthMode = mode;
    const errEl = document.getElementById('error-msg');
    if(errEl) errEl.innerText = '';
    
    const btnLogin = document.getElementById('btn-tab-login');
    const btnReg = document.getElementById('btn-tab-register');
    if(btnLogin) btnLogin.classList.toggle('active', mode === 'login');
    if(btnReg) btnReg.classList.toggle('active', mode === 'register');

    const confirmGroup = document.getElementById('group-pass-confirm');
    const captchaContainer = document.getElementById('captcha-container');
    const submitBtn = document.getElementById('submitAuthBtn');

    if (mode === 'register') {
        if(confirmGroup) confirmGroup.classList.remove('hidden');
        if(captchaContainer) captchaContainer.classList.remove('hidden');
        if(submitBtn) submitBtn.innerText = "Зареєструватися";
        // Скидаємо капчу при перемиканні
        if(window.turnstile) window.turnstile.reset();
    } else {
        if(confirmGroup) confirmGroup.classList.add('hidden');
        if(captchaContainer) captchaContainer.classList.add('hidden');
        if(submitBtn) submitBtn.innerText = "Увійти";
    }
}

async function submitAuth() {
    const nameInput = document.getElementById('authName');
    const passInput = document.getElementById('authPass');
    
    if(!nameInput || !passInput) return;
    
    const name = nameInput.value.trim();
    const pass = passInput.value.trim();
    
    if(!name || !pass) return showError('Заповніть усі поля!');

    if (currentAuthMode === 'register') {
        const passConfirmInput = document.getElementById('authPassConfirm');
        const passConfirm = passConfirmInput ? passConfirmInput.value.trim() : '';
        
        if (pass !== passConfirm) return showError('Паролі не співпадають!');

        // КАПЧА
        const turnstileInput = document.querySelector('[name="cf-turnstile-response"]');
        const token = turnstileInput ? turnstileInput.value : null;

        if (!token) {
            return showError('Будь ласка, пройдіть капчу (Я не робот)');
        }

        toggleLoader(true);
        // Використовуємо responseData замість data, щоб уникнути конфліктів
        const responseData = await apiCall('register', { username: name, password: pass, token: token });
        toggleLoader(false);

        if (responseData.status === 'success') {
            alert('Успіх! Тепер увійдіть.');
            switchAuthMode('login');
        } else {
            showError(responseData.message);
            if(window.turnstile) window.turnstile.reset();
        }
    } else {
        // ВХІД
        toggleLoader(true);
        const loginData = await apiCall('login', { username: name, password: pass });
        toggleLoader(false);

        if (loginData.status === 'success') {
            saveUser(loginData.userId, loginData.username);
            const roomInput = document.getElementById('roomCodeInput');
            if(roomInput && loginData.lastRoom) roomInput.value = loginData.lastRoom;
            showDashboard();
        } else {
            showError(loginData.message);
        }
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

// --- ІНТЕРФЕЙС ---
function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('main-menu-screen').classList.remove('hidden');
    document.getElementById('dash-username').innerText = user.name;
    openMenuTab('profile');
}

function openMenuTab(tabName) {
    const tabRooms = document.getElementById('tab-rooms');
    const tabProfile = document.getElementById('tab-profile');
    if(tabRooms) tabRooms.classList.add('hidden');
    if(tabProfile) tabProfile.classList.add('hidden');
    
    const target = document.getElementById(`tab-${tabName}`);
    if(target) target.classList.remove('hidden');
    
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Проста логіка кнопок
    if(tabName === 'profile' && buttons[0]) buttons[0].classList.add('active');
    if(tabName === 'rooms' && buttons[1]) buttons[1].classList.add('active');
}

// --- КІМНАТИ ---
async function createRoom() {
    toggleLoader(true);
    const res = await apiCall('create_room', { userId: user.id, playerName: user.name });
    toggleLoader(false);

    if(res.status === 'success') enterGame(res.roomCode, res.role);
    else showError('Помилка створення');
}

async function joinRoom() {
    const codeInput = document.getElementById('roomCodeInput');
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if(!code) return showError('Введіть код!');

    toggleLoader(true);
    const res = await apiCall('join_room', { userId: user.id, playerName: user.name, roomCode: code });
    toggleLoader(false);

    if(res.status === 'success') enterGame(code, res.role);
    else showError(res.message);
}

// --- ГРА ---
function enterGame(roomCode, role) {
    user.room = roomCode;
    user.role = role;
    
    document.getElementById('main-menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const codeDisp = document.getElementById('displayRoomCode');
    if(codeDisp) codeDisp.innerText = roomCode;
    
    refreshState();
    if(intervalId) clearInterval(intervalId);
    intervalId = setInterval(refreshState, 3000);
}

function leaveRoom() {
    if(!confirm("Вийти в меню?")) return;
    if(intervalId) clearInterval(intervalId);
    user.room = null;
    document.getElementById('game-screen').classList.add('hidden');
    showDashboard(); 
}

async function refreshState() {
    if(!user.room) return;
    
    const data = await apiCall('get_state', { roomCode: user.room });
    
    const logDiv = document.getElementById('game-log');
    if(logDiv && logDiv.innerHTML.includes('Завантаження')) logDiv.innerHTML = '';

    if(data.status === 'deleted') {
        alert('Кімнату видалено');
        leaveRoom();
        return;
    }
    
    if(data.status === 'success') {
        const me = data.players.find(p => p.id === user.id);
        if(!me) { alert('Вас вигнали'); leaveRoom(); return; }

        user.role = me.role;
        const roleEl = document.getElementById('roleDisplay');
        if(roleEl) roleEl.innerText = user.role === 'GM' ? '👑 GM' : '👤 Гравець';
        
        const gmControls = document.getElementById('gm-controls');
        if(gmControls) {
            if(user.role === 'GM') gmControls.classList.remove('hidden');
            else gmControls.classList.add('hidden');
        }

        renderPlayers(data.players);
        renderLogs(data.logs);
    }
}

function renderPlayers(players) {
    const list = document.getElementById('players-list');
    if (!list) return;
    list.innerHTML = '';

    const amIGM = players.some(p => p.id === user.id && p.role === 'GM');

    players.forEach(p => {
        const li = document.createElement('li');
        if (p.role === 'GM') li.classList.add('gm');

        const icon = p.role === 'GM' ? '👑' : '';
        const isMe = p.id === user.id ? ' <small>(Ви)</small>' : '';
        
        let buttonsHtml = '';
        if (amIGM && p.id !== user.id) {
            buttonsHtml = `
                <div style="display:inline-flex; gap:5px; margin-left:10px;">
                    <button onclick="transferGM('${p.id}')" title="Передати">👑</button>
                    <button onclick="kickPlayer('${p.id}')" title="Вигнати">✕</button>
                </div>
            `;
        }

        li.innerHTML = `<span>${icon} <strong>${p.name}</strong>${isMe}</span>${buttonsHtml}`;
        list.appendChild(li);
    });
}

function renderLogs(logs) {
    const container = document.getElementById('game-log');
    if (!container) return;

    if (!logs || logs.length === 0) {
        if(!container.innerHTML.includes('Історія')) 
            container.innerHTML = '<div style="text-align:center; color:#555;">Історія порожня...</div>';
        return;
    }

    const newState = JSON.stringify(logs);
    if (newState === lastLogState) return;
    lastLogState = newState;

    container.innerHTML = logs.map(l => `
        <div class="log-entry fade-in">
            <span class="log-time">[${l.time}]</span>
            <span class="log-text">${l.text}</span>
        </div>
    `).reverse().join('');
}

// --- ДІЇ GM ---
async function transferGM(targetId) {
    if (!confirm('Передати корону?')) return;
    await apiCall('transfer_gm', { roomCode: user.room, userId: user.id, targetId });
    refreshState();
}

async function kickPlayer(targetId) {
    if(!confirm('Вигнати?')) return;
    await apiCall('kick_player', { roomCode: user.room, userId: user.id, targetId });
    refreshState();
}

async function deleteRoom() {
    const code = prompt("Введіть код кімнати для видалення:");
    if(code !== user.room) return;
    await apiCall('delete_room', { roomCode: user.room, userId: user.id });
    leaveRoom();
}

async function sendGmLog() {
    const input = document.getElementById('gmLogInput');
    const text = input ? input.value.trim() : '';
    if(!text) return;
    await apiCall('add_log', { roomCode: user.room, userId: user.id, text });
    if(input) input.value = '';
    refreshState();
}

// --- УТИЛІТИ ---
function saveUser(id, name) {
    user.id = id;
    user.name = name;
    localStorage.setItem('rpg_uid', id);
    localStorage.setItem('rpg_name', name);
}

function toggleLoader(show) { 
    const l = document.getElementById('loader');
    if(l) l.classList.toggle('hidden', !show); 
}

function showError(msg) { 
    const err = document.getElementById('error-msg');
    const authScreen = document.getElementById('auth-screen');
    if(err && authScreen && !authScreen.classList.contains('hidden')) {
        err.innerText = msg;
    } else {
        alert(msg);
    }
}
