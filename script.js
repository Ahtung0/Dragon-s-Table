// ⚠️ ВАЖЛИВО: Оновіть URL
const SCRIPT_URL = '/.netlify/functions/proxy';

let state = {
    room: null,
    me: { id: null, name: null },
    role: null,
    intervalId: null
};

window.onload = function() { loadSession(); };

// --- Основні функції ---

async function createRoom() {
    const { name, pass } = getAuthData();
    if(!name || !pass) return alert('Введіть ім\'я та придумайте пароль!');
    
    toggleLoader(true);
    // Відправляємо пароль при створенні
    const data = await apiCall('create_room', { playerName: name, password: pass });
    toggleLoader(false);

    if(data.status === 'success') {
        saveSession(data.userId, name); // Зберігаємо ID, який видав сервер
        startGame(data.roomCode, data.role);
    } else {
        showError('Помилка сервера');
    }
}

async function joinRoom(codeFromInput = null) {
    const { name, pass } = getAuthData();
    const code = codeFromInput || document.getElementById('roomCodeInput').value.trim().toUpperCase();
    
    // Якщо це авто-вхід (без введення пароля руками), ми використовуємо ID з пам'яті
    const isAutoLogin = codeFromInput && state.me.id; 

    if(!isAutoLogin && (!name || !pass)) {
        showError('Введіть ім\'я та пароль!');
        return;
    }

    toggleLoader(true);
    
    const params = { 
        roomCode: code,
        playerName: name,
        password: pass, // Відправляємо пароль
        userId: state.me.id // Відправляємо старий ID (якщо є)
    };

    const data = await apiCall('join_room', params);
    toggleLoader(false);

    if(data.status === 'success') {
        saveSession(data.userId, name); // Оновлюємо сесію
        startGame(code, data.role);
    } else {
        showError(data.message || 'Помилка входу');
        if(data.message && data.message.includes('пароль')) {
            // Якщо помилка в паролі - очищаємо ID, щоб змусити ввести пароль
            localStorage.removeItem('dnd_id'); 
            state.me.id = null;
        }
    }
}

async function transferGM(targetId) {
    if(!confirm(`Передати владу?`)) return;
    await apiCall('transfer_gm', { 
        roomCode: state.room, 
        userId: state.me.id, 
        targetId: targetId 
    });
    refreshState();
}

// --- Утиліти ---

function getAuthData() {
    return {
        name: document.getElementById('playerName').value.trim(),
        pass: document.getElementById('playerPass').value.trim()
    };
}

function saveSession(id, name) {
    state.me.id = id;
    state.me.name = name;
    localStorage.setItem('dnd_id', id);
    localStorage.setItem('dnd_name', name);
}

function loadSession() {
    const savedId = localStorage.getItem('dnd_id');
    const savedName = localStorage.getItem('dnd_name');
    const savedRoom = localStorage.getItem('dnd_room');

    if (savedId && savedName) {
        state.me.id = savedId;
        state.me.name = savedName;
        document.getElementById('playerName').value = savedName;
        // Пароль не відновлюємо в поле вводу (безпека), але він і не потрібен, якщо є ID
        
        if (savedRoom) {
            console.log("Відновлення сесії...");
            joinRoom(savedRoom); 
        }
    }
}

function logout() {
    if(confirm('Вийти?')) {
        localStorage.clear();
        location.reload();
    }
}

function startGame(roomCode, role) {
    state.room = roomCode;
    state.role = role;
    localStorage.setItem('dnd_room', roomCode);

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('fade-in');
    document.getElementById('displayRoomCode').innerText = roomCode;

    refreshState();
    if(state.intervalId) clearInterval(state.intervalId);
    state.intervalId = setInterval(refreshState, 3000);
}

async function refreshState() {
    if(!state.room) return;
    try {
        const response = await fetch(`${SCRIPT_URL}?action=get_state&roomCode=${state.room}`);
        const data = await response.json();
        if(data.status === 'success') {
            const meObj = data.players.find(p => p.id === state.me.id);
            if(meObj) {
                state.role = meObj.role;
                updateHeaderUI();
            }
            renderPlayers(data.players);
        }
    } catch(e) {}
}

function updateHeaderUI() {
    const roleText = state.role === 'GM' ? '👑 GM' : '👤 Гравець';
    document.getElementById('roleDisplay').innerHTML = `${roleText} <button onclick="logout()" style="margin-left:10px; font-size:0.6em; cursor:pointer; background:none; border:1px solid #555; color:#aaa;">Вихід</button>`;
}

function renderPlayers(players) {
    const list = document.getElementById('playersList');
    list.innerHTML = players.map(p => {
        const isGM = p.role === 'GM';
        const isMe = p.id === state.me.id;
        let actions = '';
        if(state.role === 'GM' && !isMe && !isGM) {
            actions = `<button class="btn-transfer" onclick="transferGM('${p.id}')">Коронувати</button>`;
        }
        return `<li class="${isGM ? 'gm' : ''}"><span>${isGM ? '👑' : '👤'} <b>${p.name}</b> ${isMe ? '(Ви)' : ''}</span>${actions}</li>`;
    }).join('');
}

async function apiCall(action, params = {}) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', action);
    for(const key in params) url.searchParams.append(key, params[key]);
    try {
        const res = await fetch(url, { method: 'POST' });
        return await res.json();
    } catch(e) { return { status: 'error' }; }
}
function toggleLoader(show) { document.getElementById('loader').classList.toggle('hidden', !show); }
function showError(msg) { 
    const el = document.getElementById('error-msg'); 
    el.innerText = msg; 
    setTimeout(() => el.innerText = '', 5000); 
}
