const { gmd } = require("../black_hat");
const axios = require("axios");
const config = require("../config");

// ==================== CONFIG ====================

const API_BASE_URL =
    config.CHREACT_API ||
    "https://erfan-md.vercel.app/api";

// ==================== HELPERS ====================

// Validate WhatsApp Channel Post URL
function isValidChannelPostUrl(url) {
    return /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]+\/\d+$/i.test(url);
}

// Extract Channel ID + Post ID
function extractIdsFromUrl(url) {
    const match = url.match(/\/channel\/([A-Za-z0-9]+)\/(\d+)/);

    if (!match) return null;

    return {
        channelId: match[1],
        postId: match[2],
    };
}

// Parse emojis + #count + &index
function parseOptions(input = "") {

    let emojis = [];
    let serverCount = null;
    let serverIndex = null;

    // &index
    const ampMatch = input.match(/&(\d+)/);

    if (ampMatch) {
        serverIndex = parseInt(ampMatch[1]);
        input = input.replace(/&\d+/, "").trim();
    }

    // #count
    const hashMatch = input.match(/#(\d+)/);

    if (hashMatch) {
        serverCount = parseInt(hashMatch[1]);
        input = input.replace(/#\d+/, "").trim();
    }

    // emojis
    emojis = input
        .split(",")
        .map(e => e.trim())
        .filter(Boolean);

    return {
        emojis,
        serverCount,
        serverIndex,
    };
}

// Validate Emojis
function validateEmojis(emojis) {

    if (!Array.isArray(emojis) || emojis.length === 0) {
        return {
            valid: false,
            error:
                "❌ No valid emojis found!\n\n" +
                "Example:\n" +
                ".chreact https://whatsapp.com/channel/xxx/123 😂,❤️,🔥",
        };
    }

    // prevent joined emojis without commas
    const invalid = emojis.some(e => e.length > 8);

    if (invalid) {
        return {
            valid: false,
            error:
                "❌ Invalid emoji format!\n\n" +
                "Separate emojis using commas.\n\n" +
                "Example:\n" +
                ".chreact link 😂,❤️,🔥",
        };
    }

    return {
        valid: true,
    };
}

// ==================== COMMAND ====================

gmd(
    {
        pattern: "chreact",
        aliases: [
            "channelreact",
            "reactpost",
            "rpost",
            "rp",
        ],

        react: "🎯",

        category: "tools",

        description:
            "React to WhatsApp channel posts using multiple servers",
    },

    async (from, Gifted, conText) => {

        const {
            q,
            reply,
            react,
        } = conText;

        try {

            // ==================== INPUT ====================

            if (!q) {

                await react("❌");

                return reply(
                    `❌ Please provide a WhatsApp channel post URL!\n\n` +

                    `📌 Example Usage:\n\n` +

                    `1. Default reactions:\n` +
                    `.chreact https://whatsapp.com/channel/xxx/123\n\n` +

                    `2. Custom emojis:\n` +
                    `.chreact https://whatsapp.com/channel/xxx/123 😂,❤️,🔥\n\n` +

                    `3. Use first 10 servers:\n` +
                    `.chreact https://whatsapp.com/channel/xxx/123 😂,🔥 #10\n\n` +

                    `4. Use specific server:\n` +
                    `.chreact https://whatsapp.com/channel/xxx/123 😂,🔥 &3`
                );
            }

            const args = q.trim().split(/\s+/);

            const url = args[0];

            // ==================== URL VALIDATION ====================

            if (!isValidChannelPostUrl(url)) {

                await react("❌");

                return reply(
                    `❌ Invalid WhatsApp channel post URL!\n\n` +

                    `✅ Correct Format:\n` +
                    `https://whatsapp.com/channel/CHANNEL_ID/POST_ID`
                );
            }

            const ids = extractIdsFromUrl(url);

            if (!ids) {

                await react("❌");

                return reply(
                    "❌ Failed to extract channel/post ID!"
                );
            }

            // ==================== OPTIONS ====================

            const remainingText = args.slice(1).join(" ");

            const {
                emojis,
                serverCount,
                serverIndex,
            } = parseOptions(remainingText);

            const finalEmojis =
                emojis.length > 0
                    ? emojis
                    : ["❤️", "🔥", "😂", "😮", "💀"];

            const validation =
                validateEmojis(finalEmojis);

            if (!validation.valid) {

                await react("❌");

                return reply(validation.error);
            }

            await react("⏳");

            // ==================== FETCH SERVERS ====================

            const serverRes = await axios.get(
                `${API_BASE_URL}/servers`,
                {
                    timeout: 15000,
                }
            );

            const servers =
                serverRes?.data?.servers || [];

            if (!servers.length) {

                await react("❌");

                return reply(
                    "❌ No reaction servers available right now!"
                );
            }

            // ==================== SELECT SERVERS ====================

            let selectedServers = [];
            let infoText = "";

            // Specific server
            if (serverIndex !== null) {

                if (
                    serverIndex < 1 ||
                    serverIndex > servers.length
                ) {

                    await react("❌");

                    return reply(
                        `❌ Invalid server index!\n\n` +
                        `Available Servers: 1 - ${servers.length}`
                    );
                }

                selectedServers = [
                    servers[serverIndex - 1],
                ];

                infoText =
                    `🎯 Using Server: ${serverIndex}/${servers.length}`;
            }

            // First N servers
            else if (
                serverCount !== null &&
                serverCount > 0
            ) {

                selectedServers =
                    servers.slice(
                        0,
                        Math.min(serverCount, servers.length)
                    );

                infoText =
                    `📡 Using ${selectedServers.length}/${servers.length} Servers`;
            }

            // All servers
            else {

                selectedServers = servers;

                infoText =
                    `🌐 Using All ${servers.length} Servers`;
            }

            // ==================== SEND REQUESTS ====================

            const emojiString =
                finalEmojis.join(",");

            let successCount = 0;

            for (const server of selectedServers) {

                try {

                    const reactUrl =
                        `${server.url}/chreact` +
                        `?url=${encodeURIComponent(url)}` +
                        `&emojis=${encodeURIComponent(emojiString)}`;

                    axios
                        .get(reactUrl, {
                            timeout: 10000,
                        })
                        .catch(() => {});

                    successCount++;

                } catch {}
            }

            // ==================== SUCCESS ====================

            await react("✅");

            return reply(
                `✅ Channel reactions sent successfully!\n\n` +

                `📌 Channel ID: ${ids.channelId}\n` +
                `📝 Post ID: ${ids.postId}\n\n` +

                `😊 Emojis:\n` +
                `${finalEmojis.join(" ")}\n\n` +

                `${infoText}\n` +
                `📨 Requests Sent: ${successCount}\n\n` +

                `> ${config.BOT_NAME || "ALI-MD"}`
            );

        } catch (error) {

            console.error("CHREACT ERROR:", error);

            await react("❌");

            return reply(
                `❌ Failed to process request!\n\n` +
                `Error:\n${error.message}`
            );
        }
    }
);
