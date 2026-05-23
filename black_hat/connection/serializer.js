const { getContentType, downloadContentFromMessage, downloadMediaMessage } = require('gifted-baileys');
const { getLidMapping } = require('./groupCache');
const { getSetting } = require("../database/settings");

const standardizeJid = (jid) => {
    if (!jid) return '';
    try {
        jid = typeof jid === 'string' ? jid : 
            (jid.decodeJid ? jid.decodeJid() : String(jid));
        jid = jid.split(':')[0].split('/')[0];
        if (!jid.includes('@')) {
            jid += '@s.whatsapp.net';
        } else if (jid.endsWith('@lid')) {
            return jid.toLowerCase();
        }
        return jid.toLowerCase();
    } catch (e) {
        console.error('JID standardization error:', e);
        return '';
    }
};

const convertLidToJid = (lid) => {
    if (!lid) return '';
    if (!lid.endsWith('@lid')) return lid;
    const cached = getLidMapping(lid);
    if (cached) return cached;
    return lid;
};

const serializeMessage = async (ms, Gifted, settings = {}) => {
    if (!ms?.message || !ms?.key) return null;

    const botId = standardizeJid(Gifted.user?.id);
    const type = getContentType(ms.message);
    
    const hasEntryPointContext = 
        ms.message?.extendedTextMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.imageMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.videoMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.documentMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.audioMessage?.contextInfo?.entryPointConversionApp === 'whatsapp';

    const isMessageYourself = hasEntryPointContext && ms.key.remoteJid.endsWith('@lid') && ms.key.fromMe;
    const from = isMessageYourself ? botId : standardizeJid(ms.key.remoteJid);
    const isGroup = from.endsWith('@g.us');
    
    const sendr = ms.key.fromMe 
        ? (Gifted.user.id.split(':')[0] + '@s.whatsapp.net' || Gifted.user.id) 
        : (ms.key.senderPn || ms.key.participantPn || ms.key.participantAlt || ms.key.remoteJidAlt || ms.key.remoteJid || ms.key.participant);
    
    let body = '';
    let isButtonResponse = false;
    let buttonId = null;
    
    if (ms.message?.interactiveResponseMessage) {
        isButtonResponse = true;
        try {
            const paramsJson = ms.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                buttonId = JSON.parse(paramsJson)?.id || null;
            }
        } catch (e) {
            buttonId = null;
        }
        if (!buttonId) {
            buttonId = ms.message.interactiveResponseMessage.buttonId || null;
        }
        body = buttonId || ms.message.interactiveResponseMessage?.body?.text || '';
    } else if (ms.message?.buttonsResponseMessage?.selectedButtonId) {
        isButtonResponse = true;
        buttonId = ms.message.buttonsResponseMessage.selectedButtonId;
        body = buttonId;
    } else if (ms.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        isButtonResponse = true;
        buttonId = ms.message.listResponseMessage.singleSelectReply.selectedRowId;
        body = buttonId;
    } else if (ms.message?.templateButtonReplyMessage?.selectedId) {
        isButtonResponse = true;
        buttonId = ms.message.templateButtonReplyMessage.selectedId;
        body = buttonId;
    } else if (type === 'conversation') {
        body = ms.message.conversation;
    } else if (type === 'extendedTextMessage') {
        body = ms.message.extendedTextMessage.text;
    } else if (type === 'imageMessage' && ms.message.imageMessage.caption) {
        body = ms.message.imageMessage.caption;
    } else if (type === 'videoMessage' && ms.message.videoMessage.caption) {
        body = ms.message.videoMessage.caption;
    }

// ── PREFIX LOGIC ──────────────────────────────────────────────────────────────

const rawPrefix = await getSetting("PREFIX") ?? settings.PREFIX ?? '.';

body = (body || '').toString().trim();

const lowerBody = body.toLowerCase();

// SAFE PREFIX LIST
const prefixList = Array.isArray(rawPrefix)
    ? rawPrefix
    : typeof rawPrefix === 'string'
        ? rawPrefix.split(',')
        : [];

// CLEAN PREFIXES
const validPrefixes = [...new Set(
    prefixList
        .map(p => String(p).trim())
        .filter(Boolean)
)];

// NULL PREFIX CHECK
const nullPrefix =
    rawPrefix === null ||
    rawPrefix === 'null' ||
    rawPrefix === '' ||
    validPrefixes.length === 0;

