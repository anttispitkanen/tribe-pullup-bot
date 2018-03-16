require('dotenv').config();
const MongoClient = require('mongodb').MongoClient;

const {
    IncomingWebhook,
    WebClient,
    RtmClient,
    RTM_EVENTS
} = require('@slack/client');

const MONGO_URL = process.env.MONGO_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;
const rtm = new RtmClient(BOT_TOKEN);

const BOT_ID = '@U9F9U4EVC';
const BOT_TAG = `<${BOT_ID}>`; /* this is how the bot's reference shows in message text */

let db; /* reference for database */

MongoClient.connect(MONGO_URL, (err, client) => {
    if (err) return console.error(err);
    db = client.db('pullup-coach');
    console.log('Database connection ready');
    rtm.start();
});

rtm.on(RTM_EVENTS.MESSAGE, async message => {
    if (message.type === 'message' && message.text && message.text.indexOf(BOT_TAG) === 0) {
        const sender = message.user;
        const senderTag = `<@${sender}>`;
        const channel = message.channel;

        const numPullupsText = message.text.substr(BOT_TAG.length).trim();
        if (numPullupsText.toLowerCase() === 'oops') {
            try {
                const removed = await removeLatestSet(sender);
                const persPullups = await countPersonsPullups(sender);
                rtm.sendMessage(
                    `${senderTag}\n
                    It's ok accidents happen! I removed your latest set of ${removed} :relieved:\n
                    You are now at a total of ${persPullups.allPullups} pullups done :ok_hand:
                    `,
                    channel
                );
                return;
            } catch (e) {
                console.error(e);
                return;
            }
        }

        const numPullups = parseInt(numPullupsText, 10);
        /* dummy compare that there was only a number submitted */
        if (numPullupsText !== ('' + numPullups) || numPullups < 1) return;

        try {
            await insertPerson(sender);
            await insertSetOfPullups(sender, numPullups);
            const persPullups = await countPersonsPullups(sender);
            rtm.sendMessage(
                `${senderTag}\n
                ${numPullups}, great work!\n
                That's ${persPullups.allPullups} in total\n
                Your best set is ${persPullups.bestSet}
                :muscle::sunglasses::+1:`,
                channel
            );
        } catch (e) {
            console.error('ERROR! on line 43');
        }
    }
});

const insertPerson = async tag => {
    try {
        const found = await db.collection('people').find({ _id: tag }).toArray();
        if (found.length > 0) return; /* return if the person already exists */
    } catch (e) {
        console.log(e)
    }
    await db.collection('people').insert({ _id: tag });
}

const insertSetOfPullups = async (tag, numPullups) => {
    try {
        await db.collection('pullups').insert({
            person: tag,
            numPullups: numPullups,
            time: new Date()
        });
    } catch (e) {
        throw e;
    }
}

const countPersonsPullups = async tag => {
    try {
        const allSets = await db.collection('pullups').find({ person: tag }).toArray();
        const allPullups = allSets.reduce((x, y) => x + y.numPullups, 0);
        const bestSet = Math.max(...allSets.map(x => x.numPullups));
        return {
            allPullups,
            bestSet
        };
    } catch (e) {
        throw e;
    }
}

const removeLatestSet = async tag => {
    try {
        const latestSets = await db.collection('pullups').find({ person: tag }).sort({ time: -1 }).limit(1).toArray();
        const latestSet = latestSets[0];
        await db.collection('pullups').remove(latestSet);
        return latestSet.numPullups;
    } catch (e) {
        throw e;
    }
}
