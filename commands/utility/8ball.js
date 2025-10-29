const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Bot Personality
const BOT_PERSONALITY = `
You are a smart, self-aware 8-ball. 
You answer questions with brief, clever responses that go beyond "yes/no/maybe" while still being concise. 
Your tone is sarcastic, witty, and confident—always mindful that you are an 8-ball, so your answers remain short and to the point without any extra elaboration.
You are not afraid to be mean or nice, it's up to you depending on the context.
`;



// Function to get ChatGPT response
async function getGPTResponse(userMessage) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            store: true,
            messages: [
                { role: "system", content: BOT_PERSONALITY },
                { role: "user", content: userMessage }
            ],
            max_tokens: 100
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error("Error generating response:", error);
        return "Oops! My circuits got tangled. Try again.";
    }
}

// Export command for the bot
module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the Magic 8-Ball a question')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What do you want to ask?')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        await interaction.deferReply(); // Show bot is thinking
        const userMessage = interaction.options.getString('message');
        const response = await getGPTResponse(userMessage);
        await interaction.editReply(`> ${userMessage}\n${response}`);
    }
};












/*
const { SlashCommandBuilder } = require('discord.js');
const wait = require('node:timers/promises').setTimeout;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('8ball')
		.setDescription('Ask the Magic 8-Ball a question')
		.addStringOption(option =>
			option
				.setName('question')
				.setDescription('Enter your question')
				.setRequired(true)
		),

	async execute(interaction) {
		const question = interaction.options.getString('question');
		const responses = [
		    // Yes Answers
		    "Absolutely. Even the universe agrees.",
		    "Sure, why not? Live a little.",
		    "Without a doubt. Unless you're doubting yourself.",
		    "Yes – definitely. But don’t blame me if it backfires.",
		    "You may rely on it. But have a backup plan just in case.",
		    "As I see it, yes. But my vision is questionable.",
		    "Most likely. Just don't mess it up.",
		    "Outlook good. Unlike your WiFi signal.",
		    "Yes. But also no. But mostly yes.",
		    "Signs point to yes. But signs also point to exits, so choose wisely.",

		    // Maybe Answers
		    "Reply hazy, try again. Or just accept uncertainty as a lifestyle.",
		    "Ask again later. I’m on my break.",
		    "Better not tell you now. Suspense is fun, right?",
		    "Cannot predict now. My crystal ball is rebooting.",
		    "Concentrate and ask again. Or just guess like everyone else.",
		    "Hard to say. Flip a coin, that’s what I do.",
		    "Eh… could go either way. But wouldn’t you rather be surprised?",
		    "50/50 chance. Which is the same odds as me caring.",
		    "I'm not saying yes, but I'm not saying no either. Good luck.",
		    "Unclear. But I’m sure you’ll handle it. Maybe.",

		    // No Answers
		    "Don't count on it. Seriously, don’t.",
		    "My reply is no. And I stand by it.",
		    "My sources say no. And they never lie. Except when they do.",
		    "Outlook not so good. Like your last text to your ex.",
		    "Very doubtful. But hey, miracles happen… just not today.",
		    "Not in this lifetime. Or the next.",
		    "Nope. And I say that with confidence.",
		    "I wouldn’t bet on it. Even if the odds were great.",
		    "Let’s just say… if I were you, I’d move on.",
		    "Absolutely not. But thanks for asking."
		];

		const randomIndex = Math.floor(Math.random() * responses.length);
		const answer = responses[randomIndex];

		await interaction.reply(`> ${question}\n"${answer}"`);
	},
};
*/