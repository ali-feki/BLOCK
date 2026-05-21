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
        const url = await Gifted.profilePictureUrl(jid, "image");
        console.log(`[getProfilePic] jid=${jid} → url=${url}`);
        return url;
    } catch (e) {
        console.log(`[getProfilePic] FAILED for jid=${jid} — using placeholder. reason: ${e.message}`);
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
        return null;
    }
};

// ─── extractMedia ─────────────────────────────────────────────────────────────
const extractMedia = (raw, ctx = {}) => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[extractMedia] START");
    console.log("[extractMedia] raw (JSON):", JSON.stringify(raw));
    console.log("[extractMedia] ctx.pp:", ctx.pp);
    console.log("[extractMedia] ctx.gpp:", ctx.gpp);
    console.log("[extractMedia] ctx.mention:", ctx.mention);
    console.log("[extractMedia] ctx.gname:", ctx.gname);

    if (!raw) {
        console.log("[extractMedia] raw is empty — returning blank");
        return { text: "", image: null };
    }

    // Fix all newline variants
    let text = raw
        .replace(/\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    console.log("[extractMedia] after newline fix (JSON):", JSON.stringify(text));

    const pp  = ctx.pp  || "";
    const gpp = ctx.gpp || "";
    let image = null;

    const lines = text.split("\n");
    console.log("[extractMedia] total lines:", lines.length);
    lines.forEach((l, i) => console.log(`[extractMedia] line[${i}]: ${JSON.stringify(l)}`));

    const clean = [];

    // PASS 1: &pp / &gpp alone on a line → image
    console.log("[extractMedia] ── PASS 1: scanning for &pp / &gpp ──");
    for (const line of lines) {
        const t = line.trim();

        if (t === "&gpp") {
            console.log("[extractMedia] FOUND &gpp on own line");
            console.log("[extractMedia] gpp value:", gpp || "(empty — will skip)");
            if (!image && gpp && gpp !== DEFAULT_PLACEHOLDER) {
                image = gpp;
                console.log("[extractMedia] ✅ image set from &gpp:", image);
            } else if (!gpp || gpp === DEFAULT_PLACEHOLDER) {
                console.log("[extractMedia] ⚠️ &gpp is placeholder/empty — no image set");
            }
            continue;
        }

        if (t === "&pp") {
            console.log("[extractMedia] FOUND &pp on own line");
            console.log("[extractMedia] pp value:", pp || "(empty — will skip)");
            if (!image && pp && pp !== DEFAULT_PLACEHOLDER) {
                image = pp;
                console.log("[extractMedia] ✅ image set from &pp:", image);
            } else if (!image) {
                console.log("[extractMedia] ⚠️ &pp is placeholder/empty — no image set");
            }
            continue;
        }

        clean.push(line);
    }

    console.log("[extractMedia] after PASS 1 — image:", image || "null");
    console.log("[extractMedia] clean lines count:", clean.length);

    // PASS 2: replace placeholders
    console.log("[extractMedia] ── PASS 2: replacing placeholders ──");
    let joined = clean.join("\n")
        .replace(/&mention/g, ctx.mention || "")
        .replace(/&gname/g,   ctx.gname   || "")
        .replace(/&desc/g,    ctx.desc    || "")
        .replace(/&size/g,    String(ctx.size || ""))
        .replace(/&pp/g,      "")
        .replace(/&gpp/g,     "");

    console.log("[extractMedia] after PASS 2 (JSON):", JSON.stringify(joined));

    // PASS 3: if no image yet — check last line for hardcoded URL
    console.log("[extractMedia] ── PASS 3: last line URL check ──");
    if (!image) {
        const fl = joined.split("\n");
        let last = fl.length - 1;
        while (last >= 0 && fl[last].trim() === "") last--;
        const lastLine = fl[last]?.trim();
        console.log("[extractMedia] last non-empty line:", JSON.stringify(lastLine));

        if (lastLine && /^https?:\/\/\S+$/i.test(lastLine)) {
            image = lastLine;
            fl.splice(last, 1);
            joined = fl.join("\n");
            console.log("[extractMedia] ✅ image set from last line URL:", image);
        } else {
            console.log("[extractMedia] no URL found on last line");
        }
    } else {
        console.log("[extractMedia] skipping PASS 3 — image already set");
    }

    // PASS 4: clean stray CDN URLs from text
    joined = joined
        .replace(/https?:\/\/pps\.whatsapp\.net\S*/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    console.log("[extractMedia] FINAL text (JSON):", JSON.stringify(joined));
    console.log("[extractMedia] FINAL image:", image || "null");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return { text: joined, image };
};

// ─── fetchImageBuffer ─────────────────────────────────────────────────────────
const fetchImageBuffer = async (url) => {
    console.log("[fetchImageBuffer] START — url:", url);

    if (!url) {
        console.log("[fetchImageBuffer] url is null/empty — skip");
        return null;
    }
    if (url === DEFAULT_PLACEHOLDER) {
        console.log("[fetchImageBuffer] url is placeholder — skip");
        return null;
    }

    try {
        const https = require("https");
        const http  = require("http");
        const mod   = url.startsWith("https") ? https : http;
        console.log("[fetchImageBuffer] using:", url.startsWith("https") ? "https" : "http");

        return await new Promise((resolve) => {
            const req = mod.get(url, {
                headers: { "User-Agent": "WhatsApp/2.23.20.0" }
            }, (res) => {
                console.log("[fetchImageBuffer] HTTP status:", res.statusCode);
                console.log("[fetchImageBuffer] content-type:", res.headers["content-type"]);
                console.log("[fetchImageBuffer] content-length:", res.headers["content-length"]);

                if (res.statusCode !== 200) {
                    console.log("[fetchImageBuffer] ❌ bad status — aborting");
                    res.resume();
                    resolve(null);
                    return;
                }

                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const buf = Buffer.concat(chunks);
                    console.log("[fetchImageBuffer] ✅ buffer ready — size:", buf.length, "bytes");
                    resolve(buf);
                });
                res.on("error", (e) => {
                    console.log("[fetchImageBuffer] ❌ stream error:", e.message);
                    resolve(null);
                });
            });

            req.setTimeout(5000, () => {
                console.log("[fetchImageBuffer] ❌ timeout after 5s — aborting");
                req.destroy();
                resolve(null);
            });

            req.on("error", (e) => {
                console.log("[fetchImageBuffer] ❌ request error:", e.message);
                resolve(null);
            });
        });
    } catch (e) {
        console.log("[fetchImageBuffer] ❌ exception:", e.message);
        return null;
    }
};

