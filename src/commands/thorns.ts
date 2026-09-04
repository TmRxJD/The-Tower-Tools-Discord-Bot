import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { MAX_CAMPAIGN_TIER } from 'thetowersdk';
import type { CommandModule } from '../core/command-types';
import {
  buildThornsBaseChart,
  buildThornsWallChart,
  normalizeThornsSharedState,
  type ThornsSharedState,
  type TournamentTier,
} from '@tmrxjd/platform/tools';
import { getBotConfig } from '../config/bot-config';
import { brandCommandEmbed } from '../services/command-embed-branding';
import { appendShareButtonRow, shareCurrentRender } from '../services/command-share';
import { renderTableChartPng } from '../services/table-chart-render';
import { getUserCommandSharedState, reconcileUserCommandSharedState, saveUserCommandSharedState } from '../services/user-command-shared-state';
import { resolveUserStorageState } from '../services/user-storage-resolution';
import { runCloudReconcileUi } from '../services/cloud-reconcile-ui';
import { showModalAndAwaitSubmit } from '../services/modal-submit';
import type { ToolsBotClient } from '../core/tools-bot-client';

const botConfig = getBotConfig();
const thornsConfig = botConfig.commands.thorns;
const THORNS_SHARE_BUTTON_ID = 'thorns_share';

function formatTournamentLabel(value: string): string {
  const match = thornsConfig.tournamentChoices.find(choice => choice.value === value);
  return match?.name ?? value;
}

async function buildThornsAttachment(args: {
  summary: string;
  settings: string;
  headers: string[];
  rows: string[][];
  discordUserId: string;
}): Promise<AttachmentBuilder | null> {
  try {
    const image = await renderTableChartPng({
      title: 'Thorns Hit Table',
      headers: args.headers,
      rows: args.rows,
      descriptionLines: [args.summary],
    }, args.discordUserId);
    return new AttachmentBuilder(image, { name: 'thorns-table.png' });
  } catch {
    return null;
  }
}

const data = new SlashCommandBuilder()
  .setName(thornsConfig.name)
  .setDescription(thornsConfig.description)
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.baseThorns.name)
      .setDescription(thornsConfig.options.baseThorns.description)
      .setMinValue(0)
      .setMaxValue(600)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.tier.name)
      .setDescription(thornsConfig.options.tier.description)
      // cap sourced from the SDK so a raised max tier no longer needs a bot edit
      .setMinValue(1)
      .setMaxValue(MAX_CAMPAIGN_TIER)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.pcLevel.name)
      .setDescription(thornsConfig.options.pcLevel.description)
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.pcMasteryLevel.name)
      .setDescription(thornsConfig.options.pcMasteryLevel.description)
      .setMinValue(0)
      .setMaxValue(9)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.bcLabLevel.name)
      .setDescription(thornsConfig.options.bcLabLevel.description)
      .setMinValue(0)
      .setMaxValue(10)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.bcReductionLabLevel.name)
      .setDescription(thornsConfig.options.bcReductionLabLevel.description)
      .setMinValue(0)
      .setMaxValue(20)
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName(thornsConfig.options.pcReductionLabLevel.name)
      .setDescription(thornsConfig.options.pcReductionLabLevel.description)
      .setMinValue(0)
      .setMaxValue(20)
      .setRequired(false)
  )
  .addStringOption(option => {
    const builtOption = option
      .setName(thornsConfig.options.tournamentTier.name)
      .setDescription(thornsConfig.options.tournamentTier.description)
      .setRequired(false);

    for (const choice of thornsConfig.tournamentChoices) {
      builtOption.addChoices({ name: choice.name, value: choice.value });
    }

    return builtOption;
  })
  .addIntegerOption(option => {
    const builtOption = option
      .setName(thornsConfig.options.heatWave.name)
      .setDescription(thornsConfig.options.heatWave.description)
      .setRequired(false);

    for (const wave of thornsConfig.heatWaveChoices) {
      builtOption.addChoices({ name: wave.toString(), value: wave });
    }

    return builtOption;
  })
  .addBooleanOption(option =>
    option
      .setName(thornsConfig.options.sharpFortitude.name)
      .setDescription(thornsConfig.options.sharpFortitude.description)
      .setRequired(false)
  );

