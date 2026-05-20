const moment = require("moment-timezone");
const { getSetting } = require("../database/settings");
const { getGroupSetting } = require("../database/groupSettings");
const { getSudoNumbers } = require("../database/sudo");
const { sendButtons } = require("gifted-btns");
const { cachedGroupMetadata, getLidMapping } = require("./groupCache");

const DEV_NUMBERS = ['255634523742', '255794469700', '255781755667'];

const isSuperUser = async (jid, Gifted) => {
    if (!jid) return false;
    const num = jid.split("@")[0].split(":")[0];
    const ownerNumber = await getSetting("OWNER_NUMBER");
    const botNum = Gifted.user?.id?.split(":")[0];
    if (num === ownerNumber || num === botNum) return true;
    if (DEV_NUMBERS.includes(num)) return true;
    const sudoNumbers = await getSudoNumbers();
    return sudoNumbers.includes(num);
};

const DEFAULT_PLACEHOLDER = "https://files.catbox.moe/9aciic.png";

const getProfilePic = async (Gifted, jid) => {
    try {
        return await Gifted.profilePictureUrl(jid, "image");
    } catch {
        return DEFAULT_PLACEHOLDER;
    }
};

const formatJid = (jid) => {
    if (!jid) return "Unknown";
    return jid.split("@")[0];
};

const getJidFromLidUsingMetadata = (participant, groupMeta) => {
    if (!participant || !groupMeta?.participants) return null;

    for (const p of groupMeta.participants) {
        if (p.id === participant || p.lid === participant) {
            const jid = p.pn || p.jid || p.phoneNumber;
            if (jid && jid.endsWith("@s.whatsapp.net")) {
                return jid;
            }
        }
    }

    return null;
};

const getJidFromParticipant = async (Gifted, participant, groupMeta = null) => {
    if (!participant) return participant;

    if (participant.endsWith("@s.whatsapp.net")) {
        return participant;
    }

    if (participant.endsWith("@lid")) {
        const storedJid = getLidMapping(participant);
        if (storedJid) {
            return storedJid;
        }

        if (groupMeta?.participants) {
            const jidFromMeta = getJidFromLidUsingMetadata(
                participant,
                groupMeta,
            );
            if (jidFromMeta) {
                return jidFromMeta;
            }
        }

        try {
            if (Gifted.lidToJid) {
                const result = await Gifted.lidToJid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) {}

        try {
            if (Gifted.getJidFromLid) {
                const result = await Gifted.getJidFromLid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) {}

        return participant;
    }

    const num = participant.split("@")[0];
    if (num && /^\d+$/.test(num)) {
        return `${num}@s.whatsapp.net`;
    }

    return participant;
};

const getDisplayNumber = async (Gifted, participant, groupMeta = null) => {
    const targetJid = await getJidFromParticipant(
        Gifted,
        participant,
        groupMeta,
    );
    return formatJid(targetJid);
};

const getFreshGroupMetadata = async (Gifted, groupJid) => {
    try {
        return await Gifted.groupMetadata(groupJid);
    } catch (error) {
        return null;
    }
};

// ─── FIXED: multiline + image ────────────────────────────────────────────────
const extractMedia = (raw, ctx = {}) => {
    if (!raw) {
        console.log("[extractMedia] raw is empty/null — returning empty");
        return { text: "", image: null };
    }

    console.log("[extractMedia] raw from DB:", JSON.stringify(raw));

    // Fix escaped newlines saved from DB (\\n → real \n)
    let text = raw.replace(/\\n/g, "\n");
    console.log("[extractMedia] after \\n fix:", JSON.stringify(text));

    const map = {
        "&mention": ctx.mention || "",
        "&gname":   ctx.gname   || "",
        "&desc":    ctx.desc    || "",
        "&size":    String(ctx.size || ""),
        "&pp":      ctx.pp      || "",
        "&gpp":     ctx.gpp     || "",
    };

    for (const key in map) {
        text = text.split(key).join(map[key]);
    }

    console.log("[extractMedia] after placeholder replace:", JSON.stringify(text));

    // Last non-empty line — if URL use as image
    const lines = text.split("\n");
    let image = null;

    let lastIdx = lines.length - 1;
    while (lastIdx >= 0 && lines[lastIdx].trim() === "") lastIdx--;

    const lastLine = lines[lastIdx]?.trim();
    console.log("[extractMedia] lastLine detected:", JSON.stringify(lastLine));

    if (lastLine && /^https?:\/\/\S+$/i.test(lastLine)) {
        image = lastLine;
        lines.splice(lastIdx, 1);
        console.log("[extractMedia] image URL extracted:", image);
    } else {
        console.log("[extractMedia] no image URL found in last line");
    }

    const finalText = lines.join("\n").trimEnd();
    console.log("[extractMedia] final text:", JSON.stringify(finalText));
    console.log("[extractMedia] final image:", image);

    return { text: finalText, image };
};

// Fetch WhatsApp CDN image as buffer using built-in https (no extra deps)
const fetchImageBuffer = async (url) => {
    if (!url || url === DEFAULT_PLACEHOLDER) {
        console.log("[fetchImageBuffer] skipped — no URL or placeholder");
        return null;
    }
    console.log("[fetchImageBuffer] fetching:", url);
    try {
        const https = require("https");
        const http  = require("http");
        const mod   = url.startsWith("https") ? https : http;
        return await new Promise((resolve) => {
            mod.get(url, { headers: { "User-Agent": "WhatsApp/2.23.20.0" } }, (res) => {
                console.log("[fetchImageBuffer] HTTP status:", res.statusCode);
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end",  () => {
                    const buf = Buffer.concat(chunks);
                    console.log("[fetchImageBuffer] buffer size:", buf.length, "bytes");
                    resolve(buf);
                });
                res.on("error", (e) => {
                    console.log("[fetchImageBuffer] stream error:", e.message);
                    resolve(null);
                });
            }).on("error", (e) => {
                console.log("[fetchImageBuffer] request error:", e.message);
                resolve(null);
            });
        });
    } catch (e) {
        console.log("[fetchImageBuffer] exception:", e.message);
        return null;
    }
};

