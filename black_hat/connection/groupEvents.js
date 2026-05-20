const moment = require("moment-timezone");
const { getSetting } = require("../database/settings");
const { getGroupSetting } = require("../database/groupSettings");
const { getSudoNumbers } = require("../database/sudo");
const { cachedGroupMetadata, getLidMapping } = require("./groupCache");

const DEV_NUMBERS = ['923003588997', '255794469700', '255781755667'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Fix: single helper instead of repeated split chains everywhere
const extractNum = (jid) => jid?.split("@")[0]?.split(":")[0] ?? "";

const isSuperUser = async (jid, Gifted) => {
    if (!jid) return false;
    const num = extractNum(jid);
    const ownerNumber = await getSetting("OWNER_NUMBER");
    const botNum = extractNum(Gifted.user?.id);
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
            if (jid && jid.endsWith("@s.whatsapp.net")) return jid;
        }
    }
    return null;
};

const getJidFromParticipant = async (Gifted, participant, groupMeta = null) => {
    if (!participant) return participant;
    if (participant.endsWith("@s.whatsapp.net")) return participant;

    if (participant.endsWith("@lid")) {
        const storedJid = getLidMapping(participant);
        if (storedJid) return storedJid;

        if (groupMeta?.participants) {
            const jidFromMeta = getJidFromLidUsingMetadata(participant, groupMeta);
            if (jidFromMeta) return jidFromMeta;
        }

        try {
            if (Gifted.lidToJid) {
                const result = await Gifted.lidToJid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) { console.error("[getJidFromParticipant] lidToJid error:", e.message); }

        try {
            if (Gifted.getJidFromLid) {
                const result = await Gifted.getJidFromLid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) { console.error("[getJidFromParticipant] getJidFromLid error:", e.message); }

        return participant;
    }

    const num = participant.split("@")[0];
    if (num && /^\d+$/.test(num)) return `${num}@s.whatsapp.net`;
    return participant;
};

const getDisplayNumber = async (Gifted, participant, groupMeta = null) => {
    const targetJid = await getJidFromParticipant(Gifted, participant, groupMeta);
    return formatJid(targetJid);
};

const getFreshGroupMetadata = async (Gifted, groupJid) => {
    try {
        return await Gifted.groupMetadata(groupJid);
    } catch (error) {
        console.error("[getFreshGroupMetadata] error:", error.message);
        return null;
    }
};

// ─── PARTICIPANT MAP HELPER ───────────────────────────────────────────────────
// Build O(1) lookup map from groupMeta once per event
const buildParticipantMap = (groupMeta) => {
    const map = new Map();
    for (const p of groupMeta?.participants || []) {
        if (p.id) map.set(p.id, p);
        if (p.lid) map.set(p.lid, p);
    }
    return map;
};

// Check admin status using pre-built map — O(1)
const isAdminInMap = (jid, participantMap) => {
    const p = participantMap.get(jid);
    return p?.admin === "admin" || p?.admin === "superadmin";
};

const isSuperAdminInMap = (jid, participantMap) => {
    const p = participantMap.get(jid);
    return p?.admin === "superadmin";
};

// ─── EXTRACT MEDIA ───────────────────────────────────────────────────────────
const extractMedia = (raw, ctx = {}) => {
    if (!raw) {
        console.log("[extractMedia] raw is empty/null");
        return { text: "", image: null };
    }

    console.log("[extractMedia] raw from DB:", JSON.stringify(raw));

    // Fix escaped newlines from DB
    let text = raw.replace(/\\n/g, "\n");

    const ppUrl  = ctx.pp  || "";
    const gppUrl = ctx.gpp || "";

    let image = null;
    const lines = text.split("\n");
    const cleanLines = [];

    // Pass 1: detect &gpp / &pp alone on a line → use as image
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "&gpp") {
            if (!image && gppUrl) {
                image = gppUrl;
                console.log("[extractMedia] &gpp on own line → image set");
            }
            continue;
        }
        if (trimmed === "&pp") {
            if (!image && ppUrl) {
                image = ppUrl;
                console.log("[extractMedia] &pp on own line → image set");
            }
            continue;
        }
        cleanLines.push(line);
    }

    // Pass 2: replace all placeholders
    const map = {
        "&mention": ctx.mention || "",
        "&gname":   ctx.gname   || "",
        "&desc":    ctx.desc    || "",
        "&size":    String(ctx.size || ""),
        "&pp":      ppUrl,
        "&gpp":     gppUrl,
    };

    let joined = cleanLines.join("\n");
    for (const key in map) {
        joined = joined.split(key).join(map[key]);
    }

    // Pass 3: if no image yet, check last line for hardcoded URL
    if (!image) {
        const finalLines = joined.split("\n");
        let lastIdx = finalLines.length - 1;
        while (lastIdx >= 0 && finalLines[lastIdx].trim() === "") lastIdx--;

        const lastLine = finalLines[lastIdx]?.trim();
        if (lastLine && /^https?:\/\/\S+$/i.test(lastLine)) {
            image = lastLine;
            finalLines.splice(lastIdx, 1);
            joined = finalLines.join("\n");
            console.log("[extractMedia] hardcoded URL extracted as image");
        } else {
            console.log("[extractMedia] no image URL found");
        }
    }

    const finalText = joined.trimEnd();
    console.log("[extractMedia] final text:", JSON.stringify(finalText));
    console.log("[extractMedia] final image:", image);

    return { text: finalText, image };
};

