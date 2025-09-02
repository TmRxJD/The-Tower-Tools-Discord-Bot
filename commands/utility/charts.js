
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const chartFunctions = require('./chartFunctions');
const fs = require('fs'); 

const uwData = require('./upgradesData/uwData.js');

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('chart')
        .setDescription('Interactive charts for Tower Defense data'),
    
    async execute(interaction) {
        try {
            // Initial state: no preselection
            let state = {
                categorySelected: null,
                subcategorySelected: null,
                itemSelected: null
            };


            // Initial response with embed, dropdowns, and home screen buttons
            const embed = createInitialEmbed();
            const categoryRow = createCategorySelectMenu();
            const subcategoryRow = createSubcategorySelectMenu();
            const itemRow = createItemSelectMenu();
            // Home screen: Add New Chart and Close buttons
            const homeButtonRow = new ActionRowBuilder().addComponents(
                
                new ButtonBuilder()
                    .setCustomId('add_new_chart')
                    .setLabel('Add New Chart')
                    .setStyle(ButtonStyle.Success),
                  
                new ButtonBuilder()
                    .setCustomId('close_menu')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
            );

            // Store the interaction for later updates

            let initialResponse = await interaction.reply({
                embeds: [embed],
                components: [categoryRow, subcategoryRow, itemRow, homeButtonRow],
                ephemeral: true,
                fetchReply: true
            });

            // Create collector for handling dropdown interactions
            // We'll implement a manual timeout that resets after each interaction
            let timeoutMs = 300000; // 5 minutes
            let timeoutHandle;
            const collector = initialResponse.createMessageComponentCollector();

            // Helper to clear and reset the timeout
            function resetCollectorTimeout() {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                timeoutHandle = setTimeout(() => {
                    collector.stop('manual_timeout');
                }, timeoutMs);
            }
            // Start the initial timeout
            resetCollectorTimeout();

            collector.on('collect', async i => {
                resetCollectorTimeout();

                try {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: 'This chart menu belongs to someone else.', ephemeral: true });
                        return;
                    }

                    // Handle close button
                    if (i.customId === 'close_menu') {
                        const closedEmbed = EmbedBuilder.from(embed)
                            .setDescription('Menu closed.')
                            .setFooter({ text: 'Use /chart to start again.' });
                        await i.update({
                            embeds: [closedEmbed],
                            components: [],
                            files: []
                        });
                        return;
                    }

                    // Handle Add New Chart button (home screen only)
                    if (i.customId === 'add_new_chart') {
                        // Remove dropdowns, show back/cancel buttons, update embed for chart submission intro
                        const addChartEmbed = EmbedBuilder.from(embed)
                            .setDescription('**Chart Submission**\n\nYou will be prompted to enter the following information:\n- Title\n- Description\n- Categories and subcategories\n- Credits (who should be credited)\n- Any formulas used to generate the chart (if any)\n- An image of the chart (upload after details)\n- Any raw data used (as a file or message)');
                        const addChartButtonRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('back_to_home')
                                .setLabel('Back')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('close_menu')
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('start_chart_details_modal')
                                .setLabel('Continue')
                                .setStyle(ButtonStyle.Success)
                        );
                        await i.update({
                            embeds: [addChartEmbed],
                            components: [addChartButtonRow],
                            files: []
                        });
                        return;
                    }

                    // Handle Start Chart Details Modal (new order: modal first, then image)
                    if (i.customId === 'start_chart_details_modal') {
                        // Show modal for chart details first
                        const modal = new ModalBuilder()
                            .setCustomId('new_chart_details_modal')
                            .setTitle('Chart Submission Details')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('chart_title')
                                        .setLabel('Chart Title')
                                        .setStyle(TextInputStyle.Short)
                                        .setMinLength(3)
                                        .setMaxLength(100)
                                        .setRequired(true)
                                        .setPlaceholder('Enter a title for the chart')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('chart_description')
                                        .setLabel('Description')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setMinLength(10)
                                        .setMaxLength(1024)
                                        .setRequired(true)
                                        .setPlaceholder('Describe what this chart shows')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('chart_categories')
                                        .setLabel('Categories/Subcategories')
                                        .setStyle(TextInputStyle.Short)
                                        .setMinLength(3)
                                        .setMaxLength(100)
                                        .setRequired(true)
                                        .setPlaceholder('e.g. Ultimate Weapons > Death Wave')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('chart_credits')
                                        .setLabel('Credits')
                                        .setStyle(TextInputStyle.Short)
                                        .setMinLength(2)
                                        .setMaxLength(100)
                                        .setRequired(false)
                                        .setPlaceholder('Who should be credited? (optional)')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('chart_formulas')
                                        .setLabel('Formulas Used')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setMinLength(0)
                                        .setMaxLength(1024)
                                        .setRequired(false)
                                        .setPlaceholder('Any formulas used to generate the chart? (optional)')
                                )
                            );
                        await i.showModal(modal);

                        // Wait for modal submission
                        const filter = (modalInt) => modalInt.customId === 'new_chart_details_modal' && modalInt.user.id === i.user.id;
                        let modalSubmission;
                        try {
                            modalSubmission = await i.awaitModalSubmit({ filter, time: 120000 });
                        } catch (err) {
                            await i.followUp({
                                embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('No details were submitted in time. Chart submission cancelled.')],
                                ephemeral: true
                            });
                            return;
                        }

                        // Acknowledge the modal submission immediately
                        await modalSubmission.deferReply({ ephemeral: true });

                        // Gather modal fields
                        const title = modalSubmission.fields.getTextInputValue('chart_title');
                        const description = modalSubmission.fields.getTextInputValue('chart_description');
                        const categories = modalSubmission.fields.getTextInputValue('chart_categories');
                        const credits = modalSubmission.fields.getTextInputValue('chart_credits');
                        const formulas = modalSubmission.fields.getTextInputValue('chart_formulas');

                        // Show embed with the details just entered, before image upload
                        let detailsEmbed = new EmbedBuilder()
                            .setTitle('Chart Submission: Details')
                            .setDescription('You have entered the following details. Now, please upload an image of the chart you want to add.\n\n**Attach the image in your next message below.**\n\nYou have 2 minutes to upload. Type `cancel` to abort.')
                            .addFields(
                                { name: 'Title', value: title },
                                { name: 'Description', value: description },
                                { name: 'Categories/Subcategories', value: categories },
                                { name: 'Credits', value: credits || 'None' },
                                { name: 'Formulas Used', value: formulas || 'None' }
                            )
                            .setColor('#00bfff');
                        await modalSubmission.editReply({
                            embeds: [detailsEmbed],
                            components: [],
                            files: []
                        });

                        // Wait for image upload from the user
                        const filterMsg = m => m.author.id === modalSubmission.user.id && (m.attachments.size > 0 || m.content.toLowerCase() === 'cancel');
                        const channel = modalSubmission.channel;
                        if (!channel) {
                            await modalSubmission.followUp({ content: 'Could not find the channel to upload the image. Please try again.', ephemeral: true });
                            return;
                        }

                        let chartImageBuffer = null;
                        let chartImageAttachment = null;
                        try {
                            const collected = await channel.awaitMessages({ filter: filterMsg, max: 1, time: 120000, errors: ['time'] });
                            const msg = collected.first();
                            if (!msg) {
                                await modalSubmission.editReply({
                                    embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('No image message was received. Please try again.')],
                                    components: [],
                                    files: []
                                });
                                return;
                            }
                            if (msg.content && msg.content.toLowerCase() === 'cancel') {
                                await modalSubmission.editReply({
                                    embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('Chart submission cancelled by user.')],
                                    components: [],
                                    files: []
                                });
                                await msg.delete().catch(() => {});
                                return;
                            }
                            const attachment = msg.attachments.first();
                            const isImage = attachment && (
                                (attachment.contentType && attachment.contentType.startsWith('image/')) ||
                                (attachment.name && attachment.name.match(/\.(png|jpe?g|gif|webp|bmp)$/i))
                            );
                            if (!isImage) {
                                await modalSubmission.editReply({
                                    embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('You must upload an image file (png, jpg, jpeg, gif, webp, bmp). Chart submission cancelled.')],
                                    components: [],
                                    files: []
                                });
                                await msg.delete().catch(() => {});
                                return;
                            }

                            // Download and store the image buffer and attachment
                            const fetch = require('node-fetch');
                            const response = await fetch(attachment.url);
                            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                            const arrayBuffer = await response.arrayBuffer();
                            chartImageBuffer = Buffer.from(arrayBuffer);
                            chartImageAttachment = new AttachmentBuilder(chartImageBuffer, { name: 'chart.png' });

                            // Show the embed with the image and the review/submit step (no additional data yet)
                            let reviewEmbed = new EmbedBuilder()
                                .setTitle('Chart Submission Review')
                                .setDescription('Please review your submission below. If everything looks correct, confirm to submit.\n\nIf you have any additional data to include (such as raw data, spreadsheet, or notes), please enter it as a message or file attachment in this chat now.\n\nWhen ready, click **Submit** below. If you have no additional data, just click Submit. You have 2 minutes to add data or submit.')
                                .addFields(
                                    { name: 'Title', value: title },
                                    { name: 'Description', value: description },
                                    { name: 'Categories/Subcategories', value: categories },
                                    { name: 'Credits', value: credits || 'None' },
                                    { name: 'Formulas Used', value: formulas || 'None' }
                                )
                                .setImage('attachment://chart.png')
                                .setColor('#00bfff');

                            const reviewRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('submit_chart_final').setLabel('Submit').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('cancel_chart_final').setLabel('Cancel').setStyle(ButtonStyle.Danger)
                            );

                            await modalSubmission.editReply({
                                embeds: [reviewEmbed],
                                components: [reviewRow],
                                files: [chartImageAttachment]
                            });

                            // Listen for additional data (message or file) or submit/cancel
                            const reviewChannel = modalSubmission.channel;
                            let additionalData = null;
                            let additionalFiles = [];
                            let submitOrCancel = false;
                            const dataFilter = m => m.author.id === modalSubmission.user.id && (m.attachments.size > 0 || m.content.length > 0);
                            const buttonFilter = btnInt2 => ['submit_chart_final', 'cancel_chart_final'].includes(btnInt2.customId) && btnInt2.user.id === modalSubmission.user.id;
                            const dataCollector = reviewChannel.createMessageCollector({ filter: dataFilter, max: 1, time: 120000 });
                            const reviewMsg = await modalSubmission.fetchReply();
                            let buttonCollector2 = reviewMsg.createMessageComponentCollector({ filter: buttonFilter, max: 1, time: 120000 });
                            dataCollector.on('collect', async m => {
                                // Only show additional data in the embed if it was entered as a message, not as a file
                                if (m.attachments.size > 0) {
                                    additionalFiles = Array.from(m.attachments.values());
                                    // Do NOT attempt to read or display text file contents in the embed if uploaded as a file
                                    // Just keep the file for staff review
                                }
                                if (m.content && m.content.length > 0) {
                                    additionalData = m.content;
                                }
                                // Update the embed to show the additional data and remove the prompt
                                let updatedEmbed = new EmbedBuilder()
                                    .setTitle('Chart Submission Review')
                                    .setDescription('Please review your submission below. If everything looks correct, confirm to submit.')
                                    .addFields(
                                        { name: 'Title', value: title },
                                        { name: 'Description', value: description },
                                        { name: 'Categories/Subcategories', value: categories },
                                        { name: 'Credits', value: credits || 'None' },
                                        { name: 'Formulas Used', value: formulas || 'None' }
                                    )
                                    .setImage('attachment://chart.png')
                                    .setColor('#00bfff');
                                if (additionalData) {
                                    // Only show if entered as a message
                                    let safeAdditionalData = String(additionalData).slice(0, 1024);
                                    updatedEmbed.addFields({ name: 'Additional Data', value: safeAdditionalData });
                                }
                                if (additionalFiles.length > 0) {
                                    updatedEmbed.addFields({ name: 'Additional Files', value: additionalFiles.map(f => f.name || f.url || 'file').join(', ') });
                                }
                                await modalSubmission.editReply({
                                    embeds: [updatedEmbed],
                                    components: [reviewRow],
                                    files: [chartImageAttachment, ...additionalFiles]
                                });
                                m.delete().catch(() => {});
                                // Re-create the button collector after editReply ONLY if additional data was added
                                if (m.attachments.size > 0 || (m.content && m.content.length > 0)) {
                                    if (buttonCollector2) buttonCollector2.stop('data_received');
                                    const newReviewMsg = await modalSubmission.fetchReply();
                                    buttonCollector2 = newReviewMsg.createMessageComponentCollector({ filter: buttonFilter, max: 1, time: 120000 });
                                    buttonCollector2.on('collect', async btnInt2 => {
                                        submitOrCancel = true;
                                        dataCollector.stop('button');
                                        buttonCollector2.stop('button');
                                        if (btnInt2.customId === 'cancel_chart_final') {
                                            // Only update the original message, do not send a new message
                                            await modalSubmission.editReply({
                                                embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('Chart submission cancelled by user.')],
                                                components: [],
                                                files: []
                                            });
                                            // Remove the interaction reply if Discord requires it
                                            if (btnInt2.deferred || btnInt2.replied) {
                                                try { await btnInt2.deleteReply(); } catch {}
                                            }
                                            return;
                                        }
                                        // --- STAFF REVIEW CHANNEL CREATION ---
                                        try {
                                            const chartCategoryId = process.env.REPORT_CATEGORY_ID || null;
                                            const guild = btnInt2.guild;
                                            let reviewChannel;
                                            if (!chartCategoryId || typeof chartCategoryId !== 'string' || chartCategoryId === 'null') {
                                                console.error('REPORT_CATEGORY_ID is not set. Cannot create staff review channel.');
                                            } else if (guild) {
                                                let channelNumber = 1;
                                                try {
                                                    const existing = guild.channels.cache.filter(ch => ch.parentId === chartCategoryId && /^chart-#\d{4}$/.test(ch.name));
                                                    if (existing.size > 0) {
                                                        const maxNum = Math.max(...existing.map(ch => parseInt(ch.name.match(/chart-#(\d{4})/)[1], 10)));
                                                        channelNumber = maxNum + 1;
                                                    }
                                                    const channelName = `chart-#${channelNumber.toString().padStart(4, '0')}`;
                                                    reviewChannel = await guild.channels.create({
                                                        name: channelName,
                                                        type: ChannelType.GuildText,
                                                        parent: chartCategoryId,
                                                        topic: `Chart submission by ${btnInt2.user.tag}`
                                                    });
                                                } catch (err) {
                                                    console.error('Error creating chart submission review channel:', err);
                                                }
                                            }
                                            if (reviewChannel) {
                                                let submissionText = `**New Chart Submission**\nSubmitted by: <@${btnInt2.user.id}> (${btnInt2.user.tag})\n`;
                                                submissionText += `\n**Title:** ${title}`;
                                                submissionText += `\n**Description:** ${description}`;
                                                submissionText += `\n**Categories/Subcategories:** ${categories}`;
                                                submissionText += `\n**Credits:** ${credits || 'None'}`;
                                                submissionText += `\n**Formulas Used:** ${formulas || 'None'}`;
                                                if (additionalData && (!additionalFiles || additionalFiles.length === 0)) {
                                                    let safeAdditionalData = String(additionalData).slice(0, 1024);
                                                    submissionText += `\n**Additional Data:** ${safeAdditionalData}`;
                                                }
                                                await reviewChannel.send({ content: submissionText });
                                                if (chartImageAttachment) {
                                                    await reviewChannel.send({ files: [chartImageAttachment] });
                                                }
                                                if (additionalFiles && additionalFiles.length > 0) {
                                                    await reviewChannel.send({ files: additionalFiles });
                                                }
                                            }
                                        } catch (err) {
                                            console.error('Error posting chart submission to staff review channel:', err);
                                        }
                                        // Update the original embed to show confirmation (no new message)
                                        await modalSubmission.editReply({
                                            embeds: [
                                                new EmbedBuilder()
                                                    .setTitle('Chart Submitted!')
                                                    .setDescription('Thank you for your submission! The team will review it soon.')
                                                    .setColor('#00bfff')
                                            ],
                                            components: [],
                                            files: []
                                        });
                                        // Remove the interaction reply if Discord requires it
                                        if (btnInt2.deferred || btnInt2.replied) {
                                            try { await btnInt2.deleteReply(); } catch {}
                                        }
                                        // No new message sent to user
                                    });
                                }
                                    
                                // (no catch block needed here, error handling is not required for this simple logic)
                            });
                            buttonCollector2.on('collect', async btnInt2 => {
                                submitOrCancel = true;
                                dataCollector.stop('button');
                                buttonCollector2.stop('button');
                                if (btnInt2.customId === 'cancel_chart_final') {
                                    // Only update the original message, do not send a new message
                                    await modalSubmission.editReply({
                                        embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('Chart submission cancelled by user.')],
                                        components: [],
                                        files: []
                                    });
                                    // Always acknowledge the interaction, but with an empty update (no new message)
                                    try {
                                        if (!btnInt2.deferred && !btnInt2.replied) {
                                            await btnInt2.deferUpdate();
                                        }
                                    } catch {}
                                    return;
                                }

                                // --- STAFF REVIEW CHANNEL CREATION ---
                                try {
                                    // Use CHART_SUBMISSION_CATEGORY_ID from env/config
                                    const chartCategoryId = process.env.REPORT_CATEGORY_ID || null;
                                    const guild = btnInt2.guild;
                                    let reviewChannel;
                                    if (!chartCategoryId || typeof chartCategoryId !== 'string' || chartCategoryId === 'null') {
                                        // Still thank the user, but log error
                                        console.error('REPORT_CATEGORY_ID is not set. Cannot create staff review channel.');
                                    } else if (guild) {
                                        // Find the next available chart-#xxxx channel number
                                        let channelNumber = 1;
                                        try {
                                            // Always scan all channels in the category for the highest chart-#xxxx
                                            let maxNum = 0;
                                            for (const ch of guild.channels.cache.values()) {
                                                if (ch.parentId === chartCategoryId && typeof ch.name === 'string') {
                                                    const m = ch.name.match(/^chart-(\d{4})$/);
                                                    if (m && !isNaN(m[1])) {
                                                        const num = parseInt(m[1], 10);
                                                        if (num > maxNum) maxNum = num;
                                                    }
                                                }
                                            }
                                            channelNumber = maxNum + 1;
                                            const channelName = `chart-${channelNumber.toString().padStart(4, '0')}`;
                                            reviewChannel = await guild.channels.create({
                                                name: channelName,
                                                type: ChannelType.GuildText,
                                                parent: chartCategoryId,
                                                topic: `Chart submission by ${btnInt2.user.tag}`
                                            });
                                        } catch (err) {
                                            console.error('Error creating chart submission review channel:', err);
                                        }
                                    }
                                    // Post the submission in the channel
                                    if (reviewChannel) {
                                        let submissionText = `**New Chart Submission**\nSubmitted by: <@${btnInt2.user.id}> (${btnInt2.user.tag})\n`;
                                        submissionText += `\n**Title:** ${title}`;
                                        submissionText += `\n**Description:** ${description}`;
                                        submissionText += `\n**Categories/Subcategories:** ${categories}`;
                                        submissionText += `\n**Credits:** ${credits || 'None'}`;
                                        submissionText += `\n**Formulas Used:** ${formulas || 'None'}`;
                                        // Only include additionalData if it was entered as a message (not as a file)
                                        if (additionalData && (!additionalFiles || additionalFiles.length === 0)) {
                                            let safeAdditionalData = String(additionalData).slice(0, 1024);
                                            submissionText += `\n**Additional Data:** ${safeAdditionalData}`;
                                        }
                                        // Send the main message
                                        await reviewChannel.send({
                                            content: submissionText
                                        });
                                        // Send the chart image
                                        if (chartImageAttachment) {
                                            await reviewChannel.send({ files: [chartImageAttachment] });
                                        }
                                        // Send any additional files
                                        if (additionalFiles && additionalFiles.length > 0) {
                                            await reviewChannel.send({ files: additionalFiles });
                                        }
                                    }
                                } catch (err) {
                                    console.error('Error posting chart submission to staff review channel:', err);
                                }

                                // Update the original embed to show confirmation (no new message)
                                await modalSubmission.editReply({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('Chart Submitted!')
                                            .setDescription('Thank you for your submission! The team will review it soon.')
                                            .setColor('#00bfff')
                                    ],
                                    components: [],
                                    files: []
                                });
                                // Always acknowledge the interaction, but with an empty update (no new message)
                                try {
                                    if (!btnInt2.deferred && !btnInt2.replied) {
                                        await btnInt2.deferUpdate();
                                    }
                                } catch {}
                                // No new message sent to user
                            });
                            dataCollector.on('end', (collected, reason) => {
                                if (!submitOrCancel && reason !== 'data_received' && reason !== 'button') {
                                    buttonCollector2.stop('data_collector_ended');
                                }
                            });
                            buttonCollector2.on('end', (collected, reason) => {
                                if (!submitOrCancel && reason !== 'data_received' && reason !== 'button') {
                                    dataCollector.stop('button_collector_ended');
                                }
                            });
                            msg.delete().catch(() => {});
                        } catch (err) {
                            console.error('Chart image upload error:', err);
                            await modalSubmission.editReply({
                                embeds: [new EmbedBuilder().setTitle('Chart Submission Cancelled').setDescription('No image was uploaded in time. Chart submission cancelled.')],
                                components: [],
                                files: []
                            });
                        }
                        return;
                    }

                    // Handle Back button from Add Chart flow
                    if (i.customId === 'back_to_home') {
                        await i.update({
                            embeds: [embed],
                            components: [categoryRow, subcategoryRow, itemRow, homeButtonRow],
                            files: []
                        });
                        return;
                    }

                    // Handle Report Mistake button (on chart view)
                    if (i.customId === 'report_mistake') {
                        // Show modal for mistake report
                        await i.showModal({
                            custom_id: 'mistake_report_modal',
                            title: 'Report a Mistake',
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            custom_id: 'mistake_description',
                                            style: 2,
                                            label: 'Describe the mistake in detail:',
                                            min_length: 20,
                                            max_length: 2000,
                                            required: true,
                                            placeholder: 'Describe the error, what is wrong, and any details to help us fix it.'
                                        }
                                    ]
                                }
                            ]
                        });

                        // Wait for modal submission from the same user
                        const filter = (modalInt) => modalInt.customId === 'mistake_report_modal' && modalInt.user.id === i.user.id;
                        try {
                            const modalInteraction = await i.awaitModalSubmit({ filter, time: 120_000 });
                            const description = modalInteraction.fields.getTextInputValue('mistake_description');

                            // Chart context for the report
                            const chartContext = [
                                state.categorySelected ? `**Category:** ${state.categorySelected}` : null,
                                state.subcategorySelected ? `**Subcategory:** ${state.subcategorySelected}` : null,
                                state.itemSelected ? `**Chart:** ${state.itemSelected}` : null
                            ].filter(Boolean).join('\n');

                            // Create a report channel in a specific category (replace with your category ID)
                            const reportCategoryId = process.env.REPORT_CATEGORY_ID || null; // Set this in your environment or config
                            const guild = modalInteraction.guild;
                            let reportChannel;
                            if (!reportCategoryId || typeof reportCategoryId !== 'string' || reportCategoryId === 'null') {
                                await modalInteraction.reply({
                                    content: 'Thank you for your report! (Note: No report channel was created because the report category ID is not set. Please contact the bot admin.)',
                                    ephemeral: true
                                });
                                return;
                            }
                            // Find the next available mistake-#xxxx channel number
                            let channelNumber = 1;
                            if (guild) {
                                try {
                                    // Always scan all channels in the category for the highest mistake-#xxxx
                                    let maxNum = 0;
                                    for (const ch of guild.channels.cache.values()) {
                                        if (ch.parentId === reportCategoryId && typeof ch.name === 'string') {
                                            const m = ch.name.match(/^mistake-(\d{4})$/);
                                            if (m && !isNaN(m[1])) {
                                                const num = parseInt(m[1], 10);
                                                if (num > maxNum) maxNum = num;
                                            }
                                        }
                                    }
                                    channelNumber = maxNum + 1;
                                    const channelName = `mistake-${channelNumber.toString().padStart(4, '0')}`;
                                    reportChannel = await guild.channels.create({
                                        name: channelName,
                                        type: ChannelType.GuildText,
                                        parent: reportCategoryId,
                                        topic: `Chart mistake report by ${modalInteraction.user.tag}`
                                    });
                                } catch (err) {
                                    console.error('Error creating report channel:', err);
                                    await modalInteraction.reply({
                                        content: 'Thank you for your report! (But there was an error creating the report channel. Please contact the bot admin.)',
                                        ephemeral: true
                                    });
                                    return;
                                }
                            }

                            // Post the report in the channel
                            if (reportChannel) {
                                await reportChannel.send({
                                    content: `**Chart Mistake Report**\nReporter: <@${modalInteraction.user.id}> (${modalInteraction.user.tag})\n${chartContext ? chartContext + '\n' : ''}\n${description}`
                                });
                            }

                            await modalInteraction.reply({
                                content: 'Thank you for your report! The team will review it soon.',
                                ephemeral: true
                            });
                        } catch (err) {
                            // Modal not submitted in time or error
                            await i.followUp({
                                content: 'Mistake report was not submitted in time or an error occurred.',
                                ephemeral: true
                            });
                        }
                        return;
                    }

                    await i.deferUpdate();

                    let updateType = null;
                    if (i.customId === 'category_select') {
                        state.categorySelected = i.values[0];
                        state.subcategorySelected = null;
                        state.itemSelected = null;
                        updateType = 'category';
                    } else if (i.customId === 'subcategory_select') {
                        state.subcategorySelected = i.values[0];
                        state.itemSelected = null;
                        updateType = 'subcategory';
                    } else if (i.customId === 'item_select') {
                        state.itemSelected = i.values[0];
                        updateType = 'item';
                    }

                    // --- CATEGORY SELECTED: auto-select subcategory/item if only one ---
                    if (updateType === 'category') {
                        const cat = chartCategoryIndex[state.categorySelected];
                        const subcategories = cat?.subcategories || [];
                        if (subcategories.length === 1) {
                            state.subcategorySelected = subcategories[0];
                            // Now check if only one item for this subcategory
                            let items = [];
                            if (cat && Array.isArray(cat.items)) {
                                items = cat.items;
                            } else if (cat && typeof cat.items === 'object') {
                                items = cat.items[state.subcategorySelected] || [];
                            }
                            if (items.length === 1) {
                                state.itemSelected = items[0];
                                // Build embed and dropdowns for preselected state
                                const updatedEmbed = await buildChartEmbed(state, embed);
                                const updatedCategoryRow = createCategorySelectMenu(state.categorySelected);
                                const updatedSubcategoryRow = createSubcategorySelectMenu(state.categorySelected, state.subcategorySelected);
                                const updatedItemRow = createItemSelectMenu(state.categorySelected, state.subcategorySelected, state.itemSelected);
                                // Build correct button row for chart view
                                const buttonRow = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('report_mistake')
                                        .setLabel('Report Mistake')
                                        .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                        .setCustomId('close_menu')
                                        .setLabel('Close')
                                        .setStyle(ButtonStyle.Danger)
                                );
                                await generateAndSendChart(i, state, updatedEmbed, [updatedCategoryRow, updatedSubcategoryRow, updatedItemRow, buttonRow]);
                                return;
                            }
                        }
                    }

                    // --- SUBCATEGORY SELECTED: auto-select item if only one ---
                    if (updateType === 'subcategory') {
                        let items = [];
                        const cat = chartCategoryIndex[state.categorySelected];
                        if (cat && Array.isArray(cat.items)) {
                            items = cat.items;
                        } else if (cat && typeof cat.items === 'object') {
                            items = cat.items[state.subcategorySelected] || [];
                        }
                        if (items.length === 1) {
                            state.itemSelected = items[0];
                            // Build embed and dropdowns for preselected state
                            const updatedEmbed = await buildChartEmbed(state, embed);
                            const updatedCategoryRow = createCategorySelectMenu(state.categorySelected);
                            const updatedSubcategoryRow = createSubcategorySelectMenu(state.categorySelected, state.subcategorySelected);
                            const updatedItemRow = createItemSelectMenu(state.categorySelected, state.subcategorySelected, state.itemSelected);
                            // Build correct button row for chart view
                            const buttonRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('report_mistake')
                                    .setLabel('Report Mistake')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('close_menu')
                                    .setLabel('Close')
                                    .setStyle(ButtonStyle.Danger)
                            );
                            await generateAndSendChart(i, state, updatedEmbed, [updatedCategoryRow, updatedSubcategoryRow, updatedItemRow, buttonRow]);
                            return;
                        }
                    }

                    // Always update all dropdowns and embed
                    const updatedEmbed = await buildChartEmbed(state, embed);
                    const updatedCategoryRow = createCategorySelectMenu(state.categorySelected);
                    const updatedSubcategoryRow = createSubcategorySelectMenu(state.categorySelected, state.subcategorySelected);
                    const updatedItemRow = createItemSelectMenu(state.categorySelected, state.subcategorySelected, state.itemSelected);

                    // Button row logic
                    let buttonRow;
                    if (!state.categorySelected && !state.subcategorySelected && !state.itemSelected) {
                        // Home screen: Add New Chart + Close
                        buttonRow = homeButtonRow;
                    } else if (state.categorySelected && state.subcategorySelected && state.itemSelected) {
                        // Chart selected: Close + Report Mistake
                        buttonRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('report_mistake')
                                .setLabel('Report Mistake')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('close_menu')
                                .setLabel('Close')
                                .setStyle(ButtonStyle.Danger)
                        );
                    } else {
                        // Any other state: just Close
                        buttonRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('close_menu')
                                .setLabel('Close')
                                .setStyle(ButtonStyle.Danger)
                        );
                    }

                    // If a chart item is selected, generate and show the chart
                    if (state.categorySelected && state.subcategorySelected && state.itemSelected) {
                        await generateAndSendChart(i, state, updatedEmbed, [updatedCategoryRow, updatedSubcategoryRow, updatedItemRow, buttonRow]);
                    } else {
                        await i.editReply({
                            embeds: [updatedEmbed],
                            components: [updatedCategoryRow, updatedSubcategoryRow, updatedItemRow, buttonRow],
                            files: []
                        });
                    }
                } catch (error) {
                    console.error('Error handling interaction:', error);
                    try {
                        await i.followUp({
                            content: 'There was an error processing your selection.',
                            ephemeral: true
                        });
                    } catch (followUpError) {
                        console.error('Error sending follow-up:', followUpError);
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                try {
                    if (reason === 'manual_timeout') {
                        const closedEmbed = EmbedBuilder.from(embed)
                            .setDescription('Menu closed due to inactivity.')
                            .setFooter({ text: 'Use /chart to start again.' });
                        await interaction.editReply({
                            embeds: [closedEmbed],
                            components: [],
                            files: []
                        });
                    }
                } catch (error) {
                    console.error('Error handling collector end:', error);
                }
            });
        } catch (error) {
            console.error('Error initializing chart command:', error);
            await safeReply(interaction, 'There was an error initializing the chart command. Please try again later.');
        }
    }
};

