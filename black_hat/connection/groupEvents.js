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

// ─── FIXED: multiline + image support ────────────────────────────────────────
const extractMedia = (raw, ctx = {}) => {
if (!raw) return { text: "", image: null };

let text = raw.replace(/\r/g, "\n");

const pp = ctx.pp || "";
const gpp = ctx.gpp || "";

let image = null;

const lines = text.split("\n");
const clean = [];

// FIXED REGEX
const imgUrlRegex = /^https?:\/\/\S+\.(jpg|jpeg|png|webp)(\?.*)?$/i;
const waUrlRegex = /^https?:\/\/pps\.whatsapp\.net\S+/i;

// PASS 1: detect media triggers FIRST
for (const line of lines) {
const t = line.trim();

if (t === "&pp") {
if (!image && pp) image = pp;
continue;
}

if (t === "&gpp") {
if (!image && gpp) image = gpp;
continue;
}

clean.push(line);
}

let joined = clean.join("\n");

// PASS 2: replace placeholders
joined = joined
.replace(/&mention/g, ctx.mention || "")
.replace(/&gname/g, ctx.gname || "")
.replace(/&desc/g, ctx.desc || "")
.replace(/&size/g, String(ctx.size || ""))
.replace(/&pp/g, "")
.replace(/&gpp/g, "");

const finalLines = joined.split("\n");

// PASS 3: detect LAST LINE image URL
let last = finalLines.length - 1;
while (last >= 0 && finalLines[last].trim() === "") last--;

const lastLine = finalLines[last]?.trim();

if (
!image &&
lastLine &&
(imgUrlRegex.test(lastLine) || waUrlRegex.test(lastLine))
) {
image = lastLine;
finalLines.splice(last, 1);
}

joined = finalLines.join("\n");

// PASS 4: HARD CLEAN
joined = joined
.replace(waUrlRegex, "")
.replace(imgUrlRegex, "")
.replace(/\n{3,}/g, "\n\n")
.trim();

return { text: joined, image };
};

// Send with image if available, fallback to text
const sendGroupEvent = async (Gifted, groupJid, text, image, mentions) => {
try {

// SEND IMAGE
if (image && typeof image === "string") {

await Gifted.sendMessage(groupJid, {    
        image: { url: image },    
        caption: text,    
        mentions,    
    });    

    return;    
}    

// FALLBACK TEXT    
await Gifted.sendMessage(groupJid, {    
    text,    
    mentions,    
});

} catch (err) {
console.error("sendGroupEvent error:", err.message);
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
                    const welcomeEnabled = await getGroupSetting(groupJid, "WELCOME_MESSAGE");

                    const isWelcomeOn =
                        welcomeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(welcomeEnabled).toLowerCase().trim());

                    if (!isWelcomeOn) return;

                    const rawTemplate = (await getGroupSetting(groupJid, "WELCOME_MESSAGE_TEXT"))
                        || "&mention Welcome 🎉";

                    for (const participant of participants) {
                        try {
                            const userJid = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            const profilePic = await getProfilePic(Gifted, userJid);
                            const groupPP = await getProfilePic(Gifted, groupJid);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname: groupName,
                                desc: groupMeta.desc || "No description",
                                size: memberCount,
                                pp: profilePic,
                                gpp: groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("Welcome message error:", err.message);
                        }
                    }
                    break;
                }

                case "remove": {
                    const goodbyeEnabled = await getGroupSetting(groupJid, "GOODBYE_MESSAGE");

                    const isGoodbyeOn =
                        goodbyeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(goodbyeEnabled).toLowerCase().trim());

                    if (!isGoodbyeOn) return;

                    const rawTemplate = (await getGroupSetting(groupJid, "GOODBYE_MESSAGE_TEXT"))
                        || "&mention left 👋";

                    for (const participant of participants) {
                        try {
                            const userJid = await getJidFromParticipant(Gifted, participant, groupMeta);
                            const userNumber = formatJid(userJid);
                            const profilePic = await getProfilePic(Gifted, userJid);
                            const groupPP = await getProfilePic(Gifted, groupJid);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname: groupName,
                                desc: groupMeta.desc || "No description",
                                size: memberCount,
                                pp: profilePic,
                                gpp: groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            await sendGroupEvent(Gifted, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("Goodbye message error:", err.message);
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
                    
                    const groupEventsEnabled = await getGroupSetting(
                        groupJid,
                        "GROUP_EVENTS",
                    );
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantJid = await getJidFromParticipant(
                                Gifted,
                                participant,
                                groupMeta,
                            );
                            const authorJid = author
                                ? await getJidFromParticipant(
                                      Gifted,
                                      author,
                                      groupMeta,
                                  )
                                : null;
                            const promotedNumber = formatJid(participantJid);
                            const authorNumber = authorJid
                                ? formatJid(authorJid)
                                : "System";

                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            const promoteText = `@${authorNumber} *PROMOTED* @${promotedNumber}`;

                            await Gifted.sendMessage(groupJid, {
                                text: promoteText,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error(
                                "Promote notification error:",
                                err.message,
                            );
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
                    
                    const groupEventsEnabled = await getGroupSetting(
                        groupJid,
                        "GROUP_EVENTS",
                    );
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantJid = await getJidFromParticipant(
                                Gifted,
                                participant,
                                groupMeta,
                            );
                            const authorJid = author
                                ? await getJidFromParticipant(
                                      Gifted,
                                      author,
                                      groupMeta,
                                  )
                                : null;
                            const demotedNumber = formatJid(participantJid);
                            const authorNumber = authorJid
                                ? formatJid(authorJid)
                                : "System";

                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);

                            const demoteText = `@${authorNumber} *DEMOTED* @${demotedNumber}`;

                            await Gifted.sendMessage(groupJid, {
                                text: demoteText,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error(
                                "Demote notification error:",
                                err.message,
                            );
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
