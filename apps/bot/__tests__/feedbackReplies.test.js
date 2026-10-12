process.env.OWNER_ID = 'owner_1';
process.env.FEEDBACK_CHANNEL_ID = 'feedback_channel';

const replies = require('../utils/feedbackReplies');

function fakeClient({ dmWorks = true, channel = null } = {}) {
    const send = dmWorks ? jest.fn().mockResolvedValue({}) : jest.fn().mockRejectedValue(new Error('Cannot send'));
    return {
        send,
        client: {
            users: { fetch: jest.fn().mockResolvedValue({ id: 'user_1', send }) },
            channels: { fetch: jest.fn().mockResolvedValue(channel) },
        },
    };
}

describe('team replies to feedback', () => {
    test('only the owner can open the reply form', async () => {
        const interaction = { customId: 'fb_reply_user_1', user: { id: 'someone' }, reply: jest.fn(), showModal: jest.fn() };
        await replies.handleOwnerReplyButton(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
    });

    test('the reply is DMed with the original message and a Reply button', async () => {
        const { client, send } = fakeClient();
        const interaction = {
            customId: 'fb_reply_modal_user_1',
            user: { id: 'owner_1' },
            client,
            fields: { getTextInputValue: () => 'Thanks, it is fixed now!' },
            message: { embeds: [{ description: 'i cannot activate /study' }] },
            deferReply: jest.fn().mockResolvedValue({}),
            editReply: jest.fn().mockResolvedValue({}),
        };
        await replies.handleOwnerReplyModal(interaction);

        const dm = send.mock.calls[0][0];
        const embed = dm.embeds[0].toJSON();
        expect(embed.description).toBe('Thanks, it is fixed now!');
        expect(embed.fields[0].value).toBe('i cannot activate /study');
        expect(dm.components[0].toJSON().components[0].custom_id).toBe('fb_user_reply');
        expect(interaction.editReply.mock.calls[0][0].embeds).toBeTruthy();
    });

    test('closed DMs are reported to the owner', async () => {
        const { client } = fakeClient({ dmWorks: false });
        const interaction = {
            customId: 'fb_reply_modal_user_1',
            user: { id: 'owner_1' },
            client,
            fields: { getTextInputValue: () => 'Hello' },
            deferReply: jest.fn().mockResolvedValue({}),
            editReply: jest.fn().mockResolvedValue({}),
        };
        await replies.handleOwnerReplyModal(interaction);
        expect(interaction.editReply.mock.calls[0][0].content).toContain('Could not DM');
    });
});

describe('user answers back', () => {
    test('their reply lands in the feedback channel with a Reply button', async () => {
        const channel = { isTextBased: () => true, send: jest.fn().mockResolvedValue({}) };
        const { client } = fakeClient({ channel });
        const interaction = {
            user: { id: 'user_1', tag: 'giuli' },
            locale: 'en',
            guildId: null,
            client,
            fields: { getTextInputValue: () => 'It works again, thank you!' },
            reply: jest.fn().mockResolvedValue({}),
        };
        await replies.handleUserReplyModal(interaction);

        const posted = channel.send.mock.calls[0][0];
        expect(posted.embeds[0].toJSON().description).toBe('It works again, thank you!');
        expect(posted.components[0].toJSON().components[0].custom_id).toBe('fb_reply_user_1');
        expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
    });
});

describe('user reply cooldown', () => {
    test('a second reply within a minute is not posted', async () => {
        const channel = { isTextBased: () => true, send: jest.fn().mockResolvedValue({}) };
        const { client } = fakeClient({ channel });
        const make = () => ({
            user: { id: 'cooldown_user', tag: 'c' },
            locale: 'en',
            guildId: null,
            client,
            fields: { getTextInputValue: () => 'hello again' },
            reply: jest.fn().mockResolvedValue({}),
        });
        await replies.handleUserReplyModal(make());
        await replies.handleUserReplyModal(make());
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});