let matchedPrefix = '';
let isCommand = false;

// DEBUG
console.log("📌 RAW PREFIX:", rawPrefix);

// NULL PREFIX MODE
if (nullPrefix) {

    const firstWord = lowerBody.split(/\s+/)[0];

    isCommand = firstWord.length > 0;

    matchedPrefix = '';

    console.log("⚡ MODE: NULL PREFIX");
}

// NORMAL PREFIX MODE
else {

    matchedPrefix = validPrefixes
        .sort((a, b) => b.length - a.length)
        .find(p => lowerBody.startsWith(
            String(p).toLowerCase()
        )) || '';

    isCommand = matchedPrefix.length > 0;

    console.log("⚡ MODE: PREFIX");
}

// REMOVE PREFIX
const fullBody = isCommand
    ? body.slice(matchedPrefix.length).trim()
    : body;

// COMMAND
const command = fullBody
    ? fullBody.split(/\s+/)[0].toLowerCase()
    : '';

// ARGS
const args = fullBody
    ? fullBody.split(/\s+/).slice(1)
    : [];

// QUERY
const q = args.join(' ');

// PREFIX USED
const botPrefix = matchedPrefix || null;
// ── FINAL DEBUG LOG ──────────────────────────────────────────────────────────
console.log("╭──────────────────────────────╮");
console.log("│ 🚀 PREFIX PARSE COMPLETE     │");
console.log("╰──────────────────────────────╯");

console.log("💬 FULL BODY:", fullBody);
console.log("🎯 COMMAND:", command || "NONE");
console.log("📦 ARGS:", args);
console.log("🔎 QUERY:", q || "NONE");
console.log("🏷️ USED PREFIX:", botPrefix || "NULL");
console.log("════════════════════════════════════════");
// ─────────────────────────────────────────────────────────────────────────────

    const repliedMessage = ms.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
    const quoted = type == 'extendedTextMessage' && 
        ms.message.extendedTextMessage.contextInfo != null 
        ? ms.message.extendedTextMessage.contextInfo.quotedMessage || [] 
        : [];
    
    const mentionedJid = (ms.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).map(standardizeJid);
    const tagged = ms.mtype === 'extendedTextMessage' && ms.message.extendedTextMessage.contextInfo != null
        ? ms.message.extendedTextMessage.contextInfo.mentionedJid
        : [];
    
    const contextInfo = ms.message?.extendedTextMessage?.contextInfo || 
        ms.message?.imageMessage?.contextInfo ||
        ms.message?.videoMessage?.contextInfo ||
        ms.message?.audioMessage?.contextInfo ||
        ms.message?.documentMessage?.contextInfo ||
        ms.message?.stickerMessage?.contextInfo || null;
    
    const quotedMsg = contextInfo?.quotedMessage || null;
    const rawQuotedUser = contextInfo?.participant || contextInfo?.remoteJid;
    const quotedUser = convertLidToJid(standardizeJid(rawQuotedUser));
    const repliedMessageAuthor = convertLidToJid(standardizeJid(contextInfo?.participant));
    
    const quotedStanzaId = contextInfo?.stanzaId || null;
    const quotedKey = quotedStanzaId ? {
        remoteJid: from,
        fromMe: rawQuotedUser === botId || contextInfo?.participant === botId,
        id: quotedStanzaId,
        participant: isGroup ? rawQuotedUser : undefined
    } : null;
    
    let messageAuthor = isGroup 
        ? standardizeJid(ms.key.participant || ms.participant || from)
        : from;
    if (ms.key.fromMe) messageAuthor = botId;
    
    const user = mentionedJid.length > 0 
        ? mentionedJid[0] 
        : repliedMessage 
            ? repliedMessageAuthor 
            : '';

    return {
        ms,
        mek: ms,
        type,
        from,
        isGroup,
        sender: sendr,
        botId,
        body,
        isCommand,
        command,
        args,
        q: args.join(' '),
        pushName: ms.pushName || (ms.key.fromMe ? Gifted.user?.name : null) || 'User',
        quoted,
        repliedMessage,
        mentionedJid,
        tagged,
        quotedMsg,
        quotedKey,
        quotedUser,
        repliedMessageAuthor,
        messageAuthor,
        user,
        prefix: botPrefix,
        isButtonResponse,
        buttonId
    };
};

module.exports = {
    standardizeJid,
    convertLidToJid,
    serializeMessage,
    downloadMediaMessage
};