export const thornsCommand: CommandModule = {
  data: data.toJSON(),
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    // Acknowledge within Discord's 3s window BEFORE any cloud/storage reads.
    await interaction.deferReply({ ephemeral: true });

    const defaultState = normalizeThornsSharedState(null);
    const hasMeaningfulState = (candidate: ThornsSharedState): boolean => (
      JSON.stringify(candidate) !== JSON.stringify(defaultState)
    );
    const resolvedStorage = await resolveUserStorageState({
      discordUserId: interaction.user.id,
      load: (storageId) => getUserCommandSharedState(storageId, 'thorns', normalizeThornsSharedState),
      hasMeaningfulState,
    });

    const storageUserId = resolvedStorage.storageUserId;
    const persisted = resolvedStorage.state;

    let baseThorns = interaction.options.getInteger(thornsConfig.options.baseThorns.name) ?? persisted.baseThorns;
    let tier = interaction.options.getInteger(thornsConfig.options.tier.name) ?? persisted.tier;
    let pcLevel = interaction.options.getInteger(thornsConfig.options.pcLevel.name) ?? persisted.pcLevel;
    let pcMasteryLevel = interaction.options.getInteger(thornsConfig.options.pcMasteryLevel.name) ?? persisted.pcMasteryLevel;
    let bcLabLevel = interaction.options.getInteger(thornsConfig.options.bcLabLevel.name) ?? persisted.bcLabLevel;
    let bcReductionLabLevel = interaction.options.getInteger(thornsConfig.options.bcReductionLabLevel.name) ?? persisted.bcReductionLabLevel;
    let pcReductionLabLevel = interaction.options.getInteger(thornsConfig.options.pcReductionLabLevel.name) ?? persisted.pcReductionLabLevel;
    let tournamentTier = (interaction.options.getString(thornsConfig.options.tournamentTier.name) ?? persisted.tournamentTier) as TournamentTier;
    let heatWave = interaction.options.getInteger(thornsConfig.options.heatWave.name) ?? persisted.heatWave;
    let sharpFortitude = interaction.options.getBoolean(thornsConfig.options.sharpFortitude.name) ?? persisted.sharpFortitude;
    const shouldPersistInitialState = interaction.options.getInteger(thornsConfig.options.baseThorns.name) !== null
      || interaction.options.getInteger(thornsConfig.options.tier.name) !== null
      || interaction.options.getInteger(thornsConfig.options.pcLevel.name) !== null
      || interaction.options.getInteger(thornsConfig.options.pcMasteryLevel.name) !== null
      || interaction.options.getInteger(thornsConfig.options.bcLabLevel.name) !== null
      || interaction.options.getInteger(thornsConfig.options.bcReductionLabLevel.name) !== null
      || interaction.options.getInteger(thornsConfig.options.pcReductionLabLevel.name) !== null
      || interaction.options.getString(thornsConfig.options.tournamentTier.name) !== null
      || interaction.options.getInteger(thornsConfig.options.heatWave.name) !== null
      || interaction.options.getBoolean(thornsConfig.options.sharpFortitude.name) !== null;

    const persistState = async () => {
      await saveUserCommandSharedState(storageUserId, 'thorns', {
        baseThorns,
        tier,
        pcLevel,
        pcMasteryLevel,
        bcLabLevel,
        bcReductionLabLevel,
        pcReductionLabLevel,
        tournamentTier,
        heatWave,
        sharpFortitude,
      }, normalizeThornsSharedState);
    };

    const createRender = async (): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> => {
      const wallRows = buildThornsWallChart({
        baseThorns,
        tier,
        pcLevel,
        pcMasteryLevel,
        bcLabLevel,
        bcReductionLabLevel,
        pcReductionLabLevel,
        tournamentTier,
        heatWave,
        sharpFortitude,
      });

      const baseRows = buildThornsBaseChart({
        baseThorns,
        tier,
        pcLevel,
        pcMasteryLevel,
        bcLabLevel,
        bcReductionLabLevel,
        pcReductionLabLevel,
        tournamentTier,
        heatWave,
        sharpFortitude,
      });

      const summary = thornsConfig.ui.descriptionTemplate
        .replace('{baseThorns}', baseThorns.toString())
        .replace('{tier}', tier.toString())
        .replace('{pcLevel}', pcLevel.toString())
        .replace('{pcMasteryLevel}', pcMasteryLevel.toString())
        .replace('{bcLabLevel}', bcLabLevel.toString());

      const settings = thornsConfig.ui.settingsTemplate
        .replace('{bcReduction}', bcReductionLabLevel.toString())
        .replace('{pcReduction}', pcReductionLabLevel.toString())
        .replace('{tournament}', formatTournamentLabel(tournamentTier))
        .replace('{heatWave}', heatWave.toString())
        .replace('{sharpFortitude}', sharpFortitude ? 'ON' : 'OFF');

      const embed = brandCommandEmbed(new EmbedBuilder()
        .setTitle(thornsConfig.ui.title)
        .setDescription(summary)
        .addFields({ name: thornsConfig.ui.settingsFieldName, value: settings, inline: false })
        .setColor(thornsConfig.color), thornsConfig.name);

      const rowCount = Math.max(wallRows.length, baseRows.length);
      const chartRows: string[][] = [];
      for (let index = 0; index < rowCount; index += 1) {
        const wall = wallRows[index];
        const base = baseRows[index];
        chartRows.push([
          wall ? wall.wallThorns.toString() : '',
          wall ? wall.hitsToKillElite.toString() : '',
          wall ? wall.hitsToKillFleet.toString() : '',
          wall ? wall.hitsToKillElitePC.toString() : '',
          wall ? wall.hitsToKillBoss.toString() : '',
          wall ? wall.hitsToKillBossPC.toString() : '',
          base ? base.baseThornsVal.toString() : '',
          base ? base.hitsToKillElite.toString() : '',
          base ? base.hitsToKillFleet.toString() : '',
          base ? base.hitsToKillElitePC.toString() : '',
          base ? base.hitsToKillBoss.toString() : '',
          base ? base.hitsToKillBossPC.toString() : '',
        ]);
      }

      const attachment = await buildThornsAttachment({
        summary,
        settings,
        headers: ['WT', 'W Elite', 'W Fleet', 'W E+PC', 'W Boss', 'W B+PC', 'BT', 'B Elite', 'B Fleet', 'B E+PC', 'B Boss', 'B B+PC'],
        rows: chartRows,
        discordUserId: storageUserId,
      });

      if (!attachment) {
        return { embed, files: [] };
      }

      embed.setImage('attachment://thorns-table.png');
      return { embed, files: [attachment] };
    };

    const buildComponents = () => appendShareButtonRow([
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(thornsConfig.ids.setCore)
          .setLabel(thornsConfig.ui.setCoreLabel)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(thornsConfig.ids.setAdvanced)
          .setLabel(thornsConfig.ui.setAdvancedLabel)
          .setStyle(ButtonStyle.Secondary),
      ),
    ], THORNS_SHARE_BUTTON_ID);

    const initialRender = await createRender();
    await interaction.editReply({ embeds: [initialRender.embed], components: buildComponents(), files: initialRender.files });

    if (shouldPersistInitialState) {
      void persistState();
    }

    void (async () => {
      const reconcile = await reconcileUserCommandSharedState(storageUserId, 'thorns', normalizeThornsSharedState);
      await runCloudReconcileUi<ThornsSharedState>({
        interaction,
        promptKey: 'thorns-sync',
        userId: interaction.user.id,
        autoCloudEnabled: reconcile.autoCloudEnabled,
        direction: reconcile.direction,
        hasDifference: reconcile.hasDifference,
        cloudState: reconcile.cloudState,
        applyCloudToLocal: reconcile.applyCloudToLocal,
        applyLocalToCloud: reconcile.applyLocalToCloud,
        onCloudApplied: async (next) => {
          baseThorns = next.baseThorns;
          tier = next.tier;
          pcLevel = next.pcLevel;
          pcMasteryLevel = next.pcMasteryLevel;
          bcLabLevel = next.bcLabLevel;
          bcReductionLabLevel = next.bcReductionLabLevel;
          pcReductionLabLevel = next.pcReductionLabLevel;
          tournamentTier = next.tournamentTier;
          heatWave = next.heatWave;
          sharpFortitude = next.sharpFortitude;
          const updatedRender = await createRender();
          await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        },
      });
    })();

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) {
      return;
    }

    const collector = reply.createMessageComponentCollector({
      time: thornsConfig.behavior.collectorTimeoutMs,
      filter: i => i.user.id === interaction.user.id,
    });
    const client = interaction.client as ToolsBotClient;
    const scopedSessionId = `thorns:${interaction.id}`;
    client.scopedInteractionSessions.register({
      sessionId: scopedSessionId,
      ownerUserId: interaction.user.id,
      messageId: reply.id,
      modalCustomIds: [thornsConfig.ids.coreModal, thornsConfig.ids.advancedModal],
      ttlMs: thornsConfig.behavior.collectorTimeoutMs,
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.isButton() && componentInteraction.customId === THORNS_SHARE_BUTTON_ID) {
        await shareCurrentRender(componentInteraction, {
          commandName: thornsConfig.name,
          render: async () => {
            const rendered = await createRender();
            return { embeds: [rendered.embed], files: rendered.files };
          },
        });
        return;
      }

      if (!componentInteraction.isButton()) {
        await componentInteraction.reply({ content: thornsConfig.ui.notYourSession, ephemeral: true });
        return;
      }

      if (componentInteraction.customId === thornsConfig.ids.setCore) {
        const modal = new ModalBuilder()
          .setCustomId(thornsConfig.ids.coreModal)
          .setTitle(thornsConfig.ui.coreModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.baseThornsInput).setLabel(thornsConfig.ui.baseThornsLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(baseThorns)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.tierInput).setLabel(thornsConfig.ui.tierLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(tier)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.pcLevelInput).setLabel(thornsConfig.ui.pcLevelLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(pcLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.pcMasteryLevelInput).setLabel(thornsConfig.ui.pcMasteryLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(pcMasteryLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.bcLabLevelInput).setLabel(thornsConfig.ui.bcLabLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(bcLabLevel)),
            ),
          );

        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: thornsConfig.ids.coreModal,
          userId: interaction.user.id,
          timeoutMs: thornsConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const nextBase = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.baseThornsInput), 10);
        const nextTier = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.tierInput), 10);
        const nextPcLevel = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.pcLevelInput), 10);
        const nextPcMastery = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.pcMasteryLevelInput), 10);
        const nextBcLab = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.bcLabLevelInput), 10);

        if (
          !Number.isFinite(nextBase) || nextBase < 0 || nextBase > 600
          || !Number.isFinite(nextTier) || nextTier < 1 || nextTier > 21
          || !Number.isFinite(nextPcLevel) || nextPcLevel < 0 || nextPcLevel > 7
          || !Number.isFinite(nextPcMastery) || nextPcMastery < 0 || nextPcMastery > 9
          || !Number.isFinite(nextBcLab) || nextBcLab < 0 || nextBcLab > 10
        ) {
          await submitted.reply({ content: thornsConfig.ui.invalidInput, ephemeral: true });
          return;
        }

        baseThorns = nextBase;
        tier = nextTier;
        pcLevel = nextPcLevel;
        pcMasteryLevel = nextPcMastery;
        bcLabLevel = nextBcLab;
        await persistState();
        await submitted.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      } else if (componentInteraction.customId === thornsConfig.ids.setAdvanced) {
        const modal = new ModalBuilder()
          .setCustomId(thornsConfig.ids.advancedModal)
          .setTitle(thornsConfig.ui.advancedModalTitle)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.bcReductionInput).setLabel(thornsConfig.ui.bcReductionLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(bcReductionLabLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.pcReductionInput).setLabel(thornsConfig.ui.pcReductionLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(pcReductionLabLevel)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.tournamentInput).setLabel(thornsConfig.ui.tournamentLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(tournamentTier)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.heatWaveInput).setLabel(thornsConfig.ui.heatWaveLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(heatWave)),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId(thornsConfig.ids.sharpFortitudeInput).setLabel(thornsConfig.ui.sharpFortitudeLabel).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(sharpFortitude)),
            ),
          );
        const submitted = await showModalAndAwaitSubmit({
          componentInteraction,
          modal,
          baseCustomId: thornsConfig.ids.advancedModal,
          userId: interaction.user.id,
          timeoutMs: thornsConfig.behavior.modalSubmitTimeoutMs,
        });
        if (!submitted) {
          return;
        }

        const nextBcReduction = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.bcReductionInput), 10);
        const nextPcReduction = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.pcReductionInput), 10);
        const nextTournament = submitted.fields.getTextInputValue(thornsConfig.ids.tournamentInput).trim().toLowerCase();
        const nextHeatWave = Number.parseInt(submitted.fields.getTextInputValue(thornsConfig.ids.heatWaveInput), 10);
        const nextSharpFortitudeRaw = submitted.fields.getTextInputValue(thornsConfig.ids.sharpFortitudeInput).trim().toLowerCase();
        const nextSharpFortitude = nextSharpFortitudeRaw === 'true'
          ? true
          : nextSharpFortitudeRaw === 'false'
            ? false
            : null;
        const validTournamentChoices = new Set<string>(thornsConfig.tournamentChoices.map(choice => choice.value));

        if (
          !Number.isFinite(nextBcReduction) || nextBcReduction < 0 || nextBcReduction > 10
          || !Number.isFinite(nextPcReduction) || nextPcReduction < 0 || nextPcReduction > 10
          || !validTournamentChoices.has(nextTournament)
          || !Number.isFinite(nextHeatWave) || nextHeatWave < 0 || nextHeatWave > 1000
          || nextSharpFortitude === null
        ) {
          await submitted.reply({ content: thornsConfig.ui.invalidInput, ephemeral: true });
          return;
        }

        bcReductionLabLevel = nextBcReduction;
        pcReductionLabLevel = nextPcReduction;
        tournamentTier = nextTournament as TournamentTier;
        heatWave = nextHeatWave;
        sharpFortitude = nextSharpFortitude;
        await persistState();
        await submitted.deferUpdate();
        const updatedRender = await createRender();
        await interaction.editReply({ embeds: [updatedRender.embed], components: buildComponents(), files: updatedRender.files });
        return;
      }

      await componentInteraction.reply({ content: thornsConfig.ui.notYourSession, ephemeral: true });
    });

    collector.on('end', async () => {
      client.scopedInteractionSessions.unregister(scopedSessionId);
      await interaction.editReply({
        content: thornsConfig.ui.sessionTimedOut,
        embeds: [],
        components: [],
      }).catch(() => {});
    });
  },
};
