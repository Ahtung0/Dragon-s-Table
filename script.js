// ⚠️ Ваш Proxy URL
const SCRIPT_URL = 'https://dragonstable.erykalovnikita305.workers.dev'; 

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

// --- Змінна для збереження поточного режиму ---
let currentAuthMode = 'login'; // 'login' або 'register'

// --- ФУНКЦІЯ: Перемикання режиму (Вхід / Реєстрація) ---
function switchAuthMode(mode) {
    currentAuthMode = mode;
    
    // Очищаємо поля та помилки
    document.getElementById('error-msg').innerText = '';
    document.getElementById('authPass').value = '';
    document.getElementById('authPassConfirm').value = '';

    // Оновлюємо кнопки вкладок
    document.getElementById('btn-tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('btn-tab-register').classList.toggle('active', mode === 'register');

    // Показуємо/ховаємо поле підтвердження пароля
    const confirmGroup = document.getElementById('group-pass-confirm');
    const submitBtn = document.getElementById('submitAuthBtn');

    if (mode === 'register') {
        confirmGroup.classList.remove('hidden');
        submitBtn.innerText = "Зареєструватися";
        // МИ БІЛЬШЕ НЕ ЗМІНЮЄМО КОЛІР КНОПКИ ТУТ
    } else {
        confirmGroup.classList.add('hidden');
        submitBtn.innerText = "Увійти";
    }
}

// --- ФУНКЦІЯ: Відправка форми ---
async function submitAuth() {
    const name = document.getElementById('authName').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    
    if(!name || !pass) return showError('Заповніть усі поля!');

    // ЛОГІКА РЕЄСТРАЦІЇ
    if (currentAuthMode === 'register') {
        const passConfirm = document.getElementById('authPassConfirm').value.trim();
        
        if (pass !== passConfirm) {
            return showError('Паролі не співпадають!');
        }

        toggleLoader(true);
        // Викликаємо API реєстрації
        const data = await apiCall('register', { username: name, password: pass });
        toggleLoader(false);

        if (data.status === 'success') {
            alert('Акаунт успішно створено! Входимо...');
            saveUser(data.userId, data.username);
            showDashboard();
        } else {
            showError(data.message);
        }
    } 
    // ЛОГІКА ВХОДУ
    else {
        toggleLoader(true);
        // Викликаємо API входу
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

async function transferGM(targetId) {
    if (!confirm('Ви точно хочете передати права GM цьому гравцю? Ви втратите контроль над кімнатою.')) return;

    toggleLoader(true);
    
    try {
        // Відправляємо команду на сервер
        const result = await apiCall('transfer_gm', {
            roomCode: currentRoomCode,
            userId: user.id,     // Я (поточний GM)
            targetId: targetId   // Новий GM
        });

        if (result.status === 'success') {
            alert('Корону успішно передано!');
            // Одразу оновлюємо стан, щоб інтерфейс перемалювався
            await refreshState(); 
        } else {
            showError(result.message || 'Помилка передачі прав');
        }
    } catch (e) {
        console.error(e);
        showError("Сталася помилка з'єднання");
    } finally {
        // Цей код виконається ЗАВЖДИ, тому спінер зникне
        toggleLoader(false);
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

// --- ФУНКЦІЇ МАЙСТРА ---

async function kickPlayer(targetId, targetName) {
    if(!confirm(`Вигнати гравця ${targetName}?`)) return;
    
    await apiCall('kick_player', {
        roomCode: user.room,
        userId: user.id,
        targetId: targetId
    });
    // refreshState оновить список автоматично
}

async function deleteRoom() {
    const code = prompt("Для видалення введіть код кімнати:");
    if(code !== user.room) return alert("Код невірний. Скасування.");

    toggleLoader(true);
    await apiCall('delete_room', { roomCode: user.room, userId: user.id });
    toggleLoader(false);
    
    leaveRoom(); // Виходимо самі
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
    input.value = ''; // Очистити поле
    refreshState();
}

// --- ОНОВЛЕНА ФУНКЦІЯ refreshState ---

async function refreshState() {
    if(!user.room) return;
    try {
        const res = await fetch(`${SCRIPT_URL}?action=get_state&roomCode=${user.room}`);
        const data = await res.json();
        
        // 1. Перевірка: чи кімната ще існує?
        if(data.status === 'deleted') {
            alert('Майстер розпустив цю кімнату.');
            leaveRoom();
            return;
        }
        
        if(data.status === 'success') {
            // Перевіряємо, чи нас не вигнали (чи є ми в списку?)
            const amIHere = data.players.find(p => p.id === user.id);
            if(!amIHere) {
                alert('Вас було вигнано з кімнати.');
                leaveRoom();
                return;
            }

            // Оновлюємо роль
            user.role = amIHere.role;
            document.getElementById('roleDisplay').innerText = user.role === 'GM' ? '👑 GM' : '👤 Гравець';
            
            // Показуємо/Ховаємо панель GM
            if(user.role === 'GM') {
                document.getElementById('gm-controls').classList.remove('hidden');
            } else {
                document.getElementById('gm-controls').classList.add('hidden');
            }

            // Малюємо гравців
            renderPlayers(data.players);
            
            // Малюємо лог
            renderLogs(data.logs);
        }
    } catch(e) {}
}

// --- ОНОВЛЕНА ФУНКЦІЯ renderPlayers (З кнопкою Kick) ---
function renderPlayers(players) {
    try {
        const list = document.getElementById('playersList');
        if (!list) return; // Якщо списку немає в HTML - виходимо, щоб не було помилки

        list.innerHTML = '';

        // ЗАХИСТ: Якщо user ще не завантажився, вважаємо що це не я
        const myId = (typeof user !== 'undefined' && user) ? user.id : null;

        // Перевіряємо, чи я є GM
        const amIGM = players.some(p => p.id === myId && p.role === 'GM');

        players.forEach(p => {
            const li = document.createElement('li');
            
            // Додаємо клас GM
            if (p.role === 'GM') li.classList.add('gm');

            // Основна інформація
            const infoSpan = document.createElement('span');
            const icon = p.role === 'GM' ? '<span class="crown-icon">👑</span>' : '';
            const isMe = p.id === myId ? ' <small>(Ви)</small>' : '';
            
            infoSpan.innerHTML = `${icon} <strong>${p.name}</strong>${isMe}`;
            li.appendChild(infoSpan);

            // --- МАЛЮЄМО КНОПКИ ---
            // Показуємо кнопки ТІЛЬКИ якщо:
            // 1. Я - GM
            // 2. Цей рядок - НЕ я (не можна кікнути себе)
            if (amIGM && p.id !== myId) {
                const actionsSpan = document.createElement('div');
                actionsSpan.style.display = 'flex'; // Щоб кнопки стояли в ряд
                actionsSpan.style.gap = '5px';      // Відступ між кнопками
                
                actionsSpan.innerHTML = `
                    <button class="btn-transfer" onclick="transferGM('${p.id}')" title="Передати корону">👑</button>
                    <button class="btn-kick" onclick="kickPlayer('${p.id}')" title="Вигнати">✕</button>
                `;
                
                li.appendChild(actionsSpan);
            }

            list.appendChild(li);
        });
    } catch (e) {
        console.error("Помилка у renderPlayers:", e);
    }
}

// --- НОВА ФУНКЦІЯ renderLogs ---
function renderLogs(logs) {
    const container = document.getElementById('gameLog');
    if(!logs || logs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#555; margin-top:20px;">Історія ще не написана...</div>';
        return;
    }

    // Перетворюємо масив логів в HTML
    // reverse() щоб нові були зверху (опціонально)
    const html = logs.map(l => `
        <div class="log-entry">
            <span class="log-time">[${l.time}]</span>
            <span class="log-text">${l.text}</span>
        </div>
    `).reverse().join('');
    
    container.innerHTML = html;
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
