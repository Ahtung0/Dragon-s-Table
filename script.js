// ⚠️ Ваш Proxy URL
const SCRIPT_URL = '/.netlify/functions/proxy'; 

let user = {
    id: null,
    name: null,
    room: null,
    role: null
};

let intervalId = null;

// --- СТАРТ ---
window.onload = function() {
    // Перевіряємо, чи ми вже залогінені
    const savedId = localStorage.getItem('rpg_uid');
    const savedName = localStorage.getItem('rpg_name');
    
    if (savedId && savedName) {
        user.id = savedId;
        user.name = savedName;
        showDashboard();
    }
};

// --- АВТОРИЗАЦІЯ ---

async function doLogin() {
    const name = document.getElementById('authName').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    if(!name || !pass) return showError('Введіть логін і пароль');

    toggleLoader(true);
    const data = await apiCall('login', { username: name, password: pass });
    toggleLoader(false);

    if (data.status === 'success') {
        saveUser(data.userId, data.username);
        
        // Якщо сервер повернув останню кімнату, можна запропонувати відновити гру
        if(data.lastRoom) {
            document.getElementById('roomCodeInput').value = data.lastRoom;
        }
        showDashboard();
    } else {
        showError(data.message);
    }
}

async function doRegister() {
    const name = document.getElementById('authName').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    if(!name || !pass) return showError('Введіть дані для реєстрації');

    toggleLoader(true);
    const data = await apiCall('register', { username: name, password: pass });
    toggleLoader(false);

    if (data.status === 'success') {
        alert('Акаунт створено! Тепер увійдіть.');
        // Можна одразу логінити, але для надійності хай введуть ще раз або просто:
        saveUser(data.userId, data.username);
        showDashboard();
    } else {
        showError(data.message);
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

// --- УПРАВЛІННЯ КІМНАТАМИ ---

async function createRoom() {
    toggleLoader(true);
    const data = await apiCall('create_room', { 
        userId: user.id, 
        playerName: user.name 
    });
    toggleLoader(false);

    if(data.status === 'success') {
        enterGame(data.roomCode, data.role);
    } else {
        showError('Помилка створення');
    }
}

async function joinRoom() {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if(!code) return showError('Введіть код!');

    toggleLoader(true);
    const data = await apiCall('join_room', { 
        userId: user.id, 
        playerName: user.name,
        roomCode: code 
    });
    toggleLoader(false);

    if(data.status === 'success') {
        enterGame(code, data.role);
    } else {
        showError(data.message);
    }
}

// --- ГРА ---

function enterGame(roomCode, role) {
    user.room = roomCode;
    user.role = role;
    
    // ВИПРАВЛЕННЯ ТУТ: Ховаємо нове меню, а не старий дашборд
    document.getElementById('main-menu-screen').classList.add('hidden');
    
    // Показуємо екран гри
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.remove('hidden');
    gameScreen.classList.add('fade-in');
    
    document.getElementById('displayRoomCode').innerText = roomCode;
    
    refreshState();
    intervalId = setInterval(refreshState, 3000);
}

function leaveRoom() {
    if(!confirm("Ви точно хочете вийти в меню?")) return;

    clearInterval(intervalId);
    user.room = null;
    
    // Ховаємо гру
    document.getElementById('game-screen').classList.add('hidden');
    
    // ВИПРАВЛЕННЯ ТУТ: Показуємо головне меню
    showDashboard(); 
}

async function refreshState() {
    if(!user.room) return;
    try {
        const res = await fetch(`${SCRIPT_URL}?action=get_state&roomCode=${user.room}`);
        const data = await res.json();
        
        if(data.status === 'success') {
            const me = data.players.find(p => p.id === user.id);
            if(me) user.role = me.role;
            
            document.getElementById('roleDisplay').innerText = user.role === 'GM' ? '👑 GM' : '👤 Гравець';
            
            const list = document.getElementById('playersList');
            list.innerHTML = data.players.map(p => {
                const isGM = p.role === 'GM';
                return `<li class="${isGM ? 'gm' : ''}"><span>${isGM ? '👑' : '👤'} <b>${p.name}</b></span></li>`;
            }).join('');
        }
    } catch(e) {}
}

// --- УТИЛІТИ ---

function saveUser(id, name) {
    user.id = id;
    user.name = name;
    localStorage.setItem('rpg_uid', id);
    localStorage.setItem('rpg_name', name);
}

// --- НОВА ФУНКЦІЯ: Перемикання вкладок меню ---
// --- ОНОВЛЕНА ФУНКЦІЯ: Перемикання вкладок меню ---
function openMenuTab(tabName) {
    // 1. Ховаємо всі вкладки
    document.getElementById('tab-rooms').classList.add('hidden');
    document.getElementById('tab-profile').classList.add('hidden');
    
    // 2. Показуємо потрібну
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // 3. Оновлюємо кнопки (активний стан)
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Логіка змінилась, бо ми поміняли кнопки місцями в HTML:
    // buttons[0] тепер Профіль
    // buttons[1] тепер Кімнати
    if(tabName === 'profile') buttons[0].classList.add('active');
    if(tabName === 'rooms') buttons[1].classList.add('active');
}

// --- ОНОВЛЕНА ФУНКЦІЯ: showDashboard ---
function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    
    const menuScreen = document.getElementById('main-menu-screen');
    menuScreen.classList.remove('hidden');
    menuScreen.classList.add('fade-in');
    
    document.getElementById('dash-username').innerText = user.name;
    document.getElementById('error-msg').innerText = '';

    // ВАЖЛИВО: Відкриваємо профіль за замовчуванням
    openMenuTab('profile');
}

async function apiCall(action, params = {}) {
    const url = new URL(SCRIPT_URL, window.location.origin); // Коректний URL для проксі
    url.searchParams.append('action', action);
    for(const key in params) url.searchParams.append(key, params[key]);
    
    try {
        const res = await fetch(url, { method: 'POST' });
        return await res.json();
    } catch(e) { return { status: 'error', message: 'Зв\'язок втрачено' }; }
}

function toggleLoader(show) { document.getElementById('loader').classList.toggle('hidden', !show); }
function showError(msg) { document.getElementById('error-msg').innerText = msg; }