// Helper Functions

function createInitialEmbed() {
    try {
        return new EmbedBuilder()
            .setTitle('The Tower Chart Finder')
            .setDescription(
                'Retrieve charts for The Tower game data.\n\n' +
                '**How to use:**\n' +
                '1. Select a category from the dropdown below\n' +
                '2. Choose a subcategory\n' +
                '3. Select the specific chart you want\n' +
                '4. View the results or change to another chart\n' + 
                '5. If you have a chart you want to add, use the "Add New" Button below to submit it for review.'

            )
            .setColor('#0099ff')
            .setFooter({ text: 'Select a category to continue' });
    } catch (error) {
        console.error('Error creating initial embed:', error);
        return new EmbedBuilder().setTitle('Error').setDescription('Could not create chart menu.');
    }
}


// Dynamically build chartCategoryIndex for Ultimate Weapons
const uwNames = Object.values(uwData).map(uw => uw.name);
const uwKeyByName = Object.fromEntries(Object.entries(uwData).map(([key, uw]) => [uw.name, key]));

const chartCategoryIndex = {
    'Vault': {
        subcategories: ['Upgrades and Cost'],
        items: {
            'Upgrades and Cost': ['Harmony Tree', 'Power Tree']
        }
    },
    'Ultimate Weapons': {
        subcategories: ['Stone Costs', 'Ultimate Weapons+', 'Chain Lightning', 'Death Wave', 'Spotlight', 'Chronofield', 'Poison Swamp'],
        items: {
            'Stone Costs': uwNames,
            'Ultimate Weapons+': ['Upgrades and Costs'],
            'Chain Lightning': ['Avg Bullets to Stack Shock', 'Chain Thunder Dmg Reduction'],
            'Death Wave': ['Gold Bot vs Death Wave Uptime'],
            'Spotlight': ['EO vs SLA Breakpoints'],
            'Chronofield': ['CF+ Rotation Rates', 'CF+ Speed Rates'],
            'Poison Swamp': ['Perma Swamp Stone Costs']
        }
    },
    'Cards': {
        subcategories: ['Masteries', 'Wave Skip'],
        items: {
            'Masteries': ['All Bonuses'],
            'Wave Skip': ['Multi-Skip Chances']
        }
    },
    'Labs': {
        subcategories: ['Cells', 'Ultimate Weapons'],
        items: {
            'Cells': ['Most Efficient Speed Multipliers'],
            'Ultimate Weapons': ['Chain Thunder Dmg Reduction']
        }
    },
    'Masteries': {
        subcategories: ['Wave Accelerator', 'Recovery Package Chance (Care Package)', 'Bonuses and Costs', 'Extra Orb', 'Wave Skip'],
        items: {
            'Wave Accelerator': ['Spawn Rates'],
            'Recovery Package Chance (Care Package)': ['Drop Rates'],
            'Bonuses and Costs': ['All Bonuses'],
            'Extra Orb': ['EO vs SLA Breakpoints'],
            'Wave Skip': ['Multi-Skip Chances']
        }
    },
    'Modules': {
        subcategories: ['Substats', 'Blackhole Digester (BHD)', 'Project Funding'],
        items: {
            'Substats': ['Cannon', 'Defense', 'Generator', 'Core'],
            'Blackhole Digester (BHD)': ['Wave Skip Coin Boost'],
            'Project Funding': ['Bonus Multipliers']
        }
    },
    'Enemies': {
        subcategories: ['Elites'],
        items: {
            'Elites': ['Elite Spawn Chance']
        }
    },
    'Bots': {
        subcategories: ['Upgrades and Costs', 'Gold Bot'],
        items: {
            'Upgrades and Costs': ['Flame Bot', 'Coin Bot', 'Thunder Bot', 'Amplify Bot'],
            'Gold Bot': ['Gold Bot vs Death Wave Uptime']
        }
    },
    'Guilds': {
        subcategories: ['Rewards'],
        items: {
            'Rewards': ['Guild Box Rewards']
        }
    },
    // Add more categories and subcategories as needed
};

