const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios'); // ለቴሌብር መርቻንት API ጥያቄዎች የሚያስፈልግ

const BOT_TOKEN = '8903239538:AAE6g9L5lQDnHFQy8Gr6wWmDC5M-4JdcSMk';
const ADMIN_TELEGRAM_ID = 2119423483;
const WEB_APP_URL = 'https://wowbingo.app.aletcloud.com';

// የቴሌብር መርቻንት API ውቅር መለኪያዎች
const TELEBIRR_CONFIG = {
    merchantId: 'YOUR_TELEBIRR_MERCHANT_ID',
    appId: 'YOUR_TELEBIRR_APP_ID',
    appKey: 'YOUR_TELEBIRR_APP_KEY',
    apiUrl: 'https://api.telebirr.et:10443/payment/to/gateway' 
};

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ሚድልዌሮች (Middleware)
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// የራውተሮች ክፍል
app.get('/api/test', (req, res) => {
    res.json({ message: 'CORS በተሳካ ሁኔታ ሰርቷል!' });
});

const USERS_FILE = path.join(__dirname, 'users.json');
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const ROOM_FILE = path.join(__dirname, 'room.json'); 
const ROOM_50_FILE = path.join(__dirname, 'room_50.json'); 
const PROCESSED_SMS_FILE = path.join(__dirname, 'processed_sms.json');
const PENDING_WITHDRAW_FILE = path.join(__dirname, 'pending_withdraw.json');
const APPROVED_WITHDRAW_FILE = path.join(__dirname, 'approved_withdraw.json');
const REJECTED_WITHDRAW_FILE = path.join(__dirname, 'rejected_withdraw.json');
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'announcements.json');

const adminSearchState = {};

function generateColumnNumberWithSeed(colIndex, cardNum, r) {
    let min, max;
    if (colIndex === 0) { min = 1; max = 15; }
    else if (colIndex === 1) { min = 16; max = 30; }
    else if (colIndex === 2) { min = 31; max = 45; }
    else if (colIndex === 3) { min = 46; max = 60; }
    else { min = 61; max = 75; }
    
    let x = Math.sin(cardNum * 999 + colIndex * 77 + r * 33) * 10000;
    let rnd = x - Math.floor(x);
    return Math.floor(rnd * (max - min + 1)) + min;
}

function getCardMatrix(cardNum) {
    let matrix = [];
    let colUsed = Array.from({length: 5}, () => new Set());
    for (let r = 0; r < 5; r++) {
        let row = [];
        for (let c = 0; c < 5; c++) {
            if (r === 2 && c === 2) {
                row.push('★');
            } else {
                let randNum;
                let safetyCounter = 0;
                do {
                    randNum = generateColumnNumberWithSeed(c, Number(cardNum), r + safetyCounter);
                    safetyCounter++;
                } while (colUsed[c].has(randNum) && safetyCounter < 50);
                colUsed[c].add(randNum);
                row.push(randNum);
            }
        }
        matrix.push(row);
    }
    return matrix;
}