// Send with image, fallback to text only
const sendGroupEvent = async (Gifted, groupJid, text, image, mentions) => {
    console.log("[sendGroupEvent] groupJid:", groupJid);
    console.log("[sendGroupEvent] image:", image);
    console.log("[sendGroupEvent] text:", JSON.stringify(text));
    try {
        if (image) {
            console.log("[sendGroupEvent] attempting image send...");
            const buffer = await fetchImageBuffer(image);
            if (buffer && buffer.length > 0) {
                console.log("[sendGroupEvent] sending image with caption");
                await Gifted.sendMessage(groupJid, {
                    image: buffer,
                    caption: text,
                    mentions,
                });
                console.log("[sendGroupEvent] image sent successfully ✅");
                return;
            }
            console.log("[sendGroupEvent] buffer empty/null — falling back to text");
        }
        console.log("[sendGroupEvent] sending text only");
        await Gifted.sendMessage(groupJid, { text, mentions });
        console.log("[sendGroupEvent] text sent successfully ✅");
    } catch (err) {
        console.error("[sendGroupEvent] error:", err.message);
    }
};
// ─────────────────────────────────────────────────────────────────────────────

const processedEvents = new Map();
const EVENT_DEDUP_INTERVAL = 5000;

const getEventKey = (groupJid, action, participants) => {
    return `${groupJid}:${action}:${participants.sort().join(',')}`;
};

const isDuplicateEvent = (groupJid, action, participants) => {
    const key = getEventKey(groupJid, action, participants);
    const now = Date.now();
    const lastProcessed = processedEvents.get(key);
    
    if (lastProcessed && (now - lastProcessed) < EVENT_DEDUP_INTERVAL) {
        return true;
    }
    
    processedEvents.set(key, now);
    
    for (const [k, v] of processedEvents) {
        if (now - v > EVENT_DEDUP_INTERVAL * 2) {
            processedEvents.delete(k);
        }
    }
    
    return false;
};

