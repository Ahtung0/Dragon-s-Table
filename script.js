const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6e7D1IQv0xlmISW8BWM7y7yQSqxMPNUiCzNmaf5DXAa_3LaQpT39V6YNpNEsCRPDw/exec'; // ⚠️ Оновіть після Deploy

let state = {
    room: null,
    me: { id: null, name: null },
    role: null,
    intervalId: null
};

// --- Ініціалізація при завантаженні сторінки ---
window.onload = function() {
    loadSession();
};

// --- Основні функції ---

async function createRoom() {
    const name = getNameInput();
    if(!name) return;
    
    // Генеруємо новий ID, якщо його немає
    if(!state.me.id) state.me.id = generateUUID();
    state.me.name = name;
    saveSession(); // Зберігаємо в браузері

    toggleLoader(true);
    const data = await apiCall('create_room', { 
        playerName: state.me.name, 
        userId: state.me.id 
    });
    toggleLoader(false);

    if(data.status === 'success') {
        startGame(data.roomCode, data.role);
    } else {
        showError('Помилка сервера');
    }
}

async function joinRoom(codeFromInput = null) {
    const name = getNameInput();
    // Якщо код не передали явно, беремо з поля вводу
    const code = codeFromInput || document.getElementById('roomCodeInput').value.trim().toUpperCase();
    
    if(!name || !code) { showError('Введіть ім\'я та код!'); return; }

    if(!state.me.id) state.me.id = generateUUID();
    state.me.name = name;
    saveSession();

    toggleLoader(true);
    const data = await apiCall('join_room', { 
        playerName: state.me.name, 
        userId: state.me.id,
        roomCode: code 
    });
    toggleLoader(false);

    if(data.status === 'success') {
        startGame(code, data.role);
    } else {
        showError(data.message || 'Кімнату не знайдено');
        // Якщо кімната не знайдена, можливо варто очистити збережену кімнату
        if(codeFromInput) {
            localStorage.removeItem('dnd_room');
            location.reload(); // Перезавантажити, щоб показати меню входу
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

// --- Управління сесією ---

function loadSession() {
    const savedId = localStorage.getItem('dnd_id');
    const savedName = localStorage.getItem('dnd_name');
    const savedRoom = localStorage.getItem('dnd_room');

    if (savedId && savedName) {
        state.me.id = savedId;
        state.me.name = savedName;
        
        // Автозаповнення поля імені
        document.getElementById('playerName').value = savedName;

        // Якщо є збережена кімната - пробуємо відновитися
        if (savedRoom) {
            console.log("Знайдено активну сесію, відновлюємо...");
            joinRoom(savedRoom);
        }
    }
}

function saveSession() {
    localStorage.setItem('dnd_id', state.me.id);
    localStorage.setItem('dnd_name', state.me.name);
}

function logout() {
    if(confirm('Вийти з акаунту? Це видалить ваш прогрес на цьому пристрої.')) {
        localStorage.clear();
        location.reload();
    }
}

// --- Логіка Гри ---

function startGame(roomCode, role) {
    state.room = roomCode;
    state.role = role;
    
    // Запам'ятовуємо кімнату, щоб повернутися після F5
    localStorage.setItem('dnd_room', roomCode);

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('fade-in');

    document.getElementById('displayRoomCode').innerText = roomCode;

    refreshState();
    state.intervalId = setInterval(refreshState, 3000);
}

async function refreshState() {
    if(!state.room) return;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=get_state&roomCode=${state.room}`);
        const data = await response.json();

        if(data.status === 'success') {
            // Оновлюємо свою роль
            const meObj = data.players.find(p => p.id === state.me.id);
            if(meObj) {
                state.role = meObj.role;
                updateHeaderUI();
            }
            renderPlayers(data.players);
        }
    } catch(e) { console.error(e); }
}

// --- UI та Хелпери ---

function updateHeaderUI() {
    const roleText = state.role === 'GM' ? '👑 Game Master' : '👤 Гравець';
    // Додаємо кнопку виходу
    const logoutBtn = ` <button onclick="logout()" style="font-size:0.5em; background:#444; border:none; color:#fff; cursor:pointer;">(Вихід)</button>`;
    document.getElementById('roleDisplay').innerHTML = roleText + logoutBtn;
}

function renderPlayers(players) {
    const list = document.getElementById('playersList');
    list.innerHTML = players.map(p => {
        const isGM = p.role === 'GM';
        const isMe = p.id === state.me.id;
        
        let actions = '';
        // Передача корони: використовую ID замість імені
        if(state.role === 'GM' && !isMe && !isGM) {
            actions = `<button class="btn-transfer" onclick="transferGM('${p.id}')">Коронувати</button>`;
        }

        return `
            <li class="${isGM ? 'gm' : ''}">
                <span>${isGM ? '👑' : '👤'} <b>${p.name}</b> ${isMe ? '(Ви)' : ''}</span>
                ${actions}
            </li>
        `;
    }).join('');
}

function getNameInput() {
    return document.getElementById('playerName').value.trim();
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Функції API та Loader (ті самі, що й раніше)
async function apiCall(action, params = {}) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', action);
    for(const key in params) url.searchParams.append(key, params[key]);
    try {
        const res = await fetch(url, { method: 'POST' });
        return await res.json();
    } catch(e) { return { status: 'error' }; }
}
function toggleLoader(show) {
    const loader = document.getElementById('loader');
    if(show) loader.classList.remove('hidden'); else loader.classList.add('hidden');
}
function showError(msg) {
    const el = document.getElementById('error-msg');
    el.innerText = msg;
    setTimeout(() => el.innerText = '', 5000);
}