function createCategorySelectMenu(selected) {
    try {
        const categories = Object.keys(chartCategoryIndex).sort((a, b) => a.localeCompare(b));
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('category_select')
                .setPlaceholder('Select a category')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(false)
                .addOptions(categories.map(category => ({
                    label: category,
                    value: category,
                    description: `View charts for ${category}`,
                    default: selected === category
                })))
        );
        return row;
    } catch (error) {
        console.error('Error creating category menu:', error);
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('error_menu')
                .setPlaceholder('Error loading categories')
                .addOptions([{ label: 'Error', value: 'error', description: 'Please try again later' }])
                .setDisabled(true)
        );
    }
}

function createSubcategorySelectMenu(category, selected) {
    try {
        const subcategories = category ? (chartCategoryIndex[category]?.subcategories || []).slice().sort((a, b) => a.localeCompare(b)) : [];
        const disabled = !category || subcategories.length === 0;
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('subcategory_select')
                .setPlaceholder('Select a subcategory')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(disabled)
                .addOptions(
                    subcategories.length > 0
                        ? subcategories.map(subcategory => ({
                            label: subcategory,
                            value: subcategory,
                            description: `View ${subcategory} charts`,
                            default: selected === subcategory
                        }))
                        : [{ label: 'No subcategories', value: 'none', description: 'No subcategories available', default: false, disabled: true }]
                )
        );
        return row;
    } catch (error) {
        console.error('Error creating subcategory menu:', error);
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('error_menu')
                .setPlaceholder('Error loading subcategories')
                .addOptions([{ label: 'Error', value: 'error', description: 'Please try again later' }])
                .setDisabled(true)
        );
    }
}

