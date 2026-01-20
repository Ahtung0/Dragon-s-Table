// netlify/functions/proxy.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Отримуємо секретне посилання з налаштувань сервера (ми додамо його пізніше)
    const GOOGLE_SCRIPT_URL = process.env.SECRET_GOOGLE_URL;

    if (!GOOGLE_SCRIPT_URL) {
        return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Server configuration error' }) };
    }

    // Отримуємо параметри від сайту
    const params = event.queryStringParameters;
    const action = params.action;
    
    // Будуємо URL для запиту до Google
    // Ми передаємо всі параметри далі
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.append('action', action);
    
    // Перебираємо всі вхідні параметри і додаємо їх до запиту
    for (const key in params) {
        if (key !== 'action') {
            url.searchParams.append(key, params[key]);
        }
    }

    try {
        // Сервер робить запит до Google (ніхто цього не бачить)
        const response = await fetch(url.toString(), {
            method: 'POST'
        });
        
        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', message: 'Failed to reach game server' })
        };
    }
};
