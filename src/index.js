export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const params = {};
    url.searchParams.forEach((val, key) => params[key] = val);

    // Якщо це POST запит, спробуємо дістати параметри ще й з тіла (для надійності)
    if (request.method === 'POST') {
        try {
             // Це дозволить передавати JSON, якщо треба буде
        } catch (e) {} 
    }

    const action = params.action;
    let result = { status: 'error', message: 'Unknown action' };

    try {
        // --- 1. РЕЄСТРАЦІЯ ---
        if (action === 'register') {
            const { username, password } = params;
            const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
            if (existing) {
                result = { status: 'error', message: "Ім'я зайняте" };
            } else {
                const userId = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO users (id, username, password, last_room) VALUES (?, ?, ?, ?)').bind(userId, username, password, '').run();
                result = { status: 'success', userId, username };
            }
        }
        // --- 2. ВХІД ---
        else if (action === 'login') {
            const { username, password } = params;
            const user = await env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?').bind(username, password).first();
            if (user) {
                result = { status: 'success', userId: user.id, username: user.username, lastRoom: user.last_room };
            } else {
                result = { status: 'error', message: "Невірний логін/пароль" };
            }
        }
        // --- 3. СТВОРЕННЯ КІМНАТИ ---
        else if (action === 'create_room') {
            const { userId, playerName } = params;
            const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            const initialState = { players: [{ id: userId, name: playerName, role: 'GM' }], logs: [] };
            await env.DB.prepare('INSERT INTO rooms (code, data, updated_at) VALUES (?, ?, ?)').bind(roomCode, JSON.stringify(initialState), Date.now()).run();
            await env.DB.prepare('UPDATE users SET last_room = ? WHERE id = ?').bind(roomCode, userId).run();
            result = { status: 'success', roomCode, role: 'GM' };
        }
        // --- 4. ПРИЄДНАННЯ ---
        else if (action === 'join_room') {
            const { roomCode, userId, playerName } = params;
            const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(roomCode).first();
            if (room) {
                let data = JSON.parse(room.data);
                let player = data.players.find(p => p.id === userId);
                if (!player) {
                    player = { id: userId, name: playerName, role: 'Player' };
                    data.players.push(player);
                } else {
                    player.name = playerName; 
                }
                await env.DB.prepare('UPDATE rooms SET data = ? WHERE code = ?').bind(JSON.stringify(data), roomCode).run();
                await env.DB.prepare('UPDATE users SET last_room = ? WHERE id = ?').bind(roomCode, userId).run();
                result = { status: 'success', players: data.players, role: player.role };
            } else {
                result = { status: 'error', message: "Кімнату не знайдено" };
            }
        }
        // --- 5. ОТРИМАННЯ СТАНУ ---
        else if (action === 'get_state') {
            const { roomCode } = params;
            const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(roomCode).first();
            if (room) {
                const data = JSON.parse(room.data);
                result = { status: 'success', players: data.players, logs: data.logs };
            } else {
                result = { status: 'deleted' };
            }
        }
          // 6. ДІЇ МАЙСТРА (GM) + ПЕРЕДАЧА КОРОНИ
        else if (['add_log', 'kick_player', 'delete_room', 'transfer_gm'].includes(action)) {
            const { roomCode, userId } = params;
            const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(roomCode).first();
            
            if(room) {
                let data = JSON.parse(room.data);
                const me = data.players.find(p => p.id === userId);
                
                // Перевіряємо, чи це дійсно GM
                if(me && me.role === 'GM') {
                    
                    // --- ДОДАТИ ЗАПИС ---
                    if (action === 'add_log') {
                        data.logs.push({ text: params.text, time: new Date().toLocaleTimeString('uk-UA') });
                        if(data.logs.length > 50) data.logs.shift();
                    }
                    
                    // --- ВИГНАТИ ГРАВЦЯ ---
                    else if (action === 'kick_player') {
                        data.players = data.players.filter(p => p.id !== params.targetId);
                        data.logs.push({ text: `GM вигнав гравця`, time: new Date().toLocaleTimeString('uk-UA') });
                    }
                    
                    // --- ВИДАЛИТИ КІМНАТУ ---
                    else if (action === 'delete_room') {
                        await env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(roomCode).run();
                        result = { status: 'success' };
                        // Тут виходимо, бо кімнати більше немає
                        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                    }

                    // --- ПЕРЕДАТИ КОРОНУ (НОВЕ!) ---
                    else if (action === 'transfer_gm') {
                        const targetId = params.targetId;
                        const targetPlayer = data.players.find(p => p.id === targetId);
                        
                        if (targetPlayer) {
                            me.role = 'Player'; // Я стаю звичайним гравцем
                            targetPlayer.role = 'GM'; // Він стає босом
                            data.logs.push({ text: `Влада перейшла до ${targetPlayer.name}`, time: new Date().toLocaleTimeString('uk-UA') });
                        }
                    }

                    // Зберігаємо зміни в базу
                    await env.DB.prepare('UPDATE rooms SET data = ? WHERE code = ?').bind(JSON.stringify(data), roomCode).run();
                    result = { status: 'success' };

                } else {
                    result = { status: 'error', message: "Тільки GM може робити це" };
                }
            }
        }

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ status: "error", message: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  },

};