function createItemSelectMenu(category, subcategory, selected) {
    try {
        let items = [];
        if (category && subcategory) {
            const cat = chartCategoryIndex[category];
            if (cat && Array.isArray(cat.items)) {
                items = cat.items.slice().sort((a, b) => a.localeCompare(b));
            } else if (cat && typeof cat.items === 'object') {
                // Defensive: handle missing subcategory key
                items = (cat.items[subcategory] || []).slice().sort((a, b) => a.localeCompare(b));
            }
        }
        const disabled = !category || !subcategory || items.length === 0;
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('item_select')
                .setPlaceholder('Select a chart')
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(disabled)
                .addOptions(
                    items.length > 0
                        ? items.map(item => ({
                            label: item,
                            value: item,
                            description: `View ${item} chart`,
                            default: selected === item
                        }))
                        : [{ label: 'No charts', value: 'none', description: 'No charts available', default: false, disabled: true }]
                )
        );
        return row;
    } catch (error) {
        console.error('Error creating item menu:', error);
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('error_menu')
                .setPlaceholder('Error loading charts')
                .addOptions([{ label: 'Error', value: 'error', description: 'Please try again later' }])
                .setDisabled(true)
        );
    }
}

async function buildChartEmbed(state, prevEmbed) {
    const { categorySelected, subcategorySelected, itemSelected } = state;
    if (!categorySelected) {
        return createInitialEmbed();
    }
    if (!subcategorySelected) {
        return EmbedBuilder.from(prevEmbed)
            .setTitle(`${categorySelected} Charts`)
            .setDescription(`Select a subcategory for ${categorySelected}`)
            .setFooter({ text: `Category: ${categorySelected}` });
    }
    if (!itemSelected) {
        return EmbedBuilder.from(prevEmbed)
            .setTitle(`${subcategorySelected} Charts`)
            .setDescription(`Select a specific chart for ${subcategorySelected}`)
            .setFooter({ text: `Category: ${categorySelected} > ${subcategorySelected}` });
    }
    // If all selected, show loading or placeholder (actual chart will be generated)
    return EmbedBuilder.from(prevEmbed)
        .setTitle(`Generating Chart...`)
        .setDescription(`Generating chart for **${itemSelected}**...`)
        .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
}