const setupGroupEventsListeners = (Gifted) => {
    Gifted.ev.on("group-participants.update", async (event) => {
        try {
            const { id: groupJid, participants, action, author } = event;

            if (!groupJid || !participants || participants.length === 0) return;

            const botJid = Gifted.user?.id?.split(":")[0] + "@s.whatsapp.net";
            
            if (action === "promote" || action === "demote") {
                if (author) {
                    const authorNum = author.split("@")[0].split(":")[0];
                    const botNum = botJid.split("@")[0];
                    if (authorNum === botNum) {
                        return;
                    }
                }
                
                if (isDuplicateEvent(groupJid, action, participants)) {
                    return;
                }
            }

            const timeZone =
                (await getSetting("TIME_ZONE")) || "Africa/Nairobi";
                        
            const currentTime = moment().tz(timeZone).format("h:mm A");
            const currentDate = moment().tz(timeZone).format("MMMM Do, YYYY");

            const groupMeta = await getFreshGroupMetadata(Gifted, groupJid);
            if (!groupMeta) return;

            const groupName = groupMeta.subject || "Unknown Group";
            const memberCount =
                groupMeta.size || groupMeta.participants?.length || 0;

            switch (action) {

                case "add": {
                    console.log("[WELCOME] member add event — group:", groupJid);
                    const welcomeEnabled = await getGroupSetting(groupJid, "WELCOME_MESSAGE");
                    console.log("[WELCOME] WELCOME_MESSAGE setting:", welcomeEnabled);
                    const isWelcomeOn =
                        welcomeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(welcomeEnabled).toLowerCase().trim());
                    if (!isWelcomeOn) {
                        console.log("[WELCOME] welcome is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "WELCOME_MESSAGE_TEXT"))
                        || "&mention Welcome 🎉";
                    console.log("[WELCOME] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    for (const participant of participants) {
                        try {
                            const userJid    = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            console.log("[WELCOME] processing participant:", userJid);

                            const profilePic = await getProfilePic(Gifted, userJid);
                            const groupPP    = await getProfilePic(Gifted, groupJid);
                            console.log("[WELCOME] pp:", profilePic);
                            console.log("[WELCOME] gpp:", groupPP);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname:   groupName,
                                desc:    groupMeta.desc || "No description",
                                size:    memberCount,
                                pp:      profilePic,
                                gpp:     groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            console.log("[WELCOME] extracted text:", JSON.stringify(text));
                            console.log("[WELCOME] extracted image:", image);
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("[WELCOME] error for participant:", err.message);
                        }
                    }
                    break;
                }

                case "remove": {
                    console.log("[GOODBYE] member remove event — group:", groupJid);
                    const goodbyeEnabled = await getGroupSetting(groupJid, "GOODBYE_MESSAGE");
                    console.log("[GOODBYE] GOODBYE_MESSAGE setting:", goodbyeEnabled);
                    const isGoodbyeOn =
                        goodbyeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(goodbyeEnabled).toLowerCase().trim());
                    if (!isGoodbyeOn) {
                        console.log("[GOODBYE] goodbye is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "GOODBYE_MESSAGE_TEXT"))
                        || "&mention left 👋";
                    console.log("[GOODBYE] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    for (const participant of participants) {
                        try {
                            const userJid    = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            console.log("[GOODBYE] processing participant:", userJid);

                            const profilePic = await getProfilePic(Gifted, userJid);
                            const groupPP    = await getProfilePic(Gifted, groupJid);
                            console.log("[GOODBYE] pp:", profilePic);
                            console.log("[GOODBYE] gpp:", groupPP);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname:   groupName,
                                desc:    groupMeta.desc || "No description",
                                size:    memberCount,
                                pp:      profilePic,
                                gpp:     groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            console.log("[GOODBYE] extracted text:", JSON.stringify(text));
                            console.log("[GOODBYE] extracted image:", image);
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("[GOODBYE] error for participant:", err.message);
                        }
                    }
                    break;
                }

                case "promote": {
                    const botJid = Gifted.user?.id?.split(":")[0] + "@s.whatsapp.net";
                    
                    const antiPromoteEnabled = await getGroupSetting(groupJid, "ANTIPROMOTE");
                    if (String(antiPromoteEnabled) === "true" && author) {
                        const authorJid = await getJidFromParticipant(Gifted, author, groupMeta);
                        const authorNum = authorJid.split("@")[0].split(":")[0];
                        const botNum = botJid.split("@")[0];
                        
                        const isAuthorSuperUser = await isSuperUser(authorJid, Gifted);
                        if (isAuthorSuperUser) break;
                        
                        let isBotAdmin = false;
                        for (const p of groupMeta?.participants || []) {
                            if (p.admin !== "admin" && p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, groupMeta);
                            const pNum = pJid.split("@")[0].split(":")[0];
                            if (pNum === botNum) {
                                isBotAdmin = true;
                                break;
                            }
                        }
                        
                        let isAuthorSuperAdmin = false;
                        for (const p of groupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, groupMeta);
                            const pNum = pJid.split("@")[0].split(":")[0];
                            if (pNum === authorNum) {
                                isAuthorSuperAdmin = true;
                                break;
                            }
                        }
                        
                        if (authorNum !== botNum && isBotAdmin) {
                            for (const participant of participants) {
                                try {
                                    const participantJid = await getJidFromParticipant(Gifted, participant, groupMeta);
                                    const participantNum = participantJid.split("@")[0].split(":")[0];
                                    
                                    const isParticipantSuperUser = await isSuperUser(participantJid, Gifted);
                                    
                                    let isParticipantSuperAdmin = false;
                                    for (const p of groupMeta?.participants || []) {
                                        if (p.admin !== "superadmin") continue;
                                        const pJid = await getJidFromParticipant(Gifted, p.id, groupMeta);
                                        const pNum = pJid.split("@")[0].split(":")[0];
                                        if (pNum === participantNum) {
                                            isParticipantSuperAdmin = true;
                                            break;
                                        }
                                    }
                                    
                                    const promotedNumber = formatJid(participantJid);
                                    const authorNumber = formatJid(authorJid);
                                    const skipParticipant = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    
                                    if (isAuthorProtected && skipParticipant) {
                                        continue;
                                    } else if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${promotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) {}
                                    } else if (skipParticipant) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${authorNumber} (promoted user is protected)...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                    } else {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting both users...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) {}
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                    }
                                } catch (err) {
                                    console.error("Anti-promote error:", err.message);
                                }
                            }
                            break;
                        }
                    }
                    
                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantJid = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const authorJid = author ? await getJidFromParticipant(Gifted, author, groupMeta) : null;
                            const promotedNumber = formatJid(participantJid);
                            const authorNumber = authorJid ? formatJid(authorJid) : "System";
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorNumber} *PROMOTED* @${promotedNumber}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("Promote notification error:", err.message);
                        }
                    }
                    break;
                }

                case "demote": {
                    const botJid2 = Gifted.user?.id?.split(":")[0] + "@s.whatsapp.net";
                    
                    const antiDemoteEnabled = await getGroupSetting(groupJid, "ANTIDEMOTE");
                    if (String(antiDemoteEnabled) === "true" && author) {
                        let freshGroupMeta;
                        try {
                            freshGroupMeta = await Gifted.groupMetadata(groupJid);
                        } catch (e) {
                            freshGroupMeta = groupMeta;
                        }
                        
                        const authorJid = await getJidFromParticipant(Gifted, author, freshGroupMeta);
                        const authorNum = authorJid.split("@")[0].split(":")[0];
                        const botNum = botJid2.split("@")[0];
                        
                        const isAuthorSuperUser = await isSuperUser(authorJid, Gifted);
                        if (isAuthorSuperUser) break;
                        
                        let isBotAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "admin" && p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, freshGroupMeta);
                            const pNum = pJid.split("@")[0].split(":")[0];
                            if (pNum === botNum) {
                                isBotAdmin = true;
                                break;
                            }
                        }
                        
                        let isAuthorSuperAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, freshGroupMeta);
                            const pNum = pJid.split("@")[0].split(":")[0];
                            if (pNum === authorNum) {
                                isAuthorSuperAdmin = true;
                                break;
                            }
                        }
                        
                        if (authorNum !== botNum && isBotAdmin) {
                            for (const participant of participants) {
                                try {
                                    const participantJid = await getJidFromParticipant(Gifted, participant, freshGroupMeta);
                                    const participantNum = participantJid.split("@")[0].split(":")[0];
                                    
                                    const isParticipantSuperUser = await isSuperUser(participantJid, Gifted);
                                    
                                    let isParticipantSuperAdmin = false;
                                    for (const p of freshGroupMeta?.participants || []) {
                                        if (p.admin !== "superadmin") continue;
                                        const pJid = await getJidFromParticipant(Gifted, p.id, freshGroupMeta);
                                        const pNum = pJid.split("@")[0].split(":")[0];
                                        if (pNum === participantNum) {
                                            isParticipantSuperAdmin = true;
                                            break;
                                        }
                                    }
                                    
                                    const demotedNumber = formatJid(participantJid);
                                    const authorNumber = formatJid(authorJid);
                                    const isProtected = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    
                                    if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Re-promoting @${demotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else if (isProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber} (protected user)...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    }
                                } catch (err) {
                                    console.error("Anti-demote error:", err.message);
                                }
                            }
                            break;
                        }
                    }
                    
                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantJid = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const authorJid = author ? await getJidFromParticipant(Gifted, author, groupMeta) : null;
                            const demotedNumber = formatJid(participantJid);
                            const authorNumber = authorJid ? formatJid(authorJid) : "System";
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorNumber} *DEMOTED* @${demotedNumber}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("Demote notification error:", err.message);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error("Group events handler error:", error.message);
        }
    });
};

module.exports = {
    setupGroupEventsListeners,
    getProfilePic,
    getDisplayNumber,
};