// ─── FETCH IMAGE BUFFER ───────────────────────────────────────────────────────
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
            const req = mod.get(url, { headers: { "User-Agent": "WhatsApp/2.23.20.0" } }, (res) => {
                console.log("[fetchImageBuffer] HTTP status:", res.statusCode);
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end",  () => {
                    const buf = Buffer.concat(chunks);
                    console.log("[fetchImageBuffer] buffer size:", buf.length, "bytes");
                    resolve(buf);
                });
                res.on("error", (e) => {
                    console.error("[fetchImageBuffer] stream error:", e.message);
                    resolve(null);
                });
            });
            // Fix: timeout so bot doesn't hang on CDN failures
            req.setTimeout(5000, () => {
                console.error("[fetchImageBuffer] timeout — aborting");
                req.destroy();
                resolve(null);
            });
            req.on("error", (e) => {
                console.error("[fetchImageBuffer] request error:", e.message);
                resolve(null);
            });
        });
    } catch (e) {
        console.error("[fetchImageBuffer] exception:", e.message);
        return null;
    }
};

// ─── SEND GROUP EVENT ─────────────────────────────────────────────────────────
const sendGroupEvent = async (Gifted, groupJid, text, image, mentions) => {
    console.log("[sendGroupEvent] groupJid:", groupJid);
    console.log("[sendGroupEvent] image:", image ? "yes" : "null");
    console.log("[sendGroupEvent] text:", JSON.stringify(text));
    try {
        if (image) {
            console.log("[sendGroupEvent] attempting image send...");
            const buffer = await fetchImageBuffer(image);
            if (buffer && buffer.length > 0) {
                await Gifted.sendMessage(groupJid, { image: buffer, caption: text, mentions });
                console.log("[sendGroupEvent] image sent successfully ✅");
                return;
            }
            console.log("[sendGroupEvent] buffer empty — falling back to text");
        }
        await Gifted.sendMessage(groupJid, { text, mentions });
        console.log("[sendGroupEvent] text sent successfully ✅");
    } catch (err) {
        console.error("[sendGroupEvent] error:", err.message);
    }
};

// ─── DEDUP ────────────────────────────────────────────────────────────────────
const processedEvents = new Map();
const EVENT_DEDUP_INTERVAL = 5000;

const getEventKey = (groupJid, action, participants) => {
    // Fix: spread to avoid mutating original array
    return `${groupJid}:${action}:${[...participants].sort().join(",")}`;
};

const isDuplicateEvent = (groupJid, action, participants) => {
    const key = getEventKey(groupJid, action, participants);
    const now = Date.now();
    const last = processedEvents.get(key);
    if (last && now - last < EVENT_DEDUP_INTERVAL) return true;
    processedEvents.set(key, now);
    // Cleanup stale entries
    for (const [k, v] of processedEvents) {
        if (now - v > EVENT_DEDUP_INTERVAL * 2) processedEvents.delete(k);
    }
    return false;
};