// ─── sendGroupEvent ───────────────────────────────────────────────────────────
const sendGroupEvent = async (Gifted, groupJid, text, image, mentions) => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[sendGroupEvent] START");
    console.log("[sendGroupEvent] groupJid:", groupJid);
    console.log("[sendGroupEvent] image:", image || "null");
    console.log("[sendGroupEvent] text (JSON):", JSON.stringify(text));
    console.log("[sendGroupEvent] mentions:", mentions);

    try {
        if (image) {
            console.log("[sendGroupEvent] image present — fetching buffer...");
            const buffer = await fetchImageBuffer(image);

            if (buffer && buffer.length > 0) {
                console.log("[sendGroupEvent] ✅ buffer ok — sending image message");
                await Gifted.sendMessage(groupJid, {
                    image: buffer,
                    caption: text,
                    mentions,
                });
                console.log("[sendGroupEvent] ✅ image message sent successfully");
                return;
            }

            console.log("[sendGroupEvent] ⚠️ buffer null/empty — falling back to text");
        } else {
            console.log("[sendGroupEvent] no image — sending text only");
        }

        await Gifted.sendMessage(groupJid, { text, mentions });
        console.log("[sendGroupEvent] ✅ text message sent successfully");
    } catch (err) {
        console.error("[sendGroupEvent] ❌ error:", err.message);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
};

