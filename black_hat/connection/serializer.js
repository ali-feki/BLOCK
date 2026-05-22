const { getContentType, downloadContentFromMessage, downloadMediaMessage } = require('gifted-baileys');
const { getLidMapping } = require('./groupCache');

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

    const prefixes = settings.PREFIX ?? '.';

body = (body || '').toString().trim();

let usedPrefix = '';
let isCommand = false;

// LOG OBJECT (DEBUG MODE)
const prefixLog = {
    input: body,
    prefixes,
    usedPrefix: null,
    isCommand: false,
    mode: 'unknown',
    commandDetected: null,
};

// NULL PREFIX
if (prefixes === null || prefixes === 'null') {
    isCommand = true;
    usedPrefix = '';
    prefixLog.mode = 'NULL_PREFIX';
}

// MULTIPLE PREFIXES
else if (Array.isArray(prefixes)) {

    usedPrefix = prefixes
        .filter(p => typeof p === 'string' && p.length > 0)
        .sort((a, b) => b.length - a.length)
        .find(p => body.startsWith(p)) || '';

    isCommand = usedPrefix.length > 0;

    prefixLog.mode = 'MULTIPLE_PREFIX';
}

// SINGLE PREFIX
else if (typeof prefixes === 'string') {

    usedPrefix = body.startsWith(prefixes)
        ? prefixes
        : '';

    isCommand = usedPrefix.length > 0;

    prefixLog.mode = 'SINGLE_PREFIX';
}

// FINAL PROCESS
const fullBody = isCommand
    ? body.slice(usedPrefix.length).trim()
    : '';

const command = isCommand && fullBody
    ? fullBody.split(/\s+/)[0].toLowerCase()
    : '';

const args = isCommand && fullBody
    ? fullBody.split(/\s+/).slice(1)
    : [];

const q = args.join(' ');

const botPrefix = usedPrefix;

// UPDATE LOGS
prefixLog.usedPrefix = usedPrefix;
prefixLog.isCommand = isCommand;
prefixLog.commandDetected = command || null;

// CONSOLE LOG (DEBUG)
console.log("⚙️ PREFIX DEBUG LOG:", JSON.stringify(prefixLog, null, 2));

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
        
