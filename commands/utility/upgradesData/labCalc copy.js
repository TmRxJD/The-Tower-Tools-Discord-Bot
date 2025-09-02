const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
//const { LABS } = require('./upgradesData/labData.js');
const { getUserSettings, saveUserSettings } = require('../dbHandler.js');
const { parseNumberInput, formatNumberOutput } = require('../statFinderFunctions.js');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');

// Helper to format time
function formatTime(hours) {
    const totalSeconds = Math.round(hours * 3600);
    const d = Math.floor(totalSeconds / (3600 * 24)); // Calculate days
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600); // Remaining hours
    const m = Math.floor((totalSeconds % 3600) / 60); // Minutes
    const s = totalSeconds % 60; // Seconds
    return `${d}d ${h}h ${m}m ${s}s`;
}

function formatLabName(input) {
    return input
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/\b\w/g, char => char.toUpperCase()) // Capitalize each word
}

async function generateChartHTML(chart, totals, userSettings, lab, startLevel, targetLevel) {
    let cumulativeTime = 0; // Cumulative time in hours
    let cumulativeGems = 0;
    let cumulativeCoins = 0;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lab Chart</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                background-color: #f9f9f9;
                color: #333;
            }
            h1, h2 {
                text-align: center;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: center;
            }
            th {
                background-color: #4CAF50;
                color: white;
            }
            tr:nth-child(even) {
                background-color: #f2f2f2;
            }
            tr:hover {
                background-color: #ddd;
            }
            .totals {
                margin-top: 20px;
                font-weight: bold;
                text-align: center;
            }
            .inputs {
                margin-top: 20px;
                font-size: 14px;
                text-align: center;
                font-style: italic;
            }
        </style>
    </head>
    <body>
        <h1>${formatLabName(lab)} (${startLevel} - ${targetLevel})</h1>
        <table>
            <thead>
                <tr>
                    <th>Level</th>
                    <th>Value</th>
                    <th>Time</th>
                    <th>Gems</th>
                    <th>Coins</th>
                    <th>Total Time</th>
                    <th>Total Gems</th>
                    <th>Total Coins</th>
                </tr>
            </thead>
            <tbody>
                ${chart.map(row => {
                    // Extract data from the row
                    const { level, value, time, gems, coins } = row;

                    // Update cumulative totals
                    cumulativeTime += time; 
                    cumulativeGems += gems;
                    cumulativeCoins += coins;

                    // Return the table row
                    return `
                    <tr>
                        <td>${level}</td>
                        <td>${value.toFixed(2)}</td>
                        <td>${formatTime(time)}</td>
                        <td>${formatNumberOutput(gems)}</td>
                        <td>${formatNumberOutput(coins)}</td>
                        <td>${formatTime(cumulativeTime)}</td>
                        <td>${formatNumberOutput(cumulativeGems)}</td>
                        <td>${formatNumberOutput(cumulativeCoins)}</td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        <div class="totals">
            Total Time: ${totals.time} | Total Gems: ${totals.gems} | Total Coins: ${totals.coins}\n\n
        </div>
        <div class="inputs">
            Lab Speed: ${userSettings.labSpeed} | Lab Relic: ${userSettings.labRelic}% | Lab Coin Discount: ${userSettings.labDiscount} | Speedup: ${userSettings.speedUp}x
        </div>
    </body>
    </html>
    `;

    // Write the HTML to a temporary file
    const filePath = path.resolve('./chart.html');
    fs.writeFileSync(filePath, htmlContent, 'utf8');
    return filePath;
}

async function generateChartImage(htmlFilePath) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle0' });
    const screenshotPath = path.resolve('./chart.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await browser.close();
    return screenshotPath;
}

function calculateGems(time) {
    time = time / 24; // Convert hours to seconds

    return Math.ceil(  
        time * 86400 > 31104000 ? 25000 :
        time * 86400 > 7776000 ? (17000 / 23328000) * (time * 86400 - 7776000) + 8000 :
        time * 86400 > 2592000 ? (4450 / 5184000) * (time * 86400 - 2592000) + 3550 :
        time * 86400 > 604800 ? (2550 / 1987200) * (time * 86400 - 604800) + 1000 :
        time * 86400 > 86400 ? (837 / 518400) * (time * 86400 - 86400) + 163 :
        time * 86400 > 3600 ? (155.5 / 82800) * (time * 86400 - 3600) + 7.5 :
        time * 86400 > 60 ? (7.375 / 3540) * (time * 86400 - 60) + 0.125 :
        time * 86400 > 1 ? (0.122917 / 59) * (time * 86400 - 1) + 0.002083 :
        0
    );
}

function calculateLabData(labName, startLevel, targetLevel, userSettings) {
    console.log('Entering calculateLabData');
    const lab = LABS[labName];
    if (!lab) {
        throw new Error(`Lab "${labName}" not found.`);
    }

    const { labSpeed, labRelic, labDiscount, speedUp } = userSettings;
    console.log(`Lab Speed: ${labSpeed}, Lab Relic: ${labRelic}, Lab Discount: ${labDiscount}, Speed Up: ${speedUp}`);

    // Adjustments
    const relicMultiplier = 1 + (labRelic / 100); // Relic reduces base time
    // For the "Lab Speed" lab, do NOT include labSpeed in the multiplier, only relic
    // For all other labs, include labSpeed
    let speedMultiplier;
    if (labName.toLowerCase().includes('labs_speed')) {
        speedMultiplier = 1; // Do not include labSpeed level for "Lab Speed" lab
    } else {
        speedMultiplier = 1 + (labSpeed * 0.02);
    }
    const finalMultiplier = 1 / (speedMultiplier * relicMultiplier); // Combined effect of speed and relic
    const coinDiscountMultiplier = 1 - (labDiscount * 0.003); // Lab coin discount reduces cost

    console.log(`Speed Multiplier: ${speedMultiplier}, Relic Multiplier: ${relicMultiplier}, Final Multiplier: ${finalMultiplier}`);

    // Generate the chart data
    const chart = [];
    let totalTime = 0;
    let totalGems = 0;
    let totalCoins = 0;

    for (let level = startLevel; level <= targetLevel; level++) {
        const levelData = lab.levels[level - 1]; // Get level-specific data
        if (!levelData) break;

        const baseTime = parseInt(levelData.duration.split(':')[0]) + parseInt(levelData.duration.split(':')[1]) / 60;
        console.log(`Base time for level ${level}: ${baseTime} hours`);
        if (!baseTime) {
            console.error(`No duration found for level ${level} in lab "${labName}"`);
            continue;
        }

        const adjustedTime = baseTime * finalMultiplier;
        const gems = calculateGems(adjustedTime);
        const adjustedCoins = levelData.cost * coinDiscountMultiplier;

        chart.push({
            level,
            value: lab.base + (lab.value * level),
            time: adjustedTime / speedUp, 
            gems: gems,
            coins: adjustedCoins
        });

        // Update totals
        totalTime += adjustedTime;
        totalGems += gems;
        totalCoins += adjustedCoins;
    }

    return {
        chart,
        totals: {
            time: formatTime(totalTime / speedUp),
            gems: totalGems,
            coins: formatNumberOutput(totalCoins)
        }
    };
}

// Modal input configurations
const MODAL_INPUTS = {
    calculator: [
        {
            id: 'start_level',
            label: 'Starting Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'end_level',
            label: 'Target Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'speed_up',
            label: 'Speed Up Multiplier',
            style: TextInputStyle.Short,
            required: true,
            defaultValue: '1'
        }
    ],
    settings: [
        {
            id: 'lab_speed',
            label: 'Lab Speed Level',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'lab_relic',
            label: 'Lab Speed Relic (%)',
            style: TextInputStyle.Short,
            required: true
        },
        {
            id: 'lab_discount',
            label: 'Lab Coin Discount Level',
            style: TextInputStyle.Short,
            required: true
        }
    ]
};

async function createModal(type, userId = null, category = '', lab = '') {
    const modal = new ModalBuilder()
        .setCustomId(`lab_${type}_${category}_${lab}`.trim())
        .setTitle(type === 'settings' ? 'Lab Calculator Settings' : `Calculate ${lab.replace(/_/g, ' ')}`);

    let userSettings = null;
    if (type === 'settings' && userId) {
        try {
            userSettings = await getUserSettings(userId);
        } catch (error) {
            console.error('Error fetching user settings:', error);
        }
    }

    const inputs = MODAL_INPUTS[type].map(input => {
        const textInput = new TextInputBuilder()
            .setCustomId(input.id)
            .setLabel(input.label)
            .setStyle(input.style)
            .setRequired(input.required);

        if (type === 'settings' && userSettings) {
            switch (input.id) {
                case 'lab_speed':
                    textInput.setValue(userSettings.labSpeed.toString());
                    break;
                case 'lab_relic':
                    textInput.setValue(userSettings.labRelic.toString());
                    break;
                case 'lab_discount':
                    textInput.setValue(userSettings.labDiscount.toString());
                    break;
            }
        } else if (input.defaultValue) {
            textInput.setValue(input.defaultValue);
        }

        return new ActionRowBuilder().addComponents(textInput);
    });

    modal.addComponents(...inputs);
    return modal;
}

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('lab_old')
        .setDescription('Calculate lab upgrade costs and times')
        .addSubcommand(subcommand =>
            subcommand.setName('settings')
                .setDescription('Set your lab calculation preferences')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('main')
                .setDescription('Main labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.main.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('damage')
                .setDescription('Damage labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.damage.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('defense')
                .setDescription('Defense labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.defense.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('utility')
                .setDescription('Utility labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.utility.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('cards')
                .setDescription('Card labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.cards.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('perks')
                .setDescription('Perk labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.perks.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('bots')
                .setDescription('Bot labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.bots.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('enemies')
                .setDescription('Enemy labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.enemies.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('modules')
                .setDescription('Module labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.modules.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('uw_gt')
                .setDescription('Golden Tower upgrades')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.uw_gt.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('uw_dw')
                .setDescription('Death Wave upgrades')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.uw_dw.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('uw_bh')
                .setDescription('Black Hole upgrades')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.uw_bh.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('uw_cf')
                .setDescription('Chrono Field upgrades')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.uw_cf.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('uw_cl')
                .setDescription('Chain Lightning upgrades')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.uw_cl.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('masteries_1-15')
                .setDescription('Mastery labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.masteries_1_15.map(lab => ({ name: lab.name, value: lab.value })))
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('masteries_16-30')
                .setDescription('Mastery labs calculations')
                .addStringOption(option =>
                    option.setName('lab')
                        .setDescription('Select the lab to calculate')
                        .setRequired(true)
                        .addChoices(...LABS.LAB_CATEGORIES.masteries_16_30.map(lab => ({ name: lab.name, value: lab.value })))
                )
        ),

    async execute(interaction) {
        const lab = interaction.options.getString('lab');
        try {
            // Show modal based on command
            if (interaction.options.getSubcommand() === 'settings') {
                const modal = await createModal('settings', interaction.user.id);
                await interaction.showModal(modal);
            } else {
                const category = interaction.options.getSubcommand();
                if (!lab) {
                    await interaction.reply({
                        content: '❌ Invalid lab selected. Please select a valid lab.',
                        ephemeral: true
                        });
                    return;
                }
                console.log(lab);
                const modal = await createModal('calculator', null, category, lab);
                await interaction.showModal(modal);
            }

            // Wait for and handle modal submission
            const submitted = await interaction.awaitModalSubmit({
                time: 60000,
                filter: i => i.customId.startsWith('lab_')
            }).catch(error => {
                console.error('Modal submission error:', error);
                return null;
            });

            if (!submitted) return;

            const [prefix, type] = submitted.customId.split('_');

            if (type === 'settings') {
                await submitted.deferReply({ ephemeral: true });
                
                const labSpeed = parseInt(submitted.fields.getTextInputValue('lab_speed'));
                const labRelic = parseFloat(submitted.fields.getTextInputValue('lab_relic'));
                const labDiscount = parseInt(submitted.fields.getTextInputValue('lab_discount'));
                
                if (isNaN(labSpeed) || isNaN(labRelic) || isNaN(labDiscount)) {
                    await submitted.editReply({ 
                        content: '❌ Invalid input. Please enter valid numbers.',
                        ephemeral: true 
                    });
                    return;
                }

                await saveUserSettings(
                    submitted.user.id,
                    submitted.user.username,
                    labSpeed,
                    labRelic,
                    labDiscount
                );
                
                await submitted.editReply({ 
                    content: `✅ Settings saved:\n• Lab Speed: ${labSpeed}\n• Lab Relic: ${labRelic}%\n• Lab Discount: ${labDiscount}`,
                    ephemeral: true 
                });
            } else if (type === 'calculator') {
                const startLevel = parseInt(submitted.fields.getTextInputValue('start_level'));
                const targetLevel = parseInt(submitted.fields.getTextInputValue('end_level'));
                const speedUp = parseInt(submitted.fields.getTextInputValue('speed_up'));
            
                // Fetch user settings from the database
                let userSettings;
                try {
                    userSettings = await getUserSettings(submitted.user.id);
                    if (!userSettings) {
                        await submitted.reply({
                            content: '❌ No user settings found. Please set your lab preferences using the `/lab settings` command.',
                            ephemeral: true
                        });
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching user settings:', error);
                    await submitted.reply({
                        content: '❌ An error occurred while retrieving your settings. Please try again later.',
                        ephemeral: true
                    });
                    return;
                }

                if (isNaN(startLevel) || isNaN(targetLevel) || isNaN(speedUp) || startLevel < 0 || startLevel > 100 || targetLevel > 100 || targetLevel < startLevel || speedUp < 1 || speedUp > 6) {
                    await submitted.reply({
                        content: '❌ Invalid input. Please ensure all fields are filled correctly.',
                        ephemeral: true
                    });
                    return;
                }            
                
                // Add the speedUp multiplier from the modal input
                userSettings.speedUp = speedUp;
            
                try {
                    const { chart, totals } = calculateLabData(lab, startLevel, targetLevel, userSettings);
                
                    // Generate the HTML file
                    const htmlFilePath = await generateChartHTML(chart, totals, userSettings, lab, startLevel, targetLevel);
                
                    // Generate the screenshot
                    const screenshotPath = await generateChartImage(htmlFilePath);
                
                    // Upload the screenshot to Discord
                    await submitted.reply({
                        files: [screenshotPath]
                    });
                
                    // Clean up temporary files
                    fs.unlinkSync(htmlFilePath);
                    fs.unlinkSync(screenshotPath);
                } catch (error) {
                    console.error('Error in execute:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ There was an error processing your request.',
                            ephemeral: true 
                        });
                    }
                }
            }
        } catch (error) {
            console.error('An error occurred:', error); 
        }
    }
};