// ⚠️ Ваш Proxy URL
const SCRIPT_URL = 'https://dnd-game-worker.illia-kushnir-2007.workers.dev'; 

let user = {
    id: null,
    name: null,
    room: null,
    role: null
};

let intervalId = null;

// --- СТАРТ ---
window.onload = function() {
    // Перевіряємо збережені дані
    const savedId = localStorage.getItem('rpg_uid');
    const savedName = localStorage.getItem('rpg_name');
    
    if (savedId && savedName) {
        user.id = savedId;
        user.name = savedName;
        showDashboard();
    }
};

// --- КОМУНІКАЦІЯ З СЕРВЕРОМ (СЕРЦЕ ГРИ) ---
async function apiCall(action, params = {}) {
    // Ми відправляємо дані як JSON об'єкт, бо новий сервер цього чекає
    const bodyData = { action, ...params };

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            throw new Error(`Server Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        return { status: 'error', message: 'Зв\'язок з сервером втрачено' };
    }
}

// --- АВТОРИЗАЦІЯ ---
let currentAuthMode = 'login'; 

function switchAuthMode(mode) {
    currentAuthMode = mode;
    document.getElementById('error-msg').innerText = '';
    document.getElementById('authPass').value = '';
    document.getElementById('authPassConfirm').value = '';

    document.getElementById('btn-tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('btn-tab-register').classList.toggle('active', mode === 'register');

    const confirmGroup = document.getElementById('group-pass-confirm');
    const submitBtn = document.getElementById('submitAuthBtn');

    if (mode === 'register') {
        confirmGroup.classList.remove('hidden');
        submitBtn.innerText = "Зареєструватися";
    } else {
        confirmGroup.classList.add('hidden');
        submitBtn.innerText = "Увійти";
    }
}

async function submitAuth() {
    const name = document.getElementById('authName').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    
    if(!name || !pass) return showError('Заповніть усі поля!');

    if (currentAuthMode === 'register') {
        const passConfirm = document.getElementById('authPassConfirm').value.trim();
        if (pass !== passConfirm) return showError('Паролі не співпадають!');

        toggleLoader(true);
        const data = await apiCall('register', { username: name, password: pass });
        toggleLoader(false);

        if (data.status === 'success') {
            alert('Акаунт успішно створено! Входимо...');
            saveUser(data.userId, data.username);
            showDashboard();
        } else {
            showError(data.message);
        }
    } else {
        toggleLoader(true);
        const data = await apiCall('login', { username: name, password: pass });
        toggleLoader(false);

        if (data.status === 'success') {
            saveUser(data.userId, data.username);
            if(data.lastRoom) {
                document.getElementById('roomCodeInput').value = data.lastRoom;
            }
            showDashboard();
        } else {
            showError(data.message);
        }
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
    
    document.getElementById('main-menu-screen').classList.add('hidden');
    
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
    document.getElementById('game-screen').classList.add('hidden');
    showDashboard(); 
}

// --- ГОЛОВНА ФУНКЦІЯ ОНОВЛЕННЯ ---
async function refreshState() {
    if(!user.room) return;
    
    // Використовуємо apiCall для стабільності
    const data = await apiCall('get_state', { roomCode: user.room });

    // Очищаємо "Завантаження...", якщо воно ще там
    const logContainer = document.getElementById('game-log');
    if (logContainer && logContainer.innerHTML.includes('Завантаження...')) {
        logContainer.innerHTML = '';
    }
    
    if(data.status === 'deleted') {
        alert('Майстер розпустив цю кімнату.');
        leaveRoom();
        return;
    }
    
    if(data.status === 'success') {
        const amIHere = data.players.find(p => p.id === user.id);
        if(!amIHere) {
            alert('Вас було вигнано з кімнати.');
            leaveRoom();
            return;
        }

        user.role = amIHere.role;
        document.getElementById('roleDisplay').innerText = user.role === 'GM' ? '👑 GM' : '👤 Гравець';
        
        // Панель GM
        if(user.role === 'GM') {
            document.getElementById('gm-controls').classList.remove('hidden');
        } else {
            document.getElementById('gm-controls').classList.add('hidden');
        }

        renderPlayers(data.players);
        renderLogs(data.logs);
    }
}

// --- ВІДОБРАЖЕННЯ ГРАВЦІВ ---
function renderPlayers(players) {
    try {
        // ВИПРАВЛЕНО ID: players-list (відповідно до HTML)
        const list = document.getElementById('players-list');
        if (!list) return;

        list.innerHTML = '';
        const myId = user.id;
        const amIGM = players.some(p => p.id === myId && p.role === 'GM');

        players.forEach(p => {
            const li = document.createElement('li');
            if (p.role === 'GM') li.classList.add('gm');

            const infoSpan = document.createElement('span');
            const icon = p.role === 'GM' ? '<span class="crown-icon">👑</span>' : '';
            const isMe = p.id === myId ? ' <small>(Ви)</small>' : '';
            
            infoSpan.innerHTML = `${icon} <strong>${p.name}</strong>${isMe}`;
            li.appendChild(infoSpan);

            // Кнопки управління (тільки для GM і не для себе)
            if (amIGM && p.id !== myId) {
                const actionsSpan = document.createElement('div');
                actionsSpan.style.display = 'flex';
                actionsSpan.style.gap = '5px';
                
                actionsSpan.innerHTML = `
                    <button class="btn-transfer" onclick="transferGM('${p.id}')" title="Передати корону">👑</button>
                    <button class="btn-kick" onclick="kickPlayer('${p.id}')" title="Вигнати">✕</button>
                `;
                li.appendChild(actionsSpan);
            }
            list.appendChild(li);
        });
    } catch (e) {
        console.error("Render Error:", e);
    }
}

// --- ВІДОБРАЖЕННЯ ЛОГІВ ---
function renderLogs(logs) {
    // ВИПРАВЛЕНО ID: game-log (відповідно до HTML)
    const container = document.getElementById('game-log');
    if (!container) return;

    if(!logs || logs.length === 0) {
        if (!container.hasChildNodes()) {
            container.innerHTML = '<div style="text-align:center; color:#555; margin-top:20px;">Історія ще не написана...</div>';
        }
        return;
    }

    // Рендеримо логи
    container.innerHTML = logs.map(l => `
        <div class="log-entry fade-in">
            <span class="log-time">[${l.time}]</span>
            <span class="log-text">${l.text}</span>
        </div>
    `).reverse().join(''); // Нові зверху (reverse), якщо хочете знизу - приберіть reverse()
}

// --- ДІЇ МАЙСТРА ---

async function transferGM(targetId) {
    if (!confirm('Ви точно хочете передати права GM? Ви втратите контроль.')) return;

    toggleLoader(true);
    try {
        const result = await apiCall('transfer_gm', {
            roomCode: user.room,
            userId: user.id,
            targetId: targetId
        });

        if (result.status === 'success') {
            alert('Корону передано!');
            await refreshState(); 
        } else {
            showError(result.message || 'Помилка');
        }
    } finally {
        toggleLoader(false);
    }
}

async function kickPlayer(targetId) {
    if(!confirm(`Вигнати цього гравця?`)) return;
    
    await apiCall('kick_player', {
        roomCode: user.room,
        userId: user.id,
        targetId: targetId
    });
    refreshState();
}

async function deleteRoom() {
    const code = prompt("Для видалення введіть код кімнати:");
    if(code !== user.room) return alert("Код невірний.");

    toggleLoader(true);
    await apiCall('delete_room', { roomCode: user.room, userId: user.id });
    toggleLoader(false);
    
    leaveRoom();
}

async function sendGmLog() {
    const input = document.getElementById('gmLogInput');
    const text = input.value.trim();
    if(!text) return;

    await apiCall('add_log', {
        roomCode: user.room,
        userId: user.id,
        text: text
    });
    input.value = ''; 
    refreshState();
}

// --- ІНТЕРФЕЙС ТА УТИЛІТИ ---

function saveUser(id, name) {
    user.id = id;
    user.name = name;
    localStorage.setItem('rpg_uid', id);
    localStorage.setItem('rpg_name', name);
}

function openMenuTab(tabName) {
    document.getElementById('tab-rooms').classList.add('hidden');
    document.getElementById('tab-profile').classList.add('hidden');
    
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // buttons[0] = Profile, buttons[1] = Rooms
    if(tabName === 'profile') buttons[0].classList.add('active');
    if(tabName === 'rooms') buttons[1].classList.add('active');
}

function showDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    
    const menuScreen = document.getElementById('main-menu-screen');
    menuScreen.classList.remove('hidden');
    menuScreen.classList.add('fade-in');
    
    document.getElementById('dash-username').innerText = user.name;
    document.getElementById('error-msg').innerText = '';

    openMenuTab('profile');
}

function toggleLoader(show) { document.getElementById('loader').classList.toggle('hidden', !show); }
function showError(msg) { document.getElementById('error-msg').innerText = msg; }