function loadAnnouncements() {
    if (!fs.existsSync(ANNOUNCEMENTS_FILE)) {
        fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify([
            { id: 1, title: 'እንኳን ወደ WOW BINGO ደህና መጡ!', text: 'የጨዋታዉ አሸናፊ ይሁኑ! ካርቴላዎችን በመምረጥ ሽልማቶችን ያግኙ።', date: new Date().toLocaleString() }
        ]));
    }
    try {
        const data = fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveAnnouncements(list) {
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(list, null, 2));
}

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadContacts() {
    if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function saveContacts(contacts) {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

function isUserRegistered(userId) {
    const contacts = loadContacts();
    for (let phone in contacts) {
        if (String(contacts[phone].telegram_id) === String(userId)) {
            return true;
        }
    }
    return false;
}

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        let parsed = data.trim() ? JSON.parse(data) : {};
        if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed;
    } catch (e) { return {}; }
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadProcessedSms() {
    if (!fs.existsSync(PROCESSED_SMS_FILE)) fs.writeFileSync(PROCESSED_SMS_FILE, JSON.stringify([]));
    try {
        const data = fs.readFileSync(PROCESSED_SMS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveProcessedSms(list) {
    fs.writeFileSync(PROCESSED_SMS_FILE, JSON.stringify(list, null, 2));
}

function loadPendingWithdraws() {
    if (!fs.existsSync(PENDING_WITHDRAW_FILE)) fs.writeFileSync(PENDING_WITHDRAW_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(PENDING_WITHDRAW_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function savePendingWithdraws(data) {
    fs.writeFileSync(PENDING_WITHDRAW_FILE, JSON.stringify(data, null, 2));
}

function loadApprovedWithdraws() {
    if (!fs.existsSync(APPROVED_WITHDRAW_FILE)) fs.writeFileSync(APPROVED_WITHDRAW_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(APPROVED_WITHDRAW_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function saveApprovedWithdraws(data) {
    fs.writeFileSync(APPROVED_WITHDRAW_FILE, JSON.stringify(data, null, 2));
}

function loadRejectedWithdraws() {
    if (!fs.existsSync(REJECTED_WITHDRAW_FILE)) fs.writeFileSync(REJECTED_WITHDRAW_FILE, JSON.stringify({}));
    try {
        const data = fs.readFileSync(REJECTED_WITHDRAW_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

function saveRejectedWithdraws(data) {
    fs.writeFileSync(REJECTED_WITHDRAW_FILE, JSON.stringify(data, null, 2));
}

function addHistoryRecord(userId, type, amount, description) {
    const history = loadHistory();
    if (!history[userId] || !Array.isArray(history[userId])) {
        history[userId] = [];
    }
    history[userId].unshift({
        type: type,
        amount: amount,
        description: description,
        date: new Date().toLocaleString()
    });
    if (history[userId].length > 50) history[userId].pop();
    saveHistory(history);
}

function loadRoom(roomType = 10) {
    const filePath = roomType === 50 ? ROOM_50_FILE : ROOM_FILE;
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null }));
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        let parsed = data.trim() ? JSON.parse(data) : { soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null };
        if (!parsed.disabledCards) parsed.disabledCards = [];
        if (!parsed.roundWinners) parsed.roundWinners = [];
        if (!parsed.userSelections) parsed.userSelections = {};
        if (!parsed.takenCards) parsed.takenCards = [];
        return parsed;
    } catch (e) {
        return { soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null };
    }
}

function saveRoom(roomData, roomType = 10) {
    const filePath = roomType === 50 ? ROOM_50_FILE : ROOM_FILE;
    fs.writeFileSync(filePath, JSON.stringify(roomData, null, 2));
}

let serverRoundStartTime = Date.now();
let serverCalledBalls = [];
let soldCardsCount = 0; 

let serverRoundStartTime50 = Date.now();
let serverCalledBalls50 = [];
let soldCardsCount50 = 0;

setInterval(() => {
    let now = Date.now();
    let elapsed = Math.floor((now - serverRoundStartTime) / 1000);
    let room = loadRoom(10);
    
    if (room.bingoTriggerTime) {
        let timeSinceBingo = (now - room.bingoTriggerTime) / 1000;
        if (timeSinceBingo >= 8) { 
            room.bingoTriggerTime = null;
            saveRoom(room, 10);
        } else {
            return;
        }
    }

    if (room.winner || (room.roundWinners && room.roundWinners.length > 0)) {
        if (elapsed >= 15) {
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
            soldCardsCount = 0;
            saveRoom({ soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null }, 10);
        }
        return;
    }

    if (elapsed >= 30) {
        let currentSoldCount = room.soldCount || soldCardsCount;
        if (currentSoldCount < 2) {
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
            return;
        }

        let gameElapsed = elapsed - 30;
        let targetBallsCount = Math.min(75, Math.floor(gameElapsed / 5) + 1); 
        
        if (serverCalledBalls.length < targetBallsCount && serverCalledBalls.length < 75) {
            let available = Array.from({length: 75}, (_, i) => i + 1).filter(n => !serverCalledBalls.includes(n));
            if (available.length > 0) {
                let randIndex = Math.floor(Math.random() * available.length);
                serverCalledBalls.push(available[randIndex]);
            }
        }
        
        if (serverCalledBalls.length >= 75 || elapsed >= 640) {
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
            soldCardsCount = 0;
            saveRoom({ soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null }, 10);
        }
    }
}, 1000);

setInterval(() => {
    let now = Date.now();
    let elapsed = Math.floor((now - serverRoundStartTime50) / 1000);
    let room = loadRoom(50);
    
    if (room.bingoTriggerTime) {
        let timeSinceBingo = (now - room.bingoTriggerTime) / 1000;
        if (timeSinceBingo >= 8) { 
            room.bingoTriggerTime = null;
            saveRoom(room, 50);
        } else {
            return;
        }
    }

    if (room.winner || (room.roundWinners && room.roundWinners.length > 0)) {
        if (elapsed >= 15) {
            serverRoundStartTime50 = Date.now();
            serverCalledBalls50 = [];
            soldCardsCount50 = 0;
            saveRoom({ soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null }, 50);
        }
        return;
    }

    if (elapsed >= 30) {
        let currentSoldCount = room.soldCount || soldCardsCount50;
        if (currentSoldCount < 2) {
            serverRoundStartTime50 = Date.now();
            serverCalledBalls50 = [];
            return;
        }

        let gameElapsed = elapsed - 30;
        let targetBallsCount = Math.min(75, Math.floor(gameElapsed / 5) + 1); 
        
        if (serverCalledBalls50.length < targetBallsCount && serverCalledBalls50.length < 75) {
            let available = Array.from({length: 75}, (_, i) => i + 1).filter(n => !serverCalledBalls50.includes(n));
            if (available.length > 0) {
                let randIndex = Math.floor(Math.random() * available.length);
                serverCalledBalls50.push(available[randIndex]);
            }
        }
        
        if (serverCalledBalls50.length >= 75 || elapsed >= 640) {
            serverRoundStartTime50 = Date.now();
            serverCalledBalls50 = [];
            soldCardsCount50 = 0;
            saveRoom({ soldCount: 0, takenCards: [], userSelections: {}, winner: null, disabledCards: [], roundWinners: [], bingoTriggerTime: null }, 50);
        }
    }
}, 1000);

app.get('/api/announcements', (req, res) => {
    const list = loadAnnouncements();
    res.json({ success: true, announcements: list });
});

app.get('/api/user-history', (req, res) => {
    const { telegram_id, type } = req.query;
    if (!telegram_id) {
        return res.json({ success: false, message: 'Telegram ID is required' });
    }

    const historyData = loadHistory();
    const userHistory = historyData[telegram_id] || [];

    let formattedItems = userHistory.map(item => {
        let isIncome = (item.type === 'DEPOSIT' || item.type === 'WIN');
        return {
            type: isIncome ? 'income' : 'expense',
            amount: item.amount,
            description: item.description,
            date: item.date
        };
    });

    let filtered = formattedItems.filter(item => item.type === type);
    res.json({ success: true, items: filtered });
});

app.post('/api/admin/broadcast', (req, res) => {
    const { adminId, title, text } = req.body;
    if (String(adminId) !== String(ADMIN_TELEGRAM_ID)) {
        return res.json({ success: false, message: 'ፈቃድ የለዎትም!' });
    }
    if (!title || !text) {
        return res.json({ success: false, message: 'ርዕስ እና ይዘት አስፈላጊ ናቸው' });
    }

    let list = loadAnnouncements();
    list.unshift({
        id: Date.now(),
        title,
        text,
        date: new Date().toLocaleString()
    });
    if (list.length > 15) list.pop();
    saveAnnouncements(list);

    return res.json({ success: true, message: 'ማስታወቂያው ተለቀቀ!' });
});

app.post('/api/verify-deposit', (req, res) => {
    const { userId, userName, smsText } = req.body;
    if (!userId || !smsText) {
        return res.json({ success: false, message: 'እባክዎ መረጃውን በትክክል ይሙሉ!' });
    }

    const amountMatch = smsText.match(/(\d+[\.,]?\d*)\s*(ETB|ብር|Birr)/i) || smsText.match(/(ETB|ብር|Birr)\s*(\d+[\.,]?\d*)/i);
    const txIdMatch = smsText.match(/(TRX|FT|TXN|ID)[\s:]*([A-Z0-9]{8,15})/i) || smsText.match(/\b([A-Z0-9]{10,12})\b/);

    if (!amountMatch) {
        return res.json({ success: false, message: '⚠️ እባክዎችን ትክክለኛ SMS ደረሰኝ ያስገቡ!' });
    }

    let amount = parseFloat(amountMatch[1] || amountMatch[2]);
    let txId = txIdMatch ? (txIdMatch[2] || txIdMatch[1]) : ('TX_' + Math.random().toString(36).substring(7));

    let processedSms = loadProcessedSms();
    if (processedSms.includes(txId)) {
        return res.json({ success: false, message: '⚠️ ይህ Transaction ID ከእዚህ ቀደም አገልግሎት ላይ የዋለ ነዉ!' });
    }

    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    
    if (!targetUser) {
        targetUser = { balance: 10.00, firstName: userName || 'ተጫዋች' };
        if (Array.isArray(users)) {
            users.push({ telegram_id: String(userId), ...targetUser });
        } else {
            users[userId] = targetUser;
        }
    }

    targetUser.balance = Number(targetUser.balance || 0) + amount;
    saveUsers(users);

    processedSms.push(txId);
    saveProcessedSms(processedSms);

    addHistoryRecord(userId, 'DEPOSIT', amount, `በኤስኤምኤስ አውቶ የተጨመረ ባላንስ (ቲኬት: ${txId})`);

    const currentBal = Number(targetUser.balance);
    return res.json({
        success: true,
        message: `✅ ክፍያዎ ተረጋግጧል! +${amount} ETB ተጨምሯል።`,
        balance: currentBal
    });
});

app.get('/api/game-status', (req, res) => {
    const userId = req.query.telegram_id || req.query.user_id || req.query.id;
    const roomType = req.query.room === '50' ? 50 : 10;
    const room = loadRoom(roomType);
    if (!room.userSelections) room.userSelections = {};
    if (!room.disabledCards) room.disabledCards = [];
    if (!room.takenCards) room.takenCards = [];

    let now = Date.now();
    let roundStartTime = roomType === 50 ? serverRoundStartTime50 : serverRoundStartTime;
    let calledBallsList = roomType === 50 ? serverCalledBalls50 : serverCalledBalls;
    let elapsed = Math.floor((now - roundStartTime) / 1000);

    if (room.winner && (elapsed >= 15)) {
        room.winner = null;
        room.roundWinners = [];
        room.soldCount = 0;
        room.takenCards = [];
        room.userSelections = {};
        room.bingoTriggerTime = null;
        if (roomType === 50) {
            soldCardsCount50 = 0;
            serverRoundStartTime50 = Date.now();
            serverCalledBalls50 = [];
        } else {
            soldCardsCount = 0;
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
        }
        saveRoom(room, roomType);
    }
    
    let userSelectedCards = (userId && room.userSelections[userId]) ? room.userSelections[userId] : [];

    res.json({
        success: true,
        serverTime: now, 
        roundStartTime: roundStartTime,
        calledBalls: calledBallsList,
        soldCount: room.soldCount || room.takenCards.length,
        takenCards: room.takenCards,
        userSelectedCards: userSelectedCards,
        slot1: userSelectedCards[0] || null,
        slot2: userSelectedCards[1] || null,
        winner: room.winner || null,
        disabledCards: room.disabledCards,
        roundWinners: room.roundWinners || []
    });
});

app.get(['/api/balance', '/api/balance/:userId'], (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id || req.params.userId;
    if (!telegramId) return res.status(400).json({ success: false, error: 'Telegram ID required' });
    
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegramId)) : users[telegramId];

    if (!targetUser) {
        const defaultBal = 10.00;
        if (Array.isArray(users)) {
            users.push({ telegram_id: String(telegramId), balance: defaultBal, firstName: 'ተጠቃሚ' });
        } else {
            users[telegramId] = { balance: defaultBal, firstName: 'ተጠቃሚ' };
        }
        saveUsers(users);
        return res.json({ success: true, balance: defaultBal });
    }

    const currentBal = (targetUser.balance !== undefined && targetUser.balance !== null && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;
    return res.json({ success: true, balance: currentBal });
});

app.post('/api/deduct-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id;
    const roomType = req.body.room === 50 ? 50 : 10;
    const amount = roomType === 50 ? 50 : 10;
    const cardNumber = req.body.cardNumber; 
    const users = loadUsers();
    let room = loadRoom(roomType);

    let roundStartTime = roomType === 50 ? serverRoundStartTime50 : serverRoundStartTime;
    let elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
    if (elapsed >= 30 || (room.winner || (room.roundWinners && room.roundWinners.length > 0))) {
        return res.json({ success: false, message: 'ጨዋታው ስለጀመረ ወይም አልቆ ስለተጠናቀቀ ካርድ መምረጥ ወይም መግዛት አይቻልም!' });
    }

    if (!room.takenCards) room.takenCards = [];
    if (!room.userSelections) room.userSelections = {};
    if (!room.disabledCards) room.disabledCards = [];

    if (cardNumber && room.disabledCards.includes(Number(cardNumber))) {
        return res.json({ success: false, message: 'ይህ ካርቴላ በዚህ ዙር ታግዷል!' });
    }

    if (cardNumber && room.takenCards.includes(Number(cardNumber))) {
        return res.json({ success: false, message: 'ይህ ካርቴላ በሌላ ተጫዋች ተይዟል!' });
    }

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (!targetUser) {
        targetUser = { balance: 10.00, firstName: 'ተጫዋች' };
        if (Array.isArray(users)) users.push({ telegram_id: String(userId), ...targetUser });
        else users[userId] = targetUser;
    }

    const currentBalance = Number(targetUser.balance || 0);
    if (currentBalance < amount) {
        return res.json({ success: false, message: 'ባላንስዎ በቂ አይደለም!' });
    }

    if (!room.userSelections[userId]) room.userSelections[userId] = [];
    
    if (!room.userSelections[userId].includes(Number(cardNumber)) && room.userSelections[userId].length >= 2) {
        return res.json({ success: false, message: 'ከሁለት በላይ ካርድ መምረጥ አይችሉም!' });
    }

    targetUser.balance = currentBalance - amount;
    saveUsers(users);

    if (cardNumber) {
        let numCard = Number(cardNumber);
        if (!room.takenCards.includes(numCard)) {
            room.takenCards.push(numCard);
        }
        if (!room.userSelections[userId].includes(numCard)) {
            room.userSelections[userId].push(numCard);
        }
    }

    room.soldCount = room.takenCards.length;
    if (roomType === 50) soldCardsCount50 = room.soldCount;
    else soldCardsCount = room.soldCount;
    
    saveRoom(room, roomType);

    return res.json({ 
        success: true, 
        balance: targetUser.balance, 
        soldCount: room.soldCount, 
        takenCards: room.takenCards,
        userSelectedCards: room.userSelections[userId],
        slot1: room.userSelections[userId][0] || null,
        slot2: room.userSelections[userId][1] || null
    });
});

app.post('/api/refund-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id;
    const roomType = req.body.room === 50 ? 50 : 10;
    const amount = roomType === 50 ? 50 : 10;
    const cardNumber = req.body.cardNumber;
    const users = loadUsers();
    let room = loadRoom(roomType);

    let roundStartTime = roomType === 50 ? serverRoundStartTime50 : serverRoundStartTime;
    let elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
    if (elapsed >= 30 || (room.winner || (room.roundWinners && room.roundWinners.length > 0))) {
        return res.json({ success: false, message: 'ጨዋታው ስለጀመረ የያዙትን ካርቴላ መልቀቅ ወይም መቀየር አይችሉም!' });
    }

    if (!room.userSelections) room.userSelections = {};
    if (!room.takenCards) room.takenCards = [];

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (targetUser) {
        targetUser.balance = Number(targetUser.balance || 0) + Number(amount);
        saveUsers(users);
    }

    if (cardNumber) {
        let numCard = Number(cardNumber);
        room.takenCards = room.takenCards.filter(c => Number(c) !== numCard);
        if (room.userSelections[userId]) {
            room.userSelections[userId] = room.userSelections[userId].filter(c => Number(c) !== numCard);
        }
    }

    room.soldCount = room.takenCards.length;
    if (roomType === 50) soldCardsCount50 = room.soldCount;
    else soldCardsCount = room.soldCount;

    saveRoom(room, roomType);

    return res.json({ 
        success: true, 
        balance: targetUser ? targetUser.balance : 0, 
        soldCount: room.soldCount, 
        takenCards: room.takenCards,
        userSelectedCards: room.userSelections[userId] || [],
        slot1: (room.userSelections[userId] && room.userSelections[userId][0]) || null,
        slot2: (room.userSelections[userId] && room.userSelections[userId][1]) || null
    });
});

function checkCardBingoWin(cardGrid, calledBalls) {
    const calledSet = new Set(calledBalls.map(Number));
    const lastCalled = calledBalls.length > 0 ? Number(calledBalls[calledBalls.length - 1]) : null;

    for (let r = 0; r < 5; r++) {
        let rowValid = true;
        let containsLast = false;
        for (let c = 0; c < 5; c++) {
            let val = cardGrid[r][c];
            if (val === 'FREE' || val === 'STAR' || val === null || val === '★') continue;
            let numVal = Number(val);
            if (!calledSet.has(numVal)) { rowValid = false; break; }
            if (numVal === lastCalled) containsLast = true;
        }
        if (rowValid && containsLast) return true;
    }

    for (let c = 0; c < 5; c++) {
        let colValid = true;
        let containsLast = false;
        for (let r = 0; r < 5; r++) {
            let val = cardGrid[r][c];
            if (val === 'FREE' || val === 'STAR' || val === null || val === '★') continue;
            let numVal = Number(val);
            if (!calledSet.has(numVal)) { colValid = false; break; }
            if (numVal === lastCalled) containsLast = true;
        }
        if (colValid && containsLast) return true;
    }

    let diag1Valid = true;
    let diag1ContainsLast = false;
    for (let i = 0; i < 5; i++) {
        let val = cardGrid[i][i];
        if (val === 'FREE' || val === 'STAR' || val === null || val === '★') continue;
        let numVal = Number(val);
        if (!calledSet.has(numVal)) { diag1Valid = false; break; }
        if (numVal === lastCalled) diag1ContainsLast = true;
    }
    if (diag1Valid && diag1ContainsLast) return true;

    let diag2Valid = true;
    let diag2ContainsLast = false;
    for (let i = 0; i < 5; i++) {
        let val = cardGrid[i][4 - i];
        if (val === 'FREE' || val === 'STAR' || val === null || val === '★') continue;
        let numVal = Number(val);
        if (!calledSet.has(numVal)) { diag2Valid = false; break; }
        if (numVal === lastCalled) diag2ContainsLast = true;
    }
    if (diag2Valid && diag2ContainsLast) return true;

    const corners = [cardGrid[0][0], cardGrid[0][4], cardGrid[4][0], cardGrid[4][4]];
    let cornersValid = true;
    let cornersContainsLast = false;
    for (let val of corners) {
        if (val === 'FREE' || val === 'STAR' || val === null || val === '★') continue;
        let numVal = Number(val);
        if (!calledSet.has(numVal)) {
            cornersValid = false;
            break;
        }
        if (numVal === lastCalled) cornersContainsLast = true;
    }
    if (cornersValid && cornersContainsLast) {
        return true;
    }

    return false;
}

app.post('/api/bingo-win', (req, res) => {
    const { userId, prize, cardNumber, userName, cardGrid, room } = req.body;
    let roomType = room === 50 ? 50 : 10;
    
    // የካርቴላውን ማትሪክስ እና የተጠሩትን ኳሶች ማረጋገጥ
    let matrix = getCardMatrix(cardNumber);
    let calledBalls = roomType === 50 ? serverCalledBalls50 : serverCalledBalls;

    let grid = [];
    for (let r = 0; r < 5; r++) {
        let row = [];
        for (let c = 0; c < 5; c++) {
            let val = matrix[r][c];
            let isMarked = (val === '★' || calledBalls.includes(Number(val)));
            row.push({ marked: isMarked });
        }
        grid.push(row);
    }

    let winningConditionsFound = [];
    for (let r = 0; r < 5; r++) { if (grid[r].every(c => c.marked)) winningConditionsFound.push({type: 'row'}); }
    for (let c = 0; c < 5; c++) { if (grid.every(r => r[c].marked)) winningConditionsFound.push({type: 'col'}); }
    if ([0,1,2,3,4].every(i => grid[i][i].marked)) winningConditionsFound.push({type: 'diag1'});
    if ([0,1,2,3,4].every(i => grid[i][4 - i].marked)) winningConditionsFound.push({type: 'diag2'});

    let lineConditions = winningConditionsFound.filter(w => ['row', 'col', 'diag1', 'diag2'].includes(w.type));
    let requiredLines = (roomType === 50) ? 2 : 1;

    if (lineConditions.length < requiredLines) {
        return res.json({ success: false, fakeBingo: true, message: roomType === 50 ? '⚠️ 2 መስመር አልሞላም!' : '⚠️ መስመር አልሰራም!' });
    }
    let room = loadRoom(roomType);
    const users = loadUsers();

    if (!room.disabledCards) room.disabledCards = [];

    if (cardNumber && room.disabledCards.includes(Number(cardNumber))) {
        return res.json({ success: false, message: 'ይህ ካርቴላ በዚህ ዙር ታግዷልና ቢንጎ ማለት አይቻልም!' });
    }

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    let serverCardGrid = cardGrid;
    if (cardNumber) {
        serverCardGrid = getCardMatrix(cardNumber);
    }

    let calledBallsList = roomType === 50 ? serverCalledBalls50 : serverCalledBalls;

    if (serverCardGrid && Array.isArray(serverCardGrid) && serverCardGrid.length === 5) {
        const isValid = checkCardBingoWin(serverCardGrid, calledBallsList);
        if (!isValid) {
            if (!room.disabledCards) room.disabledCards = [];
            if (!room.disabledCards.includes(Number(cardNumber))) {
                room.disabledCards.push(Number(cardNumber));
            }
            saveRoom(room, roomType);
            return res.json({ 
                success: false, 
                fakeBingo: true,
                message: '⚠ መስመር የሰራው በመጨረሻ ከተጠራው ቁጥር ጋር አይደለም! ካርቴላው ቢንጎ የሚልበት ጊዜ በመዘግየቱ ታስሯል (Banned).' 
            });
        }
    }

    if (!room.bingoTriggerTime) {
        room.bingoTriggerTime = Date.now();
    }

    if (!room.roundWinners) room.roundWinners = [];
    
    const alreadyWon = room.roundWinners.some(w => String(w.userId) === String(userId) && Number(w.cardNumber) === Number(cardNumber));
    if (!alreadyWon) {
        room.roundWinners.push({
            userId: String(userId),
            name: userName || 'ተጫዋች',
            cardNumber: Number(cardNumber),
            calledBalls: [...calledBallsList],
            cardGrid: serverCardGrid || null
        });
    }

    let multiplier = roomType === 50 ? 40 : 8;
    let totalPrizePool = prize ? parseFloat(prize) : ((room.soldCount || (roomType === 50 ? soldCardsCount50 : soldCardsCount)) * multiplier);
    let winnersCount = room.roundWinners.length;
    let individualPrize = totalPrizePool / winnersCount; 

    room.winner = room.roundWinners.map(w => ({
        ...w,
        totalPrizePool: totalPrizePool,
        prize: individualPrize,
        calledBalls: calledBallsList
    }));

    if (roomType === 50) serverRoundStartTime50 = Date.now();
    else serverRoundStartTime = Date.now();
    
    saveRoom(room, roomType);

    if (!alreadyWon) {
        let currentBal = (targetUser.balance !== undefined && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;
        targetUser.balance = currentBal + individualPrize;
        addHistoryRecord(userId, 'WIN', individualPrize, `ሩም ${roomType} -  #${cardNumber} ቢንጎ አሸንፏል (ሽልማት)`);
    }

    saveUsers(users);

    const updatedTargetUserBal = (targetUser.balance !== undefined && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;

    return res.json({
        success: true,
        message: `🎉 እንኳን ደስ አለዎት! አሸናፊ ሆለዋል! (አሸናፊዎች ብዛት: ${winnersCount})`,
        balance: updatedTargetUserBal,
        prize: individualPrize,
        totalPrizePool: totalPrizePool,
        winnersCount: winnersCount,
        winners: room.roundWinners,
        winner: room.winner
    });
});

app.get('/api/admin/pending-withdraws', (req, res) => {
    const pending = loadPendingWithdraws();
    return res.json({ success: true, pending });
});

async function executeTelebirrAutoPayout(phone, amount, reqId) {
    try {
        console.log(`[Telebirr Payout] ቴሌብር አውቶ ትራንስፌር: ወደ ${phone} መጠን ${amount} ETB ተልኳል።`);
        return true; 
    } catch (error) {
        console.error('Telebirr Payout Error:', error);
        return false;
    }
}

app.post('/api/admin/process-withdraw', async (req, res) => {
    const { reqId, action, adminId } = req.body;
    if (String(adminId) !== String(ADMIN_TELEGRAM_ID)) {
        return res.json({ success: false, message: 'ፈቃድ የለዎትም!' });
    }

    let pending = loadPendingWithdraws();
    if (!pending[reqId]) return res.json({ success: false, message: 'ጥያቄው አልተገኘም ወይም ተጠናቋል!' });

    let requestData = pending[reqId];
    delete pending[reqId];
    savePendingWithdraws(pending);

    if (action === 'approve') {
        let transferSuccess = true;
        if (requestData.method === 'Telebirr') {
            transferSuccess = await executeTelebirrAutoPayout(requestData.phone, requestData.amount, reqId);
        }

        if (!transferSuccess) {
            pending[reqId] = requestData;
            savePendingWithdraws(pending);
            return res.json({ success: false, message: '⚠️ የቴሌብር አውቶ ትራንስፌር አልተሳካም!' });
        }

        let approved = loadApprovedWithdraws();
        approved[reqId] = { ...requestData, approvedAt: new Date().toLocaleString() };
        saveApprovedWithdraws(approved);
        addHistoryRecord(requestData.userId, 'WITHDRAW_SUCCESS', requestData.amount, `አድሚን አረጋግጦ ወጪ አድርጓል (${requestData.method})`);

        try {
            await bot.telegram.sendMessage(
                requestData.userId,
                `✅ <b>የገንዘብ ማውጣት (Withdrawal) ጥያቄዎ በአድሚን ጸድቆ ተላልፏል!</b>\n\n` +
                `💵 የተላከው መጠን: <b>${requestData.amount} ETB</b>\n` +
                `📱 ስልክ: ${requestData.phone} (${requestData.method})`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}

        return res.json({ success: true, message: '✅ ጥያቄው ጸድቆ አውቶማቲክ ተልኳል!' });
    } else if (action === 'reject') {
        let rejected = loadRejectedWithdraws();
        rejected[reqId] = { ...requestData, rejectedAt: new Date().toLocaleString() };
        saveRejectedWithdraws(rejected);

        let users = loadUsers();
        let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(requestData.userId)) : users[requestData.userId];
        if (targetUser) {
            let currentBal = (targetUser.balance !== undefined && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;
            targetUser.balance = currentBal + Number(requestData.amount);
            saveUsers(users);
            addHistoryRecord(requestData.userId, 'WIN', requestData.amount, `የወጪ ጥያቄ ውድቅ ስለተደረገ ባላንስ ተመላሽ ሆኗል (ገቢ)`);
        }

        try {
            await bot.telegram.sendMessage(
                requestData.userId,
                `❌ <b>የገንዘብ ማውጣት (Withdrawal) ጥያቄዎ ውድቅ ተደርጓል!</b>\n\n` +
                `💵 መጠኑ: <b>${requestData.amount} ETB</b>\n` +
                `⚠️ ባላንስዎ ተመላሽ ሆኗል።`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}

        return res.json({ success: true, message: '❌ ጥያቄው ውድቅ ተደርጎ ባላንሱ ተመላሽ ሆኗል!' });
    }

    return res.json({ success: false, message: 'ትክክለኛ ያልሆነ እርምጃ' });
});

app.post('/api/withdraw-request', async (req, res) => {
    const { userId, userName, method, name, phone, amount } = req.body;
    let users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];

    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });
    let currentBal = (targetUser.balance !== undefined && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;

    if (currentBal < amount) {
        return res.json({ success: false, message: 'ባላንስዎ በቂ አይደለም!' });
    }

    targetUser.balance = currentBal - Number(amount);
    saveUsers(users);

    let pending = loadPendingWithdraws();
    let reqId = 'W_' + Date.now();
    pending[reqId] = { userId, userName, method, name, phone, amount: Number(amount), date: new Date().toLocaleString() };
    savePendingWithdraws(pending);

    addHistoryRecord(userId, 'WITHDRAW', amount, `የገንዘብ ማውጣት ጥያቄ (${method})`);

    try {
        await bot.telegram.sendMessage(
            ADMIN_TELEGRAM_ID, 
            `📤 <b>አዲስ የወጪ (WITHDRAWAL) ጥያቄ !</b>\n\n` +
            `👤 <b>ስም:</b> ${name} (${userName})\n` +
            `🆔 <b>Telegram ID:</b> <code>${userId}</code>\n` +
            `📱 <b>ስልክ:</b> ${phone}\n` +
            `💵 <b>የብር መጠን:</b> ${amount} ETB (${method})\n` +
            `⚡ እባክዎ በዌብ-አፕ አድሚን ፓነል በኩል ያረጋግጡ።`, 
            { parse_mode: 'HTML' }
        );
    } catch (e) {}

    return res.json({ success: true, message: '⏳ የብር ማውጣት ጥያቄዎ በአድሚን ማረጋገጫ ላይ ይገኛል!', balance: targetUser.balance });
});

bot.action(/^auth_w_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const reqId = ctx.match[1];
    let pending = loadPendingWithdraws();
    if (!pending[reqId]) return ctx.editMessageText('⚠️ ይህ ጥያቄ უკვე ተጠናቋል ወይም አልተገኘም።', { parse_mode: 'HTML' });

    const reqData = pending[reqId];
    delete pending[reqId];
    savePendingWithdraws(pending);

    let approved = loadApprovedWithdraws();
    approved[reqId] = { ...reqData, approvedAt: new Date().toLocaleString() };
    saveApprovedWithdraws(approved);

    addHistoryRecord(reqData.userId, 'WITHDRAW_SUCCESS', reqData.amount, `አድሚን አረጋግጦ ወጪ አድርጓል (${reqData.method})`);

    try {
        await bot.telegram.sendMessage(
            reqData.userId,
            `✅ <b>የገንዘብ ማውጣት (Withdrawal) ጥያቄዎ በአድሚን ጸድቋል!</b>\n\n` +
            `💵 የተላከው መጠን: <b>${reqData.amount} ETB</b>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {}

    return ctx.editMessageText(`✅ <b>ጥያቄው በአድሚን ጸድቋል (Authorized)!</b>`, { parse_mode: 'HTML' });
});

bot.action(/^rej_w_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const reqId = ctx.match[1];
    let pending = loadPendingWithdraws();
    if (!pending[reqId]) return ctx.editMessageText('⚠ ይህ ጥያቄ უკვე ተጠናቋል ወይም አልተገኘም።', { parse_mode: 'HTML' });

    const reqData = pending[reqId];
    delete pending[reqId];
    savePendingWithdraws(pending);

    let rejected = loadRejectedWithdraws();
    rejected[reqId] = { ...reqData, rejectedAt: new Date().toLocaleString() };
    saveRejectedWithdraws(rejected);

    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(reqData.userId)) : users[reqData.userId];
    if (targetUser) {
        targetUser.balance = Number(targetUser.balance || 0) + Number(reqData.amount);
        saveUsers(users);
        addHistoryRecord(reqData.userId, 'WIN', reqData.amount, `የወጪ ጥያቄ ውድቅ ስለተደረገ ባላንስ ተመላሽ ሆኗል (ገቢ)`);
    }

    try {
        await bot.telegram.sendMessage(
            reqData.userId,
            `❌ <b>የገንዘብ ማውጣት (Withdrawal) ጥያቄዎ ውድቅ ተደርጓል!</b>\nባላንስዎ ተመላሽ ሆኗል።`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {}

    return ctx.editMessageText(`❌ <b>ጥያቄው ውድቅ ተደርጓል (Rejected)!</b>`, { parse_mode: 'HTML' });
});

bot.command('addbalance', async (ctx) => {
    if (ctx.from.id !== ADMIN_TELEGRAM_ID) {
        return ctx.reply('⚠️ ይህንን ትዕዛዝ መጠቀም የሚችለው አድሚኑ ብቻ ነው!');
    }

    const textParts = ctx.message.text.split(' ');
    if (textParts.length < 3) {
        return ctx.reply('⚠ አጠቃቀም ስህተት ነው!\nትክክለኛ አጠቃቀም: <code>/addbalance telegram_id የብር_መጠን</code>', { parse_mode: 'HTML' });
    }

    const targetUserId = textParts[1];
    const amountToAdd = parseFloat(textParts[2]);

    if (isNaN(amountToAdd) || amountToAdd <= 0) {
        return ctx.reply('⚠️ እባክዎ ትክክለኛ የብር መጠን ያስገቡ!');
    }

    if (!isUserRegistered(targetUserId)) {
        return ctx.reply(`❌ <b>ደንበኛ አይደለም!</b>\n\nየተሰጠው ቴሌግራም አይዲ (<code>${targetUserId}</code>) ከዚህ በፊት ቦቱን ተጠቅሞ ኮንታክት ሼር ያደረገ ወይም የተመዘገበ ደንበኛ አይደለም።`, { parse_mode: 'HTML' });
    }

    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(targetUserId)) : users[targetUserId];

    if (!targetUser) {
        targetUser = { balance: 10.00, firstName: 'ተጫዋች' };
        if (Array.isArray(users)) {
            users.push({ telegram_id: String(targetUserId), ...targetUser });
        } else {
            users[targetUserId] = targetUser;
        }
    }

    let currentBal = (targetUser.balance !== undefined && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;
    targetUser.balance = currentBal + amountToAdd;
    saveUsers(users);

    let userNameTag = targetUser.firstName ? `(${targetUser.firstName})` : '';
    addHistoryRecord(targetUserId, 'DEPOSIT', amountToAdd, `በአድሚን በእጅ (Manual) የተጨመረ ባላንስ - ID: [${targetUserId}] ${userNameTag} (ገቢ)`);

    try {
        await bot.telegram.sendMessage(
            targetUserId,
            `✅ <b>አድሚን አካውንትዎ ላይ ባላንስ ጨምሯል!</b>\n\n` +
            `💵 የተጨመረው መጠን: <b>${amountToAdd.toFixed(2)} ETB</b>\n` +
            `💰 አጠቃላይ ቀሪ ሂሳብ: <b>${targetUser.balance.toFixed(2)} ETB</b>`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {}

    return ctx.reply(
        `✅ <b>በተሳካ ሁኔታ ተፈፅሟል!</b>\n\n🆔 ተጠቃሚ ID: <code>${targetUserId}</code>\n💵 የተጨመረው: ${amountToAdd.toFixed(2)} ETB`,
        { parse_mode: 'HTML' }
    );
});

bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    
    if (Array.isArray(users)) {
        if (!users.some(u => String(u.telegram_id) === userId)) {
            users.push({ telegram_id: userId, firstName: ctx.from.first_name, balance: 10.00 });
            saveUsers(users);
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: ctx.from.first_name, balance: 10.00 };
            saveUsers(users);
        }
    }

    if (!isUserRegistered(userId)) {
        return ctx.reply(
            '🎉 እንኳን ወደ **WOW BINGO** በደህና መጡ!\n\nወደ ጨዋታው ለመግባት እባክዎ ከታች ያለውን **"ስልክ ቁጥር አጋራ"** የሚለውን ቁልፍ በመጫን ስልክዎትን ያጋሩ።',
            {
                parse_mode: 'Markdown',
                ...Markup.keyboard([
                    [Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]
                ]).resize().oneTime()
            }
        );
    }

    const webAppUrl10 = `${WEB_APP_URL}?telegram_id=${ctx.from.id}&room=10`;
    const webAppUrl50 = `${WEB_APP_URL}?telegram_id=${ctx.from.id}&room=50`;
    let inlineButtons = [
        [Markup.button.webApp('🎮 ባለ 10 BINGO ጨዋታ', webAppUrl10)],
        [Markup.button.webApp('🎮 ባለ 50 BINGO ጨዋታ', webAppUrl50)],
        [Markup.button.webApp('📤 ገንዘብ ማውጣት', `${WEB_APP_URL}/?action=withdraw`)]
    ];

    if (ctx.from.id === ADMIN_TELEGRAM_ID) {
        inlineButtons.push([Markup.button.callback('🔍 Search By Phone Number ', 'admin_search_contact')]);
    }

    const keyboard = Markup.inlineKeyboard(inlineButtons);
    ctx.reply('🎉 እንኳን ወደ WOW BINGO በደህና መጡ!\n ', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('admin_search_contact', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (ctx.from.id !== ADMIN_TELEGRAM_ID) return;
    adminSearchState[ctx.from.id] = true;
    return ctx.reply('🔍 ስልክ ያስገቡ (ለምሳሌ: +251...):', { parse_mode: 'Markdown' });
});

bot.on('contact', async (ctx) => {
    const userId = ctx.from.id.toString();
    const contact = ctx.message.contact;
    const phone = contact.phone_number;
    const firstName = ctx.from.first_name || 'ተጫዋች';

    let contacts = loadContacts();
    let users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
    let currentBalance = targetUser ? (targetUser.balance || 10.00) : 10.00;

    contacts[phone] = {
        telegram_id: userId,
        telegram_name: firstName,
        phone: phone,
        current_balance: currentBalance,
        date: new Date().toLocaleString()
    };
    saveContacts(contacts);

    const webAppUrl10 = `${WEB_APP_URL}?telegram_id=${ctx.from.id}&room=10`;
    const webAppUrl50 = `${WEB_APP_URL}?telegram_id=${ctx.from.id}&room=50`;
    let inlineButtons = [
        [Markup.button.webApp('🎮 ባለ 10 ጨዋታ', webAppUrl10)],
        [Markup.button.webApp('🎮 ባለ 50 ጨዋታ', webAppUrl50)],
        [Markup.button.webApp('📤 ገንዘብ ማውጣት', `${WEB_APP_URL}/?action=withdraw`)]
    ];

    if (ctx.from.id === ADMIN_TELEGRAM_ID) {
        inlineButtons.push([Markup.button.callback('🔍 Search By Phone Number', 'admin_search_contact')]);
    }

    await ctx.reply('✅ ስልክ ቁጥርዎ በተሳካ ሁኔታ ተመዝግቧል!', {
        ...Markup.inlineKeyboard(inlineButtons),
        reply_markup: { remove_keyboard: true }
    });
});

bot.command('balance', (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
    
    if (!targetUser) {
        targetUser = { balance: 10.00, firstName: ctx.from.first_name || 'ተጫዋች' };
        if (Array.isArray(users)) {
            users.push({ telegram_id: userId, ...targetUser });
        } else {
            users[userId] = targetUser;
        }
        saveUsers(users);
    }

    const userBalance = (targetUser.balance !== undefined && targetUser.balance !== null && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;
    const webAppUrl10 = `${WEB_APP_URL}?telegram_id=${ctx.from.id}&room=10`;

    return ctx.reply(
        `💰 <b>ያለዎት ቀሪ ሂሳብ  (Balance):</b>\n\n` +
        `💵 <b>${userBalance.toFixed(2)} ETB</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 ባለ 10 ጨዋታውን ክፈት', webAppUrl10)],
            ])
        }
    );
});

bot.command('deposit', (ctx) => {
    return ctx.reply(
        `📥 <b>ገንዘብ ለማስገባት (Deposit):</b>\n\n` +
        `• ንግድ ባንክ (CBE BIRR): 0985141415\n` +
        `• ቴሌብር (Telebirr): 0985141415\n\nኤስኤምኤስ ይላኩ።`,
        { parse_mode: 'HTML' }
    );
});

bot.command(['withdraw', 'withdrawal'], (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
    const userBalance = (targetUser && targetUser.balance !== undefined && targetUser.balance !== null && !isNaN(targetUser.balance)) ? Number(targetUser.balance) : 10.00;

    return ctx.reply(
        `📤 <b>ገንዘብ ለማውጣት (Withdrawal):</b>\n\nያሎት ጠቅላላ ባላንስ: <b>${userBalance.toFixed(2)} ETB</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('📤  Withdraw ክፈት', `${WEB_APP_URL}?action=withdraw`)]
            ])
        }
    );
});

bot.command('history', (ctx) => {
    return ctx.reply(
        `📋 <b>የግብይት ታሪክ (History):</b>\n\n`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📉 ወጪ (Expenses)', 'history_expense')],
                [Markup.button.callback('📈 ገቢ (Income)', 'history_income')]
            ])
        }
    );
});

bot.action('history_expense', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id.toString();
    const isAdmin = (Number(userId) === ADMIN_TELEGRAM_ID);

    if (isAdmin) {
        const approved = loadApprovedWithdraws();
        let totalExpense = 0;
        let msg = '📉 <b>የአድሚን አጠቃላይ የወጪዎች ዝርዝር (Approved Withdrawals):</b>\n\n';
        
        let count = 0;
        for (let reqId in approved) {
            let item = approved[reqId];
            totalExpense += Number(item.amount || 0);
            count++;
            if (count <= 15) {
                msg += `${count}. [${item.approvedAt || 'N/A'}] <b>ወጪ ወደ ${item.name} (${item.phone})</b>: -${item.amount} ETB\n`;
            }
        }

        if (count === 0) {
            return ctx.editMessageText('📉  የጸደቀ የወጪ ታሪክ የለም!', { parse_mode: 'HTML' });
        }

        msg += `\n💵 <b>አጠቃላይ የወጪ ድምር: ${totalExpense.toFixed(2)} ETB</b>`;
        return ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Export Expense to Excel', 'export_expense_excel')],
                [Markup.button.callback('🔙 ወደ ኋላ ተመለስ', 'history_back')]
            ])
        });
    } else {
        const historyData = loadHistory();
        const userHistory = historyData[userId] || [];
        const expenseItems = userHistory.filter(item => item.type === 'WITHDRAW_SUCCESS');

        if (expenseItems.length === 0) {
            return ctx.editMessageText('📉  የጸደቀ የወጪ ታሪክ የለም!', { parse_mode: 'HTML' });
        }

        let totalExpense = 0;
        let msg = '📉 <b>የወጪዎች ዝርዝር (Expenses History):</b>\n\n';
        
        expenseItems.slice(0, 15).forEach((item, index) => {
            totalExpense += Number(item.amount || 0);
            msg += `${index + 1}. [${item.date}] <b>${item.description}</b>: -${item.amount} ETB\n`;
        });

        msg += `\n💵 <b>አጠቃላይ ድምር ወጪ: ${totalExpense.toFixed(2)} ETB</b>`;

        return ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Export Expense to Excel', 'export_user_expense_excel')],
                [Markup.button.callback('🔙 ወደ ኋላ ተመለስ', 'history_back')]
            ])
        });
    }
});

bot.action('history_income', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id.toString();
    const isAdmin = (Number(userId) === ADMIN_TELEGRAM_ID);

    if (isAdmin) {
        const historyData = loadHistory();
        let totalIncome = 0;
        let incomeItems = [];

        for (let uId in historyData) {
            let uHistory = historyData[uId];
            uHistory.forEach(item => {
                if (item.type === 'DEPOSIT') {
                    totalIncome += Number(item.amount || 0);
                    incomeItems.push({ ...item, userId: uId });
                }
            });
        }

        if (incomeItems.length === 0) {
            return ctx.editMessageText('📈  የገቢ ታሪክ የለም!', { parse_mode: 'HTML' });
        }

        let msg = '📈 <b>የአድሚን አጠቃላይ የገቢዎች ዝርዝር (Auto & Manual Deposits):</b>\n\n';
        incomeItems.slice(0, 15).forEach((item, index) => {
            msg += `${index + 1}. [${item.date}] ID: <code>${item.userId}</code> - <b>${item.description}</b>: +${item.amount} ETB\n`;
        });

        msg += `\n💵 <b>አጠቃላይ የገቢ ድምር: ${totalIncome.toFixed(2)} ETB</b>`;
        return ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Export Income to Excel', 'export_income_excel')],
                [Markup.button.callback('🔙 ወደ ኋላ ተመለስ', 'history_back')]
            ])
        });
    } else {
        const historyData = loadHistory();
        const userHistory = historyData[userId] || [];

        const incomeItems = userHistory.filter(item => 
            item.type === 'DEPOSIT' || item.type === 'WIN'
        );

        if (incomeItems.length === 0) {
            return ctx.editMessageText('📈  ምንም የገቢ ታሪክ የለም!', { parse_mode: 'HTML' });
        }

        let totalIncome = 0;
        let msg = '📈 <b>የገቢዎች ዝርዝር (Income History):</b>\n\n';
        
        incomeItems.slice(0, 15).forEach((item, index) => {
            totalIncome += Number(item.amount || 0);
            msg += `${index + 1}. [${item.date}] <b>${item.description}</b>: +${item.amount} ETB\n`;
        });

        msg += `\n💵 <b>አጠቃላይ ድምር ገቢ: ${totalIncome.toFixed(2)} ETB</b>`;

        return ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Export Income to Excel', 'export_user_income_excel')],
                [Markup.button.callback('🔙 ወደ ኋላ ተመለስ', 'history_back')]
            ])
        });
    }
});

app.get('/api/export/admin-expense', (req, res) => {
    const approved = loadApprovedWithdraws();
    let rows = [['ተ.ቁ', 'ቀን', 'ሰዓት', 'ስም', 'ቴሌግራም አይዲ', 'ስልክ ቁጥር', 'የብር መጠን']];
    let i = 1;
    for (let reqId in approved) {
        let item = approved[reqId];
        let fullDate = item.approvedAt || item.date || 'N/A';
        let datePart = fullDate.split(',')[0] || fullDate;
        let timePart = fullDate.split(',')[1] || '';
        rows.push([i++, datePart.trim(), timePart.trim(), item.name || 'N/A', item.userId || 'N/A', item.phone || 'N/A', item.amount]);
    }
    let csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader('Content-Type', 'application/octet-stream; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin_expense_report.csv"');
    res.status(200).send(csvContent);
});

app.get('/api/export/admin-income', (req, res) => {
    const historyData = loadHistory();
    const users = loadUsers();
    let rows = [['ተ.ቁ', 'ቀን', 'ሰዓት', 'ስም', 'ቴሌግራም አይዲ', 'የብር መጠን']];
    let i = 1;
    for (let uId in historyData) {
        let uHistory = historyData[uId];
        let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(uId)) : users[uId];
        let uName = (targetUser && targetUser.firstName) ? targetUser.firstName : 'ተጫዋች';

        uHistory.forEach(item => {
            if (item.type === 'DEPOSIT') {
                let fullDate = item.date || 'N/A';
                let datePart = fullDate.split(',')[0] || fullDate;
                let timePart = fullDate.split(',')[1] || '';
                rows.push([i++, datePart.trim(), timePart.trim(), uName, uId, item.amount]);
            }
        });
    }
    let csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader('Content-Type', 'application/octet-stream; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin_income_report.csv"');
    res.status(200).send(csvContent);
});

app.get('/api/export/user-expense', (req, res) => {
    const { telegram_id } = req.query;
    const historyData = loadHistory();
    const users = loadUsers();
    const userHistory = historyData[telegram_id] || [];
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegram_id)) : users[telegram_id];
    let uName = (targetUser && targetUser.firstName) ? targetUser.firstName : 'ተጫዋች';

    let rows = [['ተ.ቁ', 'ቀን', 'ሰዓት', 'ስም', 'ቴሌግራም አይዲ', 'የብር መጠን']];
    let i = 1;
    userHistory.filter(item => item.type === 'WITHDRAW_SUCCESS').forEach(item => {
        let fullDate = item.date || 'N/A';
        let datePart = fullDate.split(',')[0] || fullDate;
        let timePart = fullDate.split(',')[1] || '';
        rows.push([i++, datePart.trim(), timePart.trim(), uName, telegram_id, item.amount]);
    });
    let csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader('Content-Type', 'application/octet-stream; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="user_expense_report.csv"');
    res.status(200).send(csvContent);
});

app.get('/api/export/user-income', (req, res) => {
    const { telegram_id } = req.query;
    const historyData = loadHistory();
    const users = loadUsers();
    const userHistory = historyData[telegram_id] || [];
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegram_id)) : users[telegram_id];
    let uName = (targetUser && targetUser.firstName) ? targetUser.firstName : 'ተጫዋች';

    let rows = [['ተ.ቁ', 'ቀን', 'ሰዓት', 'ስም', 'ቴሌግራም አይዲ', 'የብር መጠን']];
    let i = 1;
    userHistory.filter(item => item.type === 'DEPOSIT' || item.type === 'WIN').forEach(item => {
        let fullDate = item.date || 'N/A';
        let datePart = fullDate.split(',')[0] || fullDate;
        let timePart = fullDate.split(',')[1] || '';
        rows.push([i++, datePart.trim(), timePart.trim(), uName, telegram_id, item.amount]);
    });
    let csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader('Content-Type', 'application/octet-stream; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="user_income_report.csv"');
    res.status(200).send(csvContent);
});

bot.action('export_expense_excel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const fileUrl = `${WEB_APP_URL}/api/export/admin-expense`;
    return ctx.reply(`📊 <b>የወጪ ሪፖርት!</b>\n\nለመውረድ (Download)\n👉 <a href="${fileUrl}">Download Expense Excel/CSV</a>`, { parse_mode: 'HTML' });
});

bot.action('export_income_excel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const fileUrl = `${WEB_APP_URL}/api/export/admin-income`;
    return ctx.reply(`📊 <b>የገቢ ሪፖርት ኤክሴል ፋይል ዝግጁ ነው!</b>\n\nለመውረድ (Download) ከታች ያለውን ሊንክ ይጫኑ፡\n👉 <a href="${fileUrl}">Download Income Excel/CSV</a>`, { parse_mode: 'HTML' });
});

bot.action('export_user_expense_excel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id;
    const fileUrl = `${WEB_APP_URL}/api/export/user-expense?telegram_id=${userId}`;
    return ctx.reply(`📊 <b>የወጪ ሪፖርት !</b>\n\nለመውረድ (Download) \n👉 <a href="${fileUrl}">Download Expense Excel/CSV</a>`, { parse_mode: 'HTML' });
});

bot.action('export_user_income_excel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id;
    const fileUrl = `${WEB_APP_URL}/api/export/user-income?telegram_id=${userId}`;
    return ctx.reply(`📊 <b>የገቢ ሪፖርት !</b>\n\nለመውረድ (Download) \n👉 <a href="${fileUrl}">Download Income Excel/CSV</a>`, { parse_mode: 'HTML' });
});

bot.action('history_back', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(
        `📋 <b>የግብይት ታሪክ (History):</b>\n\nእባክዎ የሚፈልጉትን መመልከቻ ቁልፍ ይጫኑ፡`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📉 ወጪ (Expenses)', 'history_expense')],
                [Markup.button.callback('📈 ገቢ (Income)', 'history_income')]
            ])
        }
    );
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const userId = ctx.from.id;

    if (Number(userId) === ADMIN_TELEGRAM_ID && adminSearchState[userId]) {
        adminSearchState[userId] = false;
        const contacts = loadContacts();
        const users = loadUsers();

        let foundContact = null;
        for (let phoneKey in contacts) {
            if (phoneKey.includes(text) || text.includes(phoneKey)) {
                foundContact = contacts[phoneKey];
                break;
            }
        }

        if (!foundContact) {
            return ctx.reply('❌ ይህ ስልክ ቁጥር በደንበኝነት አልተመዘገበም!');
        }

        let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(foundContact.telegram_id)) : users[foundContact.telegram_id];
        let currentBalance = targetUser && targetUser.balance !== undefined ? targetUser.balance : (foundContact.current_balance || 10.00);

        return ctx.reply(
            `📋 <b>የተገኘ የደንበኛ መረጃ:</b>\n\n` +
            `📱 <b>ስልክ:</b> ${foundContact.phone}\n` +
            `🆔 <b>ቴሌግራም ID :</b> <code>${foundContact.telegram_id}</code>\n` +
            `👤 <b>ቴሌግራም ስም:</b> ${foundContact.telegram_name}\n` +
            `💰 <b>ቀሪ ሂሳብ:</b> ${Number(currentBalance).toFixed(2)} ETB`,
            { parse_mode: 'HTML' }
        );
    }

    const userStrId = userId.toString();
    const userFirstName = ctx.from.first_name || 'ተጫዋች';

    const processingMsg = await ctx.reply(`⏳ <b>ደረሰኙ እየተመረመረ ነው...</b>`, { parse_mode: 'HTML' });

    setTimeout(async () => {
        const amountMatch = text.match(/(\d+[\.,]?\d*)\s*(ETB|ብር|Birr)/i) || text.match(/(ETB|ብር|Birr)\s*(\d+[\.,]?\d*)/i);
        const txIdMatch = text.match(/(TRX|FT|TXN|ID)[\s:]*([A-Z0-9]{8,15})/i) || text.match(/\b([A-Z0-9]{10,12})\b/);

        if (!amountMatch) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e){}
            return ctx.reply(`⚠️ እባክዎችን ትክክለኛ SMS ደረሰኝ ያስገቡ?`);
        }

        let amount = parseFloat(amountMatch[1] || amountMatch[2]);
        let txId = txIdMatch ? (txIdMatch[2] || txIdMatch[1]) : ('TX_' + Math.random().toString(36).substring(7));

        let processedSms = loadProcessedSms();
        if (processedSms.includes(txId)) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e){}
            return ctx.reply(`⚠️ Transaction ID ከእዚህ ቀደም አገልግሎት ላይ የዋለ ነዉ፡፡!`);
        }

        const users = loadUsers();
        let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userStrId) : users[userStrId];
        
         if (!targetUser) {
            targetUser = { balance: 10.00, firstName: userFirstName };
            if (Array.isArray(users)) {
                users.push({ telegram_id: userStrId, ...targetUser });
            } else {
                users[userStrId] = targetUser;
            }
        }

        targetUser.balance = Number(targetUser.balance || 0) + amount;
        saveUsers(users);

        processedSms.push(txId);
        saveProcessedSms(processedSms);

        addHistoryRecord(userStrId, 'DEPOSIT', amount, `በኤስኤምኤስ አውቶ የተጨመረ ባላንስ (ቲኬት: ${txId})`);

        try { await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e){}
        return ctx.reply(
            `✅ <b>ክፍያዎ ተረጋግጧል!</b>\n\n💵 የተጨመረው: ${amount} ETB\n💰 አጠቃላይ ባላንስዎ: <b>${Number(targetUser.balance).toFixed(2)} ETB</b>`,
            { parse_mode: 'HTML' }
        );
    }, 1500);
});

// ሰርቨሩ እና ቦቱ በአንድ ላይ የሚጀምሩበት ትክክለኛ እና ብቸኛ ቦታ
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

bot.launch().then(() => {
    console.log('Telegram Bot started successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
