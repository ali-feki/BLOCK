const { gmd } = require("../black_hat");

async function toggleGroupHistory(sock, jid, enable = true) {
    if (!sock || !jid) return;

    await sock.query({
        tag: "iq",
        attrs: {
            type: "get",
            to: "s.whatsapp.net",
            xmlns: "w:mex",
        },
        content: [
            {
                tag: "query",
                attrs: {
                    query_id: "24688994337458819",
                },
                content: Buffer.from(
                    JSON.stringify({
                        variables: {
                            group_id: jid,
                            input: {
                                member_share_group_history_mode:
                                    enable
                                        ? "ALL_MEMBER_SHARE"
                                        : "ADMIN_SHARE",
                            },
                        },
                    }),
                    "utf-8"
                ),
            },
        ],
    });
}

gmd(
{
    pattern: "grouphistory",
    aliases: ["ghistory"],
    react: "🕘",
    category: "group",
    description: "Toggle group history sharing",
},
async (from, Gifted, conText) => {

    const {
        isGroup,
        isAdmin,
        isBotAdmin,
        args,
        reply,
    } = conText;

    if (!isGroup) {
        return reply("This command only works in groups.");
    }

    if (!isAdmin) {
        return reply("Only group admins can use this command.");
    }

    if (!isBotAdmin) {
        return reply("Bot must be admin.");
    }

    const option = args[0]?.toLowerCase();

    if (!option) {
        return reply(
            "*Example:*\n" +
            ".grouphistory on\n" +
            ".grouphistory off"
        );
    }

    try {

        if (option === "on") {

            await toggleGroupHistory(
                Gifted,
                from,
                true
            );

            return reply("Group history sharing enabled.");
        }

        if (option === "off") {

            await toggleGroupHistory(
                Gifted,
                from,
                false
            );

            return reply("Group history sharing disabled.");
        }

        return reply("Use on/off.");

    } catch (e) {
        console.log(e);
        reply("Failed to change group history settings.");
    }
});