// Generate and send chart, but keep dropdowns persistent
async function generateAndSendChart(interaction, state, embed, componentRows) {        
        
    const { categorySelected, subcategorySelected, itemSelected } = state;

    try {
        // Special case: Vault > Upgrades and Cost > Harmony Tree
        if (categorySelected === 'Vault' && subcategorySelected === 'Upgrades and Cost' && itemSelected === 'Harmony Tree') {
            const chartBuffer = await chartFunctions.harmonyTreeUpgradesChart.generateHarmonyTreeUpgradesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'harmony-tree-upgrades-costs.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Harmony Tree Upgrades & Costs')
                .setDescription('All upgrades and their key costs in the Harmony tech tree.')
                .setColor('#3ec6ff')
                .setImage('attachment://harmony-tree-upgrades-costs.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        // Special case: Vault > Upgrades and Cost > Power Tree
        if (categorySelected === 'Vault' && subcategorySelected === 'Upgrades and Cost' && itemSelected === 'Power Tree') {
            const chartBuffer = await chartFunctions.powerTreeUpgradesChart.generatePowerTreeUpgradesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'power-tree-upgrades-costs.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Power Tree Upgrades & Costs')
                .setDescription('All upgrades and their key costs in the Power tech tree.')
                .setColor('#f7b731')
                .setImage('attachment://power-tree-upgrades-costs.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        
        // Special case: Ultimate Weapons > Poison Swamp > Perma Swamp Stone Costs
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Poison Swamp' && itemSelected === 'Perma Swamp Stone Costs') {
            const chartBuffer = await chartFunctions.permaSwampStoneCostChart.generatePermaSwampStoneCostChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'perma-swamp-stone-costs.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Perma Swamp Stone Costs')
                .setDescription('A quick analysis of the stone costs to achieve perma Poison Swamp and the most stone efficient way to do so. \n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#8bc47f')
                .setImage('attachment://perma-swamp-stone-costs.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Masteries > Wave Skip > Multi-Skip Chances
        if (categorySelected === 'Masteries' && subcategorySelected === 'Wave Skip' && itemSelected === 'Multi-Skip Chances') {
            const chartBuffer = await chartFunctions.waveSkipMultiSkipChanceChart.generateWaveSkipMultiSkipChanceChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'wave-skip-multiskip-chances.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Wave Skip Multi-Skip Chances')
                .setDescription('Probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#b6fcd5')
                .setImage('attachment://wave-skip-multiskip-chances.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Cards > Wave Skip > Multi-Skip Chances
        if (categorySelected === 'Cards' && subcategorySelected === 'Wave Skip' && itemSelected === 'Multi-Skip Chances') {
            const chartBuffer = await chartFunctions.waveSkipMultiSkipChanceChart.generateWaveSkipMultiSkipChanceChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'wave-skip-multiskip-chances.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Wave Skip Multi-Skip Chances')
                .setDescription('Probability of different multi-skips with Maxed Wave Skip card, WS#0, and WS#9.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#b6fcd5')
                .setImage('attachment://wave-skip-multiskip-chances.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Chronofield > CF+ Speed Rates
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Chronofield' && itemSelected === 'CF+ Speed Rates') {
            const chartBuffer = await chartFunctions.CFPlusSpeedRatesChart.generateCFPlusSpeedRatesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'cfplus-speed-rates.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('CF+ Speed Rates')
                .setDescription('Documents hidden slow% and enemy speed rates for CF+ upgrades. Credits: <@1227916866157281311>, <@1121939503121178703>') // Credit's Preisten and Yournicknm
                .setColor('#00cc99')
                .setImage('attachment://cfplus-speed-rates.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        
        // Special case: Ultimate Weapons > Chronofield > CF+ Rotation Rates
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Chronofield' && itemSelected === 'CF+ Rotation Rates') {
            const chartBuffer = await chartFunctions.CFPlusRotationRatesChart.generateCFPlusRotationRatesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'cfplus-rotation-rates.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('CF+ Rotation Rates')
                .setDescription('Documents rotation and orbiting times of varying CF+ upgrades.\n\nCredits: <@1227916866157281311>, <@136641940493041664>, <@1121939503121178703>') // Credit's Preisten Tremnen and Yournicknm
                .setColor('#00cc99')
                .setImage('attachment://cfplus-rotation-rates.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Masteries > Extra Orb > EO vs SLA Breakpoints
        if (categorySelected === 'Masteries' && subcategorySelected === 'Extra Orb' && itemSelected === 'EO vs SLA Breakpoints') {
            const chartBuffer = await chartFunctions.EOvsSLABreakpointsChart.generateEOvsSLABreakpointsChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'eo-vs-sla-breakpoints.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('EO vs SLA Breakpoints')
                .setDescription('Breakpoints in coin efficiency of blender vs orbless with SLA and EO# (see chart for details).\n\nCredit: <@510962513211293696>') // Credit Yugiohcd10
                .setColor('#ffe066')
                .setImage('attachment://eo-vs-sla-breakpoints.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Spotlight > EO vs SLA Breakpoints
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Spotlight' && itemSelected === 'EO vs SLA Breakpoints') {
            const chartBuffer = await chartFunctions.EOvsSLABreakpointsChart.generateEOvsSLABreakpointsChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'eo-vs-sla-breakpoints.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('EO vs SLA Breakpoints')
                .setDescription('Breakpoints in coin efficiency of blender vs orbless with SLA and EO# (see chart for details).\n\nCredit: <@510962513211293696>') // Credit Yugiohcd10
                .setColor('#ffe066')
                .setImage('attachment://eo-vs-sla-breakpoints.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Death Wave > Gold Bot vs Death Wave Uptime
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Death Wave' && itemSelected === 'Gold Bot vs Death Wave Uptime') {
            const chartBuffer = await chartFunctions.goldBotVsDeathWaveUptimeChart.generateGoldBotVsDeathWaveUptimeChart();
            const fileName = 'gold-bot-vs-death-wave-uptime.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Gold Bot vs Death Wave Uptime')
                .setDescription('Average uptime of DW compared to GB at 48s vs 50s sync.\nYellow = Gold Bot\nRed = Death Wave\nOrange = Final Wave\n\nSee chart footer for details.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#ffe066')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Bots > Gold Bot > Gold Bot vs Death Wave Uptime
        if (categorySelected === 'Bots' && subcategorySelected === 'Gold Bot' && itemSelected === 'Gold Bot vs Death Wave Uptime') {
            const chartBuffer = await chartFunctions.goldBotVsDeathWaveUptimeChart.generateGoldBotVsDeathWaveUptimeChart();
            const fileName = 'gold-bot-vs-death-wave-uptime.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Gold Bot vs Death Wave Uptime')
                .setDescription('Average uptime of DW compared to GB at 48s vs 50s sync.\nYellow = Gold Bot\nRed = Death Wave\nOrange = Final Wave\n\nSee chart footer for details.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#ffe066')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Chain Lightning > Chain Thunder Dmg Reduction
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Chain Lightning' && itemSelected === 'Chain Thunder Dmg Reduction') {
            const chartBuffer = await chartFunctions.chainThunderDmgReductionChart.generateChainThunderDmgReductionChart();
            const fileName = 'chain-thunder-dmg-reduction.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Chain Thunder Dmg Reduction')
                .setDescription('CT lab level, reduction %, and CL+ required for Chain Lightning.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#00ffff')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Labs > Ultimate Weapons > Chain Thunder Dmg Reduction
        if (categorySelected === 'Labs' && subcategorySelected === 'Ultimate Weapons' && itemSelected === 'Chain Thunder Dmg Reduction') {
            const chartBuffer = await chartFunctions.chainThunderDmgReductionChart.generateChainThunderDmgReductionChart();
            const fileName = 'chain-thunder-dmg-reduction.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Chain Thunder Dmg Reduction')
                .setDescription('CT lab level, reduction %, and CL+ required for Chain Lightning.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#00ffff')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Guilds > Rewards > Guild Box Rewards
        if (categorySelected === 'Guilds' && subcategorySelected === 'Rewards' && itemSelected === 'Guild Box Rewards') {
            const chartBuffer = await chartFunctions.guildBoxRewardsChart.generateGuildBoxRewardsChart();
            const fileName = 'guild-box-rewards.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Guild Box Rewards')
                .setDescription('All guild box reward values by box tier and total.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#7fff7f')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Chain Lightning > Avg Bullets to Stack Shock
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Chain Lightning' && itemSelected === 'Avg Bullets to Stack Shock') {
            const chartBuffer = await chartFunctions.avgBulletsToStackShockChart.generateAvgBulletsToStackShockChart();
            const fileName = 'avg-bullets-to-stack-shock.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Avg Bullets to Stack 5 Shocks')
                .setDescription('Average number of bullets required to stack 5 shocks at different proc chances.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#3ec6ff')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Modules > Substats > [Cannon, Defense, Generator, Core]
        if (categorySelected === 'Modules' && subcategorySelected === 'Substats' && ['Cannon','Defense','Generator','Core'].includes(itemSelected)) {
            const chartBuffer = await chartFunctions.moduleSubstatValuesChart.generateModuleSubstatValuesChart(itemSelected);
            const attachment = new AttachmentBuilder(chartBuffer, { name: `module-substats-${itemSelected.toLowerCase()}.png` });
            const chartEmbed = new EmbedBuilder()
                .setTitle(`${itemSelected} Module Substat Values`)
                .setDescription(`All substat values for ${itemSelected} modules by rarity.\n\nCredit: <@339490996750516226>`) // kosmirion epos
                .setColor('#3ec6ff')
                .setImage(`attachment://module-substats-${itemSelected.toLowerCase()}.png`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Modules > Project Funding > Bonus Multipliers
        if (categorySelected === 'Modules' && subcategorySelected === 'Project Funding' && itemSelected === 'Bonus Multipliers') {
            const chartBuffer = await chartFunctions.bonusMultipliersChart.generateBonusMultipliersChart();
            const fileName = 'bonus-multipliers.png';
            const chartEmbed = new EmbedBuilder()
                .setTitle('Bonus Multipliers')
                .setDescription('All bonus multipliers for Project Funding module.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#b6fcd5')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        // Special case: Bots > Upgrades and Costs > [Flame Bot, Coin Bot, Thunder Bot, Amplify Bot]
        if (categorySelected === 'Bots' && subcategorySelected === 'Upgrades and Costs' && ['Flame Bot','Coin Bot','Thunder Bot','Amplify Bot'].includes(itemSelected)) {
            const chartBuffer = await chartFunctions.botUpgradesChart.generateBotUpgradesChart(itemSelected);
            const fileName = `bot-upgrades-${itemSelected.toLowerCase().replace(/ /g, '-')}.png`;
            const chartEmbed = new EmbedBuilder()
                .setTitle(`${itemSelected} Upgrades & Costs`)
                .setDescription(`All upgrade levels, costs, and stats for ${itemSelected}.`)
                .setColor('#f7b84b')
                .setImage(`attachment://${fileName}`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            const attachment = new AttachmentBuilder(chartBuffer, { name: fileName });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        // Special case: Ultimate Weapons > Ultimate Weapons+ > Upgrades and Costs
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Ultimate Weapons+' && itemSelected === 'Upgrades and Costs') {
            const chartBuffer = await chartFunctions.uwPlusUpgradesChart.generateUWPlusUpgradesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'uw-plus-upgrades-costs.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Ultimate Weapons+ Upgrades and Costs')
                .setDescription('All upgrade costs and effects for Ultimate Weapons+ (UW+).\n\nCredit: <@339490996750516226>') // kosmirion epos
                .setColor('#b6fcd5')
                .setImage('attachment://uw-plus-upgrades-costs.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Labs > Cells > Most Efficient Speed Multipliers
        if (categorySelected === 'Labs' && subcategorySelected === 'Cells' && itemSelected === 'Most Efficient Speed Multipliers') {
            const chartBuffer = await chartFunctions.labSpeedMultiplierChart.generateLabSpeedMultiplierChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'lab-speed-multiplier.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Most Efficient Lab Speed Multiplier')
                .setDescription('Shows the most efficient speed multiplier combinations for labs.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#fcd5b6')
                .setImage('attachment://lab-speed-multiplier.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Cards > Masteries > All Bonuses OR Masteries > Bonuses and Costs > All Bonuses
        if (
            (categorySelected === 'Cards' && subcategorySelected === 'Masteries' && itemSelected === 'All Bonuses') ||
            (categorySelected === 'Masteries' && subcategorySelected === 'Bonuses and Costs' && itemSelected === 'All Bonuses')
        ) {
            const chartBuffer = await chartFunctions.cardMasteryCostChart.generateCardMasteryCostChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'card-mastery-cost-bonuses.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Card Mastery Cost and Bonuses')
                .setDescription('See cost and bonus values for all card masteries at each level. All values are for labs with no discount.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#b6fcd5')
                .setImage('attachment://card-mastery-cost-bonuses.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Ultimate Weapons > Stone Costs (bespoke function)
        if (categorySelected === 'Ultimate Weapons' && subcategorySelected === 'Stone Costs' && uwKeyByName[itemSelected]) {
            const uwKey = uwKeyByName[itemSelected];
            const chartBuffer = await chartFunctions.uwStoneCostChart.generateUWStoneCostChart(uwKey);
            const attachment = new AttachmentBuilder(chartBuffer, { name: `${uwKey}-stone-costs.png` });
            const chartEmbed = new EmbedBuilder()
                .setTitle(`${itemSelected} Stone Costs`)
                .setDescription(`All stats, levels and costs for ${itemSelected}.`)
                .setColor('#00cc99')
                .setImage(`attachment://${uwKey}-stone-costs.png`)
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Enemies > Elites > Elite Spawn Chance
        if (categorySelected === 'Enemies' && subcategorySelected === 'Elites' && itemSelected === 'Elite Spawn Chance') {
            const chartBuffer = await chartFunctions.eliteSpawnChanceChart.generateEliteSpawnChanceChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'elite-spawn-chance.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Elite Enemy Spawn Chance Increase Per Wave and Tier')
                .setDescription('Shows what waves single/double elite spawn chance values change per-tier.\n\nCredit: <@501483167899975681>, with help from <@719821125520982077>') // Credit: Larechar, skye
                .setColor('#e86e1c')
                .setImage('attachment://elite-spawn-chance.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }
        // Special case: Masteries > Wave Accelerator > Spawn Rates
        if (categorySelected === 'Masteries' && subcategorySelected === 'Wave Accelerator' && itemSelected === 'Spawn Rates') {
            const chartBuffer = await chartFunctions.waveAcceleratorSpawnRatesChart.generateWaveAcceleratorSpawnRatesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'wave-accelerator-spawn-rates.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Wave Accelerator Mastery: Spawn Rates')
                .setDescription('Spawn count for each normal value and spawn rate reduction.\n\nCredit: Unknown, if use "Report Issues" to claim your work')
                .setColor('#00cc99')
                .setImage('attachment://wave-accelerator-spawn-rates.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }


        // Special case: Masteries > Recovery Package Chance (Care Package) > Drop Rates
        if (categorySelected === 'Masteries' && subcategorySelected === 'Recovery Package Chance (Care Package)' && itemSelected === 'Drop Rates') {
            const chartBuffer = await chartFunctions.recoveryPackageDropRatesChart.generateRecoveryPackageDropRatesChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'recovery-package-drop-rates.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('Recovery Package Chance Mastery: Drop Rates')
                .setDescription('Shards per day for each Shatter Lab and RPC+ mastery level, for 15,000 and 10,000 waves.\n\nCredit: Unknown, if use "Report Issues" to claim your work') 
                .setColor('#00cc99')
                .setImage('attachment://recovery-package-drop-rates.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Special case: Modules > Blackhole Digester (BHD) > Wave Skip Coin Boost
        if (categorySelected === 'Modules' && subcategorySelected === 'Blackhole Digester (BHD)' && itemSelected === 'Wave Skip Coin Boost') {
            const chartBuffer = await chartFunctions.waveSkipCoinBoostChart.generateWaveSkipCoinBoostChart();
            const attachment = new AttachmentBuilder(chartBuffer, { name: 'wave-skip-coin-boost.png' });
            const chartEmbed = new EmbedBuilder()
                .setTitle('BHD Coin Boost Chart')
                .setDescription('Average expected CPK increase from BHD based on Wave Skip mastery and Free-up chance.\n\nCredit: <@510962513211293696>') // Credit Yugiohcd10
                .setColor('#00cc99')
                .setImage('attachment://wave-skip-coin-boost.png')
                .setFooter({ text: `${categorySelected} > ${subcategorySelected} > ${itemSelected}` });
            await interaction.editReply({
                content: null,
                embeds: [chartEmbed],
                files: [attachment],
                components: componentRows
            });
            return;
        }

        // Default: show error for missing chart
        await interaction.editReply({
            content: 'Chart data not found. Please try another selection.',
            embeds: [],
            components: componentRows,
            files: []
        });
        return;
    } catch (error) {
        console.error('Error generating chart:', error);
        await interaction.editReply({
            content: 'There was an error generating your chart. Please try again later.',
            embeds: [],
            components: componentRows || [],
            files: []
        });
    }
}

async function generateChartCanvas(chartInfo, category, subcategory, item) {
    try {
        const { data, type, options } = chartInfo;

        // Default chart dimensions
        const width = options?.width || 800;
        const rowHeight = options?.cellHeight || 40; // Ensure sufficient row height
        const headerHeight = rowHeight; // Header height is larger than row height
        const margin = options?.margin || 40;
        const height = margin + headerHeight + rowHeight * data.length + margin; // Add bottom margin

        // Create canvas
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Set background
        ctx.fillStyle = options?.backgroundColor || '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Draw table chart
        if (type === 'table') {
            await drawTableChart(ctx, data, options, width, height);
        } else {
            throw new Error('Unsupported chart type');
        }

        // Convert canvas to buffer
        const buffer = canvas.toBuffer('image/png');

        // Use sharp to trim whitespace and add padding
        const trimmedBuffer = await sharp(buffer)
            .trim()
            .extend({
                top: 10, // Add 30px padding to the top
                bottom: 5, // Add 30px padding to the bottom
                left: 5, // Add 20px padding to the left
                right: 5, // Add 20px padding to the right
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
            })
            .toBuffer();

        return trimmedBuffer;
    } catch (error) {
        console.error('Error generating chart canvas:', error);

        // Generate an error image instead
        const errorCanvas = createCanvas(800, 300);
        const ctx = errorCanvas.getContext('2d');
        ctx.fillStyle = '#ffeeee';
        ctx.fillRect(0, 0, 800, 300);
        ctx.fillStyle = '#990000';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error generating chart', 400, 100);
        ctx.font = '16px Arial';
        ctx.fillText('Please report this issue to the bot administrator', 400, 150);
        return errorCanvas.toBuffer('image/png');
    }
}


function drawErrorMessage(ctx, width, height) {
    try {
        // Clear canvas
        ctx.fillStyle = '#ffeeee';
        ctx.fillRect(0, 0, width, height);
        
        // Draw error message
        ctx.fillStyle = '#990000';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Error rendering chart', width / 2, height / 2 - 20);
        ctx.font = '16px Arial';
        ctx.fillText('Please check console for details', width / 2, height / 2 + 20);
    } catch (error) {
        console.error('Error drawing error message:', error);
    }
}

// Safety functions for error handling

async function safeReply(interaction, content) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, ephemeral: true });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    } catch (error) {
        console.error('Failed to send reply:', error);
    }
}

async function safeFollowUp(interaction, content) {
    try {
        await interaction.followUp({ content, ephemeral: true });
    } catch (error) {
        console.error('Failed to send follow-up:', error);
    }
}