// ─── DEDUP ────────────────────────────────────────────────────────────────────
const processedEvents = new Map();
const EVENT_DEDUP_INTERVAL = 5000;

const getEventKey = (groupJid, action, participants) => {
    return `${groupJid}:${action}:${[...participants].sort().join(",")}`;
};

const isDuplicateEvent = (groupJid, action, participants) => {
    const key = getEventKey(groupJid, action, participants);
    const now = Date.now();
    const last = processedEvents.get(key);
    if (last && now - last < EVENT_DEDUP_INTERVAL) return true;
    processedEvents.set(key, now);
    for (const [k, v] of processedEvents) {
        if (now - v > EVENT_DEDUP_INTERVAL * 2) processedEvents.delete(k);
    }
    return false;
};

// ─── MAIN LISTENER ────────────────────────────────────────────────────────────
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
                    if (authorNum === botNum) return;
                }
                if (isDuplicateEvent(groupJid, action, participants)) return;
            }

            const timeZone  = (await getSetting("TIME_ZONE")) || "Africa/Nairobi";
            const currentTime = moment().tz(timeZone).format("h:mm A");
            const currentDate = moment().tz(timeZone).format("MMMM Do, YYYY");

            const groupMeta = await getFreshGroupMetadata(Gifted, groupJid);
            if (!groupMeta) return;

            const groupName   = groupMeta.subject || "Unknown Group";
            const memberCount = groupMeta.size || groupMeta.participants?.length || 0;

            switch (action) {

                // ─── WELCOME ─────────────────────────────────────────────
                case "add": {
                    console.log("══════════════════════════════════════════");
                    console.log("[WELCOME] member joined — group:", groupJid);
                    console.log("[WELCOME] participants:", participants);

                    const welcomeEnabled = await getGroupSetting(groupJid, "WELCOME_MESSAGE");
                    console.log("[WELCOME] WELCOME_MESSAGE setting:", welcomeEnabled);

                    const isWelcomeOn = welcomeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(welcomeEnabled).toLowerCase().trim());

                    if (!isWelcomeOn) {
                        console.log("[WELCOME] ⚠️ welcome is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "WELCOME_MESSAGE_TEXT"))
                        || "&mention Welcome 🎉";
                    console.log("[WELCOME] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    for (const participant of participants) {
                        try {
                            const userJid    = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            console.log("[WELCOME] resolved userJid:", userJid);

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(Gifted, userJid),
                                getProfilePic(Gifted, groupJid),
                            ]);

                            console.log("[WELCOME] profilePic:", profilePic);
                            console.log("[WELCOME] groupPP:", groupPP);
                            console.log("[WELCOME] pp is placeholder?", profilePic === DEFAULT_PLACEHOLDER);
                            console.log("[WELCOME] gpp is placeholder?", groupPP === DEFAULT_PLACEHOLDER);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname:   groupName,
                                desc:    groupMeta.desc || "No description",
                                size:    memberCount,
                                pp:      profilePic,
                                gpp:     groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            console.log("[WELCOME] → sending with image:", image || "none");
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("[WELCOME] ❌ error:", err.message);
                        }
                    }
                    console.log("══════════════════════════════════════════");
                    break;
                }

                // ─── GOODBYE ─────────────────────────────────────────────
                case "remove": {
                    console.log("══════════════════════════════════════════");
                    console.log("[GOODBYE] member left — group:", groupJid);
                    console.log("[GOODBYE] participants:", participants);

                    const goodbyeEnabled = await getGroupSetting(groupJid, "GOODBYE_MESSAGE");
                    console.log("[GOODBYE] GOODBYE_MESSAGE setting:", goodbyeEnabled);

                    const isGoodbyeOn = goodbyeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(goodbyeEnabled).toLowerCase().trim());

                    if (!isGoodbyeOn) {
                        console.log("[GOODBYE] ⚠️ goodbye is OFF — skipping");
                        return;
                    }

                    const rawTemplate = (await getGroupSetting(groupJid, "GOODBYE_MESSAGE_TEXT"))
                        || "&mention left 👋";
                    console.log("[GOODBYE] rawTemplate from DB:", JSON.stringify(rawTemplate));

                    for (const participant of participants) {
                        try {
                            const userJid    = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            console.log("[GOODBYE] resolved userJid:", userJid);

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(Gifted, userJid),
                                getProfilePic(Gifted, groupJid),
                            ]);

                            console.log("[GOODBYE] profilePic:", profilePic);
                            console.log("[GOODBYE] groupPP:", groupPP);
                            console.log("[GOODBYE] pp is placeholder?", profilePic === DEFAULT_PLACEHOLDER);
                            console.log("[GOODBYE] gpp is placeholder?", groupPP === DEFAULT_PLACEHOLDER);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname:   groupName,
                                desc:    groupMeta.desc || "No description",
                                size:    memberCount,
                                pp:      profilePic,
                                gpp:     groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            console.log("[GOODBYE] → sending with image:", image || "none");
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("[GOODBYE] ❌ error:", err.message);
                        }
                    }
                    console.log("══════════════════════════════════════════");
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
                            if (pNum === botNum) { isBotAdmin = true; break; }
                        }
                        let isAuthorSuperAdmin = false;
                        for (const p of groupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, groupMeta);
                            const pNum = pJid.split("@")[0].split(":")[0];
                            if (pNum === authorNum) { isAuthorSuperAdmin = true; break; }
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
                                        if (pJid.split("@")[0].split(":")[0] === participantNum) { isParticipantSuperAdmin = true; break; }
                                    }
                                    const promotedNumber    = formatJid(participantJid);
                                    const authorNumber      = formatJid(authorJid);
                                    const skipParticipant   = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    if (isAuthorProtected && skipParticipant) {
                                        continue;
                                    } else if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${promotedNumber}...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) {}
                                    } else if (skipParticipant) {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${authorNumber} (promoted user is protected)...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                    } else {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting both users...`, mentions: [authorJid, participantJid] });
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
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);
                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorJid ? formatJid(authorJid) : "System"} *PROMOTED* @${formatJid(participantJid)}`,
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
                        try { freshGroupMeta = await Gifted.groupMetadata(groupJid); }
                        catch (e) { freshGroupMeta = groupMeta; }
                        const authorJid = await getJidFromParticipant(Gifted, author, freshGroupMeta);
                        const authorNum = authorJid.split("@")[0].split(":")[0];
                        const botNum = botJid2.split("@")[0];
                        const isAuthorSuperUser = await isSuperUser(authorJid, Gifted);
                        if (isAuthorSuperUser) break;
                        let isBotAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "admin" && p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, freshGroupMeta);
                            if (pJid.split("@")[0].split(":")[0] === botNum) { isBotAdmin = true; break; }
                        }
                        let isAuthorSuperAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(Gifted, p.id, freshGroupMeta);
                            if (pJid.split("@")[0].split(":")[0] === authorNum) { isAuthorSuperAdmin = true; break; }
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
                                        if (pJid.split("@")[0].split(":")[0] === participantNum) { isParticipantSuperAdmin = true; break; }
                                    }
                                    const demotedNumber     = formatJid(participantJid);
                                    const authorNumber      = formatJid(authorJid);
                                    const isProtected       = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, Gifted);
                                    if (isAuthorProtected) {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Re-promoting @${demotedNumber}...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else if (isProtected) {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber} (protected user)...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                        try { await Gifted.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else {
                                        await Gifted.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber}...`, mentions: [authorJid, participantJid] });
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
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);
                            await Gifted.sendMessage(groupJid, {
                                text: `@${authorJid ? formatJid(authorJid) : "System"} *DEMOTED* @${formatJid(participantJid)}`,
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
            console.error("[GROUP_EVENTS] ❌ handler error:", error.message);
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