// ─── MAIN LISTENER ───────────────────────────────────────────────────────────
const setupGroupEventsListeners = (Gifted) => {
    Gifted.ev.on("group-participants.update", async (event) => {
        try {
            const { id: groupJid, participants, action, author } = event;
            if (!groupJid || !participants || participants.length === 0) return;

            // Fix: define botJid ONCE here, reused everywhere below
            const botJid = extractNum(Gifted.user?.id) + "@s.whatsapp.net";
            const botNum = extractNum(botJid);

            if (action === "promote" || action === "demote") {
                if (author && extractNum(author) === botNum) return;
                if (isDuplicateEvent(groupJid, action, participants)) return;
            }

            const timeZone  = (await getSetting("TIME_ZONE")) || "Africa/Nairobi";
            const currentTime = moment().tz(timeZone).format("h:mm A");
            const currentDate = moment().tz(timeZone).format("MMMM Do, YYYY");

            const groupMeta = await getFreshGroupMetadata(Gifted, groupJid);
            if (!groupMeta) return;

            // Fix: build participant map ONCE per event — O(1) lookups below
            const participantMap = buildParticipantMap(groupMeta);

            const groupName   = groupMeta.subject || "Unknown Group";
            const memberCount = groupMeta.size || groupMeta.participants?.length || 0;

            switch (action) {

                // ─── WELCOME ─────────────────────────────────────────────
                case "add": {
                    console.log("[WELCOME] member add event — group:", groupJid);
                    const welcomeEnabled = await getGroupSetting(groupJid, "WELCOME_MESSAGE");
                    console.log("[WELCOME] WELCOME_MESSAGE setting:", welcomeEnabled);
                    const isWelcomeOn = welcomeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(welcomeEnabled).toLowerCase().trim());
                    if (!isWelcomeOn) {
                        console.log("[WELCOME] welcome is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "WELCOME_MESSAGE_TEXT"))
                        || "&mention Welcome 🎉";
                    console.log("[WELCOME] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    // Fix: resolve all participant JIDs in parallel
                    const resolvedJids = await Promise.all(
                        participants.map(p => getJidFromParticipant(Gifted, p, groupMeta))
                    );

                    for (const userJid of resolvedJids) {
                        try {
                            const userNumber = formatJid(userJid);
                            console.log("[WELCOME] processing participant:", userJid);

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(Gifted, userJid),
                                getProfilePic(Gifted, groupJid),
                            ]);
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

                // ─── GOODBYE ─────────────────────────────────────────────
                case "remove": {
                    console.log("[GOODBYE] member remove event — group:", groupJid);
                    const goodbyeEnabled = await getGroupSetting(groupJid, "GOODBYE_MESSAGE");
                    console.log("[GOODBYE] GOODBYE_MESSAGE setting:", goodbyeEnabled);
                    const isGoodbyeOn = goodbyeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(goodbyeEnabled).toLowerCase().trim());
                    if (!isGoodbyeOn) {
                        console.log("[GOODBYE] goodbye is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "GOODBYE_MESSAGE_TEXT"))
                        || "&mention left 👋";
                    console.log("[GOODBYE] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    // Fix: resolve all in parallel
                    const resolvedJids = await Promise.all(
                        participants.map(p => getJidFromParticipant(Gifted, p, groupMeta))
                    );

                    for (const userJid of resolvedJids) {
                        try {
                            const userNumber = formatJid(userJid);
                            console.log("[GOODBYE] processing participant:", userJid);

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(Gifted, userJid),
                                getProfilePic(Gifted, groupJid),
                            ]);
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

                // ─── PROMOTE ─────────────────────────────────────────────
                case "promote": {
                    const antiPromoteEnabled = await getGroupSetting(groupJid, "ANTIPROMOTE");
                    if (String(antiPromoteEnabled) === "true" && author) {
                        const authorJid = await getJidFromParticipant(Gifted, author, groupMeta);
                        const authorNum = extractNum(authorJid);

                        const isAuthorSuperUser = await isSuperUser(authorJid, Gifted);
                        if (isAuthorSuperUser) break;

                        // Fix: use participantMap for O(1) admin check
                        const isBotAdmin = isAdminInMap(botJid, participantMap) ||
                            [...participantMap.values()].some(p =>
                                extractNum(p.id) === botNum &&
                                (p.admin === "admin" || p.admin === "superadmin")
                            );
                        const isAuthorSuperAdmin = isSuperAdminInMap(author, participantMap);

                        if (authorNum !== botNum && isBotAdmin) {
                            // Fix: resolve all participants in parallel
                            const resolvedParticipants = await Promise.all(
                                participants.map(async (p) => ({
                                    raw: p,
                                    jid: await getJidFromParticipant(Gifted, p, groupMeta),
                                }))
                            );

                            for (const { jid: participantJid } of resolvedParticipants) {
                                try {
                                    const participantNum      = extractNum(participantJid);
                                    const isParticipantSuperUser   = await isSuperUser(participantJid, Gifted);
                                    const isParticipantSuperAdmin  = isSuperAdminInMap(participantJid, participantMap);
                                    const skipParticipant          = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected        = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    const promotedNumber           = formatJid(participantJid);
                                    const authorNumber             = formatJid(authorJid);

                                    if (isAuthorProtected && skipParticipant) {
                                        continue;
                                    } else if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${promotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) { console.error("[ANTIPROMOTE] demote error:", e.message); }
                                    } else if (skipParticipant) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${authorNumber} (promoted user is protected)...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) { console.error("[ANTIPROMOTE] demote author error:", e.message); }
                                    } else {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting both users...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) { console.error("[ANTIPROMOTE] demote participant error:", e.message); }
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) { console.error("[ANTIPROMOTE] demote author error:", e.message); }
                                    }
                                } catch (err) {
                                    console.error("[ANTIPROMOTE] error:", err.message);
                                }
                            }
                            break;
                        }
                    }

                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    const resolvedParticipants = await Promise.all(
                        participants.map(p => getJidFromParticipant(Gifted, p, groupMeta))
                    );
                    const authorJid = author ? await getJidFromParticipant(Gifted, author, groupMeta) : null;

                    for (const participantJid of resolvedParticipants) {
                        try {
                            const promotedNumber = formatJid(participantJid);
                            const authorNumber   = authorJid ? formatJid(authorJid) : "System";
                            const mentionsList   = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorNumber} *PROMOTED* @${promotedNumber}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("[PROMOTE] notification error:", err.message);
                        }
                    }
                    break;
                }

                // ─── DEMOTE ──────────────────────────────────────────────
                case "demote": {
                    const antiDemoteEnabled = await getGroupSetting(groupJid, "ANTIDEMOTE");
                    if (String(antiDemoteEnabled) === "true" && author) {
                        let freshGroupMeta;
                        try { freshGroupMeta = await Gifted.groupMetadata(groupJid); }
                        catch (e) {
                            console.error("[ANTIDEMOTE] groupMetadata error:", e.message);
                            freshGroupMeta = groupMeta;
                        }
                        const freshMap = buildParticipantMap(freshGroupMeta);

                        const authorJid = await getJidFromParticipant(Gifted, author, freshGroupMeta);
                        const authorNum = extractNum(authorJid);

                        const isAuthorSuperUser = await isSuperUser(authorJid, Gifted);
                        if (isAuthorSuperUser) break;

                        const isBotAdmin = [...freshMap.values()].some(p =>
                            extractNum(p.id) === botNum &&
                            (p.admin === "admin" || p.admin === "superadmin")
                        );
                        const isAuthorSuperAdmin = isSuperAdminInMap(author, freshMap);

                        if (authorNum !== botNum && isBotAdmin) {
                            const resolvedParticipants = await Promise.all(
                                participants.map(async (p) => ({
                                    raw: p,
                                    jid: await getJidFromParticipant(Gifted, p, freshGroupMeta),
                                }))
                            );

                            for (const { jid: participantJid } of resolvedParticipants) {
                                try {
                                    const isParticipantSuperUser  = await isSuperUser(participantJid, Gifted);
                                    const isParticipantSuperAdmin = isSuperAdminInMap(participantJid, freshMap);
                                    const isProtected             = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected       = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    const demotedNumber           = formatJid(participantJid);
                                    const authorNumber            = formatJid(authorJid);

                                    if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Re-promoting @${demotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) { console.error("[ANTIDEMOTE] promote error:", e.message); }
                                    } else if (isProtected) {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber} (protected user)...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) { console.error("[ANTIDEMOTE] demote author error:", e.message); }
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) { console.error("[ANTIDEMOTE] promote error:", e.message); }
                                    } else {
                                        await Gifted.sendMessage(groupJid, {
                                            text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber}...`,
                                            mentions: [authorJid, participantJid],
                                        });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) { console.error("[ANTIDEMOTE] demote author error:", e.message); }
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) { console.error("[ANTIDEMOTE] promote error:", e.message); }
                                    }
                                } catch (err) {
                                    console.error("[ANTIDEMOTE] error:", err.message);
                                }
                            }
                            break;
                        }
                    }

                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    const resolvedParticipants = await Promise.all(
                        participants.map(p => getJidFromParticipant(Gifted, p, groupMeta))
                    );
                    const authorJid = author ? await getJidFromParticipant(Gifted, author, groupMeta) : null;

                    for (const participantJid of resolvedParticipants) {
                        try {
                            const demotedNumber = formatJid(participantJid);
                            const authorNumber  = authorJid ? formatJid(authorJid) : "System";
                            const mentionsList  = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorNumber} *DEMOTED* @${demotedNumber}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("[DEMOTE] notification error:", err.message);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error("[GROUP_EVENTS] handler error:", error.message);
        }
    });
};

module.exports = {
    setupGroupEventsListeners,
    getProfilePic,
    getDisplayNumber,
    extractMedia,
    sendGroupEvent,
};
