const { AttachmentBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const { formatNumberOutput } = require('./statFinderFunctions.js');

// Helper to format coin values consistently for both embed and chart
function formatCoinValue(val) {
    if (typeof val !== 'number' || isNaN(val)) return '-';
    let rounded = Math.ceil(val * 100) / 100;
    let formatted = formatNumberOutput(rounded);
    // Remove trailing zeros after decimal, e.g. 1.00K -> 1K, 1.20K -> 1.2K
    formatted = formatted.replace(/(\d+)(?:\.(\d{1,2}))?([a-zA-Z]+)/, (m, intPart, dec, suffix) => {
        let n = Number(intPart);
        let d = dec ? dec.replace(/0+$/, '') : '';
        return d ? `${n}.${d}${suffix}` : `${n}${suffix}`;
    });
    return formatted;
}
const { createCanvas } = require('canvas');

// Module coin costs per level (index 0 = level 1)
const MODULE_COIN_COSTS = [
0,10000,10000,10000,10000,25000,25000,25000,25000,25000,45000,45000,45000,45000,45000,60000,60000,60000,60000,60000,120000,120000,120000,120000,120000,180000,180000,180000,180000,180000,350000,350000,350000,350000,350000,500000,500000,500000,500000,500000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,3000000,3000000,3000000,3000000,3000000,3000000,3000000,3000000,3000000,3000000,25000000,25000000,25000000,25000000,25000000,25000000,25000000,25000000,25000000,25000000,100000000,100000000,100000000,100000000,100000000,100000000,100000000,100000000,100000000,100000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,350000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,8000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,32000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,500000000000,10000000000000,60000000000000,110000000000000,160000000000000,210000000000000,260000000000000,310000000000000,360000000000000,410000000000000,460000000000000,510000000000000,560000000000000,610000000000000,660000000000000,710000000000000,760000000000000,810000000000000,860000000000000,910000000000000,960000000000000,1.01E+15,1.06E+15,1.11E+15,1.16E+15,1.21E+15,1.26E+15,1.31E+15,1.36E+15,1.41E+15,1.46E+15,1.51E+15,1.56E+15,1.61E+15,1.66E+15,1.71E+15,1.76E+15,1.81E+15,1.86E+15,1.91E+15,1.96E+15,2.5E+15,3.75E+15,6.25E+15,1E+16,1.5E+16,2.125E+16,2.875E+16,3.75E+16,4.75E+16,5.875E+16,7.125E+16,8.5E+16,1E+17,1.1625E+17,1.3375E+17,1.525E+17,1.725E+17,1.9375E+17,2.1625E+17,2.4E+17,2.65E+17,2.9125E+17,3.1875E+17,3.475E+17,3.775E+17,4.0875E+17,4.4125E+17,4.75E+17,5.1E+17,5.4625E+17,5.8375E+17,6.225E+17,6.625E+17,7.0375E+17,7.4625E+17,7.9E+17,8.35E+17,8.8125E+17,9.2875E+17,9.775E+17,1E+18,1.5E+18,2.5E+18,4E+18,6E+18,8.5E+18,1.15E+19,1.5E+19,1.9E+19,2.35E+19,2.85E+19,3.4E+19,4E+19,4.65E+19,5.35E+19,6.1E+19,6.9E+19,7.75E+19,8.65E+19,9.6E+19,1.06E+20,1.165E+20,1.275E+20,1.39E+20,1.51E+20,1.635E+20,1.765E+20,1.9E+20,2.04E+20,2.185E+20,2.335E+20,2.49E+20,2.65E+20,2.815E+20,2.985E+20,3.16E+20,3.34E+20,3.525E+20,3.715E+20,3.91E+20,4.11E+20,4.135E+20,4.525E+20,4.74E+20,4.96E+20,5.185E+20,5.415E+20,5.65E+20,5.89E+20,6.135E+20,6.385E+20,6.64E+20,6.9E+20,7.165E+20,7.435E+20,7.71E+20,7.99E+20,8.275E+20,8.565E+20,8.86E+20
];

// Module shard costs per level (index 0 = level 1)
const MODULE_SHARD_COSTS = [
0,7,7,7,12,12,12,12,12,20,20,20,20,20,25,25,25,25,25,40,40,40,40,40,50,50,50,50,50,75,75,75,75,75,90,90,90,90,90,120,120,120,120,120,120,120,120,120,120,180,180,180,180,180,180,180,180,180,180,250,250,250,250,250,250,250,250,250,250,350,350,350,350,350,350,350,350,350,350,500,500,500,500,500,500,500,500,500,500,700,700,700,700,700,700,700,700,700,700,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1300,1300,1300,1300,1300,1300,1300,1300,1300,1300,1800,1800,1800,1800,1800,1800,1800,1800,1800,1800,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,4000,4000,4000,4000,4000,4000,4000,4000,4000,4000,5000,5125,5250,5375,5500,5625,5750,5875,6000,6125,6250,6375,6500,6625,6750,6875,7000,7125,7250,7375,7500,7625,7750,7875,8000,8125,8250,8375,8500,8625,8750,8875,9000,9125,9250,9375,9500,9625,9750,9875,10000,10250,10500,10750,11000,11250,11500,11750,12000,12250,12500,12750,13000,13250,13500,13750,14000,14250,14500,14750,15000,15250,15500,15750,16000,16250,16500,16750,17000,17250,17500,17750,18000,18250,18500,18750,19000,19250,19500,19750,20000,20500,21000,21500,22000,22500,23000,23500,24000,24500,25000,25500,26000,26500,27000,27500,28000,28500,29000,29500,30000,30500,31000,31500,32000,32500,33000,33500,34000,34500,35000,35500,36000,36500,37000,37500,38000,38500,39000,39500,40000,40500,41000,41500,42000,42500,43000,43500,44000,44500,45000,45500,46000,46500,47000,47500,48000,48500,49000,49500,50000
];

// --- Module stat calculation arrays (from provided table) ---
const MOD_BASE_STAT_ARRAY = [
    // [rarity, cannon, armor, generator, core]
    ['Common',      0.012, 0.012, 0.011, 0.040],
    ['Rare',        0.032, 0.032, 0.013, 0.060],
    ['Rare+',       0.052, 0.052, 0.016, 0.090],
    ['Epic',        0.072, 0.072, 0.019, 0.130],
    ['Epic+',       0.102, 0.102, 0.023, 0.160],
    ['Legendary',   0.132, 0.132, 0.026, 0.210],
    ['Legendary+',  0.162, 0.162, 0.029, 0.260],
    ['Mythic',      0.202, 0.202, 0.033, 0.310],
    ['Mythic+',     0.252, 0.252, 0.036, 0.360],
    ['Ancestral',   0.302, 0.302, 0.041, 0.410],
    ['Ancestral 1★',0.314, 0.314, 0.043, 0.420],
    ['Ancestral 2★',0.326, 0.326, 0.045, 0.434],
    ['Ancestral 3★',0.338, 0.338, 0.046, 0.446],
    ['Ancestral 4★',0.350, 0.350, 0.048, 0.476],
    ['Ancestral 5★',0.362, 0.362, 0.049, 0.492],
];

const MOD_STEPS_INCREASE = [1, 20, 30, 40, 60, 80, 100, 120, 140, 160];
const MOD_STEPS_INCREASE_NEXT = [20, 30, 40, 60, 80, 100, 120, 140, 160, 300];
const MOD_CANNON_INCREASE_ARRAY =   [0.002, 0.004, 0.006, 0.008, 0.012, 0.030, 0.070, 0.100, 0.120, 0.200, 0.200];
const MOD_ARMOR_INCREASE_ARRAY =    [0.002, 0.004, 0.006, 0.008, 0.012, 0.030, 0.070, 0.100, 0.120, 0.200, 0.200];
const MOD_GENERATOR_INCREASE_ARRAY =[0.001, 0.001, 0.001, 0.003, 0.003, 0.004, 0.007, 0.010, 0.010, 0.010, 0.010];
const MOD_CORE_INCREASE_ARRAY =     [0.010, 0.015, 0.020, 0.025, 0.030, 0.050, 0.080, 0.120, 0.150, 0.200, 0.250];

function getBaseStat(rarity, type) {
    // type: 'cannon', 'armor', 'generator', 'core'
    const idx = { cannon: 1, armor: 2, generator: 3, core: 4 };
    const row = MOD_BASE_STAT_ARRAY.find(r => r[0].toLowerCase() === rarity.toLowerCase());
    if (!row) return 0;
    return row[idx[type]];
}

function getIncreaseArray(type) {
    switch (type) {
        case 'cannon': return MOD_CANNON_INCREASE_ARRAY;
        case 'armor': return MOD_ARMOR_INCREASE_ARRAY;
        case 'generator': return MOD_GENERATOR_INCREASE_ARRAY;
        case 'core': return MOD_CORE_INCREASE_ARRAY;
        default: return MOD_CANNON_INCREASE_ARRAY;
    }
}

function getAncestralStarMultiplier(rarity) {
    // Simplified: 1 + N*0.04 if Ancestral N★, else 1
    const match = /Ancestral (\d)★/.exec(rarity);
    return 1 + (match ? parseInt(match[1], 10) * 0.04 : 0);
}


function calculateCannonStat(rarity, level) {
    // Implements the formula:
    // =ROUND((VLOOKUP(SPLIT(rarity, " "),MOD_BASE_STAT_ARRAY,2,false)+SUMPRODUCT(IF(level>MOD_STEPS_INCREASE_NEXT,MOD_STEPS_INCREASE_NEXT-MOD_STEPS_INCREASE,IF(level<MOD_STEPS_INCREASE, 0, level-MOD_STEPS_INCREASE)), MOD_CANNON_INCREASE_ARRAY))*IF(RIGHT(rarity, 1) = "*", 1 + MID(rarity, 11, 1) * 0.04, 1)+1, 3)
    // Always map rarity value to label for correct lookup and multiplier
    let rarityLabel = rarity;
    if (typeof rarity === 'string') {
        const found = MODULE_RARITIES.find(r => r.value === rarity || r.label === rarity);
        if (found) rarityLabel = found.label;
    }
    const base = getBaseStat(rarityLabel, 'cannon');
    let sum = 0;
    const debugRanges = [];
    for (let i = 0; i < MOD_STEPS_INCREASE.length; ++i) {
        const start = MOD_STEPS_INCREASE[i];
        const end = MOD_STEPS_INCREASE_NEXT[i];
        let range = 0;
        if (level > end) {
            range = end - start;
        } else if (level < start) {
            range = 0;
        } else {
            range = level - start;
        }
        debugRanges.push({i, start, end, range, increase: MOD_CANNON_INCREASE_ARRAY[i], contrib: range * MOD_CANNON_INCREASE_ARRAY[i]});
        sum += range * MOD_CANNON_INCREASE_ARRAY[i];
    }
    const starMult = getAncestralStarMultiplier(rarityLabel);
    // Apply star multiplier only to the sum, not the base
    const stat = base + (sum * starMult) + 1;
    const result = Number(stat.toFixed(3));
    // (Stat calculation debug removed)
    return result;
}

function calculateArmorStat(rarity, level) {
    // Implements the formula:
    // =ROUND((VLOOKUP(SPLIT(rarity, " "),MOD_BASE_STAT_ARRAY,3,false)+SUMPRODUCT(IF(level>MOD_STEPS_INCREASE_NEXT,MOD_STEPS_INCREASE_NEXT-MOD_STEPS_INCREASE,IF(level<MOD_STEPS_INCREASE, 0, level-MOD_STEPS_INCREASE)), MOD_ARMOR_INCREASE_ARRAY))*IF(RIGHT(rarity, 1) = "*", 1 + MID(rarity, 11, 1) * 0.04, 1)+1, 3)
    let rarityLabel = rarity;
    if (typeof rarity === 'string') {
        const found = MODULE_RARITIES.find(r => r.value === rarity || r.label === rarity);
        if (found) rarityLabel = found.label;
    }
    const base = getBaseStat(rarityLabel, 'armor');
    let sum = 0;
    for (let i = 0; i < MOD_STEPS_INCREASE.length; ++i) {
        const start = MOD_STEPS_INCREASE[i];
        const end = MOD_STEPS_INCREASE_NEXT[i];
        let range = 0;
        if (level > end) {
            range = end - start;
        } else if (level < start) {
            range = 0;
        } else {
            range = level - start;
        }
        sum += range * MOD_ARMOR_INCREASE_ARRAY[i];
    }
    const starMult = getAncestralStarMultiplier(rarityLabel);
    const stat = base + (sum * starMult) + 1;
    const result = Number(stat.toFixed(3));
    return result;
}

function calculateGeneratorStat(rarity, level) {
    // Implements the formula:
    // =ROUND((VLOOKUP(SPLIT(rarity, " "),MOD_BASE_STAT_ARRAY,4,false)+SUMPRODUCT(IF(level>MOD_STEPS_INCREASE_NEXT,MOD_STEPS_INCREASE_NEXT-MOD_STEPS_INCREASE,IF(level<MOD_STEPS_INCREASE, 0, level-MOD_STEPS_INCREASE)), MOD_GENERATOR_INCREASE_ARRAY))*IF(RIGHT(rarity, 1) = "*", 1 + MID(rarity, 11, 1) * 0.04, 1)+1, 3)
    let rarityLabel = rarity;
    if (typeof rarity === 'string') {
        const found = MODULE_RARITIES.find(r => r.value === rarity || r.label === rarity);
        if (found) rarityLabel = found.label;
    }
    const base = getBaseStat(rarityLabel, 'generator');
    let sum = 0;
    for (let i = 0; i < MOD_STEPS_INCREASE.length; ++i) {
        const start = MOD_STEPS_INCREASE[i];
        const end = MOD_STEPS_INCREASE_NEXT[i];
        let range = 0;
        if (level > end) {
            range = end - start;
        } else if (level < start) {
            range = 0;
        } else {
            range = level - start;
        }
        sum += range * MOD_GENERATOR_INCREASE_ARRAY[i];
    }
    const starMult = getAncestralStarMultiplier(rarityLabel);
    const stat = base + (sum * starMult) + 1;
    const result = Number(stat.toFixed(3));
    return result;
}

function calculateCoreStat(rarity, level) {
    // Implements the formula:
    // =ROUND((VLOOKUP(SPLIT(rarity, " "),MOD_BASE_STAT_ARRAY,5,false)+SUMPRODUCT(IF(level>MOD_STEPS_INCREASE_NEXT,MOD_STEPS_INCREASE_NEXT-MOD_STEPS_INCREASE,IF(level<MOD_STEPS_INCREASE, 0, level-MOD_STEPS_INCREASE)), MOD_CORE_INCREASE_ARRAY))*IF(RIGHT(rarity, 1) = "*", 1 + MID(rarity, 11, 1) * 0.04, 1)+1, 3)
    let rarityLabel = rarity;
    if (typeof rarity === 'string') {
        const found = MODULE_RARITIES.find(r => r.value === rarity || r.label === rarity);
        if (found) rarityLabel = found.label;
    }
    const base = getBaseStat(rarityLabel, 'core');
    let sum = 0;
    for (let i = 0; i < MOD_STEPS_INCREASE.length; ++i) {
        const start = MOD_STEPS_INCREASE[i];
        const end = MOD_STEPS_INCREASE_NEXT[i];
        let range = 0;
        if (level > end) {
            range = end - start;
        } else if (level < start) {
            range = 0;
        } else {
            range = level - start;
        }
        sum += range * MOD_CORE_INCREASE_ARRAY[i];
    }
    const starMult = getAncestralStarMultiplier(rarityLabel);
    const stat = base + (sum * starMult) + 1;
    const result = Number(stat.toFixed(3));
    return result;
}

function calculateModuleStat({ type, rarity, level }) {
    switch (type) {
        case 'cannon':
            return calculateCannonStat(rarity, level);
        case 'armor':
            return calculateArmorStat(rarity, level);
        case 'generator':
            return calculateGeneratorStat(rarity, level);
        case 'core':
            return calculateCoreStat(rarity, level);
        default:
            return calculateCannonStat(rarity, level);
    }
}


// Module types and rarities
const MODULE_TYPES = [
    { label: 'Cannon', value: 'cannon' },
    { label: 'Defense', value: 'defense' },
    { label: 'Generator', value: 'generator' },
    { label: 'Core', value: 'core' }
];

const MODULE_RARITIES = [
    { label: 'Common', value: 'common' },
    { label: 'Rare', value: 'rare' },
    { label: 'Rare+', value: 'rare_plus' },
    { label: 'Epic', value: 'epic' },
    { label: 'Epic+', value: 'epic_plus' },
    { label: 'Legendary', value: 'legendary' },
    { label: 'Legendary+', value: 'legendary_plus' },
    { label: 'Mythic', value: 'mythic' },
    { label: 'Mythic+', value: 'mythic_plus' },
    { label: 'Ancestral', value: 'ancestral' },
    { label: 'Ancestral 1★', value: 'ancestral_1' },
    { label: 'Ancestral 2★', value: 'ancestral_2' },
    { label: 'Ancestral 3★', value: 'ancestral_3' },
    { label: 'Ancestral 4★', value: 'ancestral_4' },
    { label: 'Ancestral 5★', value: 'ancestral_5' }
];

// Default user settings for the modal
function getDefaultModuleSettings() {
    return {
        currentLevel: 1,
        targetLevel: 10,
        coinDiscount: 0,
        shardDiscount: 0,
        shardsPerWeek: 0
    };
}

// Modal input configuration (no shards per week)
const MODULE_MODAL_INPUTS = [
    { id: 'current_level', label: 'Current Level', style: TextInputStyle.Short, required: true },
    { id: 'target_level', label: 'Target Level', style: TextInputStyle.Short, required: true },
    { id: 'coin_discount', label: 'Coin Discount (0-30%)', style: TextInputStyle.Short, required: true },
    { id: 'shard_discount', label: 'Shard Discount (0-30%)', style: TextInputStyle.Short, required: true }
];

function createModuleModal(settings = {}) {
    // Always prefill with default stats if not provided
    const merged = { ...getDefaultModuleSettings(), ...settings };
    // Map snake_case input IDs to camelCase property names
    const idMap = {
        current_level: 'currentLevel',
        target_level: 'targetLevel',
        coin_discount: 'coinDiscount',
        shard_discount: 'shardDiscount'
    };
    const modal = new ModalBuilder()
        .setCustomId('module_settings_modal')
        .setTitle('Module Upgrade Settings');
    const inputs = MODULE_MODAL_INPUTS.map(input => {
        const prop = idMap[input.id] || input.id;
        const value = merged[prop] !== undefined ? String(merged[prop]) : String(getDefaultModuleSettings()[prop]);
        const textInput = new TextInputBuilder()
            .setCustomId(input.id)
            .setLabel(input.label)
            .setStyle(input.style)
            .setRequired(input.required)
            .setValue(value);
        return new ActionRowBuilder().addComponents(textInput);
    });
    modal.addComponents(...inputs);
    return modal;
}

// Placeholder cost calculation functions
function calculateCoinCost({ fromLevel, toLevel, coinDiscount }) {
    // fromLevel and toLevel are inclusive start, exclusive end (e.g., 1 to 10 means levels 2-10)
    // Always use the MODULE_COIN_COSTS array for all levels
    const start = Math.max(1, fromLevel + 1);
    let total = 0;
    for (let lvl = start; lvl <= toLevel; lvl++) {
        const idx = lvl - 1;
        if (MODULE_COIN_COSTS[idx] !== undefined) {
            total += MODULE_COIN_COSTS[idx];
        }
    }
    // Apply coin discount (percentage)
    total = total * (1 - 0.01 * (coinDiscount || 0));
    return total;
}
function calculateShardCost({ type, rarity, fromLevel, toLevel, shardDiscount }) {
    // Use MODULE_SHARD_COSTS array for per-level shard cost
    let total = 0;
    const start = Math.max(1, fromLevel + 1); // next level after current
    for (let lvl = start; lvl <= toLevel; lvl++) {
        const idx = lvl - 2;
        if (MODULE_SHARD_COSTS[idx] !== undefined) {
            total += MODULE_SHARD_COSTS[idx];
        }
    }
    // Apply shard discount (percentage)
    total = total * (1 - 0.01 * (shardDiscount || 0));
    return total;
}



function buildModuleEmbed({ moduleType, rarity, settings, chartImageUrl }) {
    const embed = new EmbedBuilder()
        .setTitle('Module Upgrade Calculator')
        .setColor(0x2196F3)
        .setDescription('Configure your module upgrade parameters below.');
    if (settings) {
        let currentStat = '', targetStat = '';
        if (moduleType && rarity && settings.currentLevel) {
            let typeValue = moduleType.toLowerCase();
            if (typeValue === 'defense') typeValue = 'armor';
            let rarityLabel = rarity;
            const foundRarity = MODULE_RARITIES.find(r => r.label === rarity || r.value === rarity);
            if (foundRarity) rarityLabel = foundRarity.label;
            const statVal = calculateModuleStat({ type: typeValue, rarity: rarityLabel, level: settings.currentLevel });
            currentStat = statVal === 0 ? '' : (Math.round(statVal * 100) / 100).toString();
            if (currentStat.endsWith('.00')) currentStat = currentStat.slice(0, -3);
            else if (currentStat.endsWith('0')) currentStat = currentStat.slice(0, -1);
            if (settings.targetLevel) {
                const tStatVal = calculateModuleStat({ type: typeValue, rarity: rarityLabel, level: settings.targetLevel });
                targetStat = tStatVal === 0 ? '' : (Math.round(tStatVal * 100) / 100).toString();
                if (targetStat.endsWith('.00')) targetStat = targetStat.slice(0, -3);
                else if (targetStat.endsWith('0')) targetStat = targetStat.slice(0, -1);
            }
        }
        embed.addFields(
            { name: 'Current Level', value: settings.currentLevel + (currentStat ? ` (${currentStat}x)` : ''), inline: true },
            { name: 'Coins Discount', value: String(settings.coinDiscount) + '%', inline: true },
            { name: 'Shards Discount', value: String(settings.shardDiscount) + '%', inline: true }
        );
        let coinCost = '-', shardCost = '-';
        if (moduleType && rarity && settings.targetLevel && settings.currentLevel < settings.targetLevel) {
            let typeValue = moduleType.toLowerCase();
            if (typeValue === 'defense') typeValue = 'armor';
            let rarityLabel = rarity;
            const foundRarity = MODULE_RARITIES.find(r => r.label === rarity || r.value === rarity);
            if (foundRarity) rarityLabel = foundRarity.label;
            coinCost = calculateCoinCost({ type: typeValue, rarity: rarityLabel, fromLevel: settings.currentLevel, toLevel: settings.targetLevel, coinDiscount: settings.coinDiscount });
            shardCost = calculateShardCost({ type: typeValue, rarity: rarityLabel, fromLevel: settings.currentLevel, toLevel: settings.targetLevel, shardDiscount: settings.shardDiscount });
        }
        let formattedCoinCost = '-';
        let formattedShardCost = '-';
        if (coinCost !== '-') {
            formattedCoinCost = formatCoinValue(coinCost);
        }
        if (shardCost !== '-') {
            // Always round up and show as integer, with commas for readability
            formattedShardCost = Number.isFinite(shardCost) ? Math.ceil(shardCost).toLocaleString() : shardCost;
        }
        embed.addFields(
            { name: 'Target Level', value: settings.targetLevel + (targetStat ? ` (${targetStat}x)` : ''), inline: true },
            { name: 'Total Shards', value: formattedShardCost, inline: true },
            { name: 'Total Coins', value: formattedCoinCost, inline: true }
        );
    }
    if (chartImageUrl) {
        embed.setImage(chartImageUrl);
    }
    embed.setFooter({ text: 'Your settings will be saved between uses.' });
    return embed;
}

// Chart logic for module upgrades (cumulative table)
function buildModuleUpgradeChart({ type, rarity, fromLevel, toLevel, coinDiscount, shardDiscount }) {
    let typeValue = type;
    if (typeValue === 'defense') typeValue = 'armor';
    let rarityLabel = rarity;
    const foundRarity = MODULE_RARITIES.find(r => r.label === rarity || r.value === rarity);
    if (foundRarity) rarityLabel = foundRarity.label;
    const chart = [];
    let cumulativeCoin = 0, cumulativeShard = 0;
    // Include the target level in the chart (fromLevel+1 to toLevel inclusive)
    for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
        let coin = calculateCoinCost({ type: typeValue, rarity: rarityLabel, fromLevel: lvl - 1, toLevel: lvl, coinDiscount });
        let shard = calculateShardCost({ type: typeValue, rarity: rarityLabel, fromLevel: lvl - 1, toLevel: lvl, shardDiscount });
        cumulativeCoin += coin;
        cumulativeShard += shard;
        let multiplier = 1;
        if (typeValue === 'armor' || typeValue === 'cannon' || typeValue === 'generator' || typeValue === 'core') {
            multiplier = calculateModuleStat({ type: typeValue, rarity: rarityLabel, level: lvl });
        }
        chart.push({
            level: lvl,
            coin,
            shard,
            cumulativeCoin,
            cumulativeShard,
            multiplier
        });
    }
    // Set true totals including the target level
    chart.totalCoin = cumulativeCoin;
    chart.totalShard = cumulativeShard;
    return chart;
}

// Chart image generation (table style, dark, similar to labCalc)
function generateModuleChartImage(chart, { fromLevel, toLevel, coinDiscount, shardDiscount, moduleType }) {
    // Columns: Level, Multiplier, Shards, Coins, Total Shards, Total Coins
    const columns = ['Level', 'Multiplier', 'Shards', 'Coins', 'Total Shards', 'Total Coins'];
    const rowHeight = 28;
    const ctxMeasure = createCanvas(1, 1).getContext('2d');
    ctxMeasure.font = 'bold 15px Arial';
    function num(val) {
        // Use the unified coin formatting helper
        return formatCoinValue(val);
    }
    function numShard(val) {
        // Always round up and show as integer, no notation
        return typeof val === 'number' && !isNaN(val) ? Math.ceil(val).toString() : '';
    }
    function numMult(val) {
        // Show multiplier to 3 decimal places, always as a number, and add 'x' suffix
        return typeof val === 'number' && !isNaN(val) ? val.toFixed(3) + 'x' : '';
    }
    function getMaxColWidth(colIdx) {
        let max = ctxMeasure.measureText(columns[colIdx]).width;
        for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
            const row = chart[rowIdx];
            let val = '';
            switch (colIdx) {
                case 0: val = row.level; break;
                case 1: val = numMult(row.multiplier); break;
                case 2: val = numShard(row.shard); break;
                case 3: val = num(row.coin); break;
                case 4: val = numShard(row.cumulativeShard); break;
                case 5: val = num(row.cumulativeCoin); break;
            }
            max = Math.max(max, ctxMeasure.measureText(String(val)).width);
        }
        return Math.ceil(max) + 18;
    }
    const colWidths = columns.map((_, idx) => getMaxColWidth(idx));
    const width = colWidths.reduce((a, b) => a + b, 0) + 1;
    const tableRows = chart.length + 1 + 1; // header + data + summary
    const settingsSectionHeight = 40;
    const titleHeight = 60; // increased for multiline title
    const height = tableRows * rowHeight + titleHeight + settingsSectionHeight + 20;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, width, height);
    // Title (multiline)
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    // --- FORCE MODULE TYPE LABEL AND SINGULAR TITLE ---
    let label = '';
    if (moduleType) {
        // Try to match by value first, then by label
        const found = MODULE_TYPES.find(t => t.value === String(moduleType).toLowerCase());
        if (found) {
            label = found.label;
        } else {
            // If not found by value, try by label (case-insensitive)
            const foundLabel = MODULE_TYPES.find(t => t.label.toLowerCase() === String(moduleType).toLowerCase());
            if (foundLabel) {
                label = foundLabel.label;
            } else {
                // Fallback: capitalize first letter
                label = String(moduleType).charAt(0).toUpperCase() + String(moduleType).slice(1);
            }
        }
    }
    let modTypeTitle = '';
    if (label && label.toLowerCase() !== 'module') {
        modTypeTitle = `${label} Module Upgrades`;
    } else {
        modTypeTitle = 'Module Upgrades';
    }
    ctx.fillText(modTypeTitle, width / 2, 32);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#b6fcd5';
    ctx.fillText(`Levels ${fromLevel + 1} - ${toLevel}`, width / 2, 54);
    // Table header
    let x = 0;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i < columns.length; i++) {
        ctx.fillStyle = '#1e3a2a';
        ctx.fillRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, titleHeight, colWidths[i], rowHeight);
        ctx.fillStyle = '#b6fcd5';
        ctx.fillText(columns[i], x + colWidths[i] / 2, titleHeight + 19);
        x += colWidths[i];
    }
    // Data rows
    ctx.font = '15px Arial';
    let cumulativeCoin = 0, cumulativeShard = 0;
    for (let rowIdx = 0; rowIdx < chart.length; rowIdx++) {
        let x = 0;
        const y = titleHeight + rowHeight * (rowIdx + 1);
        ctx.fillStyle = rowIdx % 2 === 0 ? '#23272f' : '#181a20';
        ctx.fillRect(0, y, width, rowHeight);
        const row = chart[rowIdx];
        const cells = [
            row.level,
            numMult(row.multiplier),
            numShard(row.shard),
            num(row.coin),
            numShard(row.cumulativeShard),
            num(row.cumulativeCoin)
        ];
        for (let i = 0; i < columns.length; i++) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, colWidths[i], rowHeight);
            ctx.fillStyle = '#e6e6e6';
            ctx.textAlign = 'center';
            ctx.fillText(String(cells[i]), x + colWidths[i] / 2, y + 19);
            x += colWidths[i];
        }
    }
    // Summary row
    let y = titleHeight + rowHeight * (chart.length + 1);
    ctx.fillStyle = '#234d2c';
    ctx.fillRect(0, y, width, rowHeight);
    ctx.font = 'bold 15px Arial';
    // Only show total shards and total coins in the summary row, leave other columns blank
    let totalCoin = typeof chart.totalCoin === 'number' ? chart.totalCoin : (chart.length > 0 ? chart[chart.length - 1].cumulativeCoin : 0);
    let totalShard = typeof chart.totalShard === 'number' ? chart.totalShard : (chart.length > 0 ? chart[chart.length - 1].cumulativeShard : 0);
    const summaryCells = [
        'Total', '', '', '', numShard(totalShard), num(totalCoin)
    ];
    x = 0;
    for (let i = 0; i < columns.length; i++) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, colWidths[i], rowHeight);
        ctx.fillStyle = '#b6fcd5';
        ctx.textAlign = 'center';
        ctx.fillText(String(summaryCells[i]), x + colWidths[i] / 2, y + 19);
        x += colWidths[i];
    }
    // Outer border
    ctx.strokeStyle = '#b6fcd5';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, titleHeight, width, rowHeight * (chart.length + 2));
    // User settings info section
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#b6fcd5';
    ctx.textAlign = 'center';
    let settingsY = titleHeight + rowHeight * (chart.length + 2) + 24;
    const footerText = `Shard Discount: ${shardDiscount}% | Coin Discount: ${coinDiscount}%`;
    ctx.fillText(footerText, width / 2, settingsY);
    return canvas.toBuffer();
}



// Persistent user settings DB (better-sqlite3)

const db = new Database(path.join(__dirname, 'moduleUserSettings.db'));
db.pragma('journal_mode = WAL');
db.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    currentLevel TEXT,
    targetLevel TEXT,
    coinDiscount INTEGER,
    shardDiscount INTEGER
)`).run();
// Migration: add lastRarityByType column if it doesn't exist
const pragma = db.prepare("PRAGMA table_info(user_settings)").all();
if (!pragma.some(col => col.name === 'lastRarityByType')) {
    db.prepare('ALTER TABLE user_settings ADD COLUMN lastRarityByType TEXT').run();
}
// Migration: convert currentLevel/targetLevel to TEXT if not already (for per-type storage)
if (pragma.some(col => col.name === 'currentLevel' && col.type !== 'TEXT')) {
    db.prepare('ALTER TABLE user_settings RENAME TO user_settings_old').run();
    db.prepare(`CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY,
        currentLevel TEXT,
        targetLevel TEXT,
        coinDiscount INTEGER,
        shardDiscount INTEGER,
        lastRarityByType TEXT
    )`).run();
    const oldRows = db.prepare('SELECT * FROM user_settings_old').all();
    for (const row of oldRows) {
        db.prepare('INSERT INTO user_settings (user_id, currentLevel, targetLevel, coinDiscount, shardDiscount, lastRarityByType) VALUES (?, ?, ?, ?, ?, ?)').run(
            row.user_id,
            JSON.stringify({}),
            JSON.stringify({}),
            row.coinDiscount,
            row.shardDiscount,
            row.lastRarityByType || '{}'
        );
    }
    db.prepare('DROP TABLE user_settings_old').run();
}


function getUserSettings(userId) {
    const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    if (row) {
        let lastRarityByType = {};
        let currentLevel = {};
        let targetLevel = {};
        try { currentLevel = row.currentLevel ? JSON.parse(row.currentLevel) : {}; } catch (e) { currentLevel = {}; }
        try { targetLevel = row.targetLevel ? JSON.parse(row.targetLevel) : {}; } catch (e) { targetLevel = {}; }
        if (row.lastRarityByType) {
            try {
                lastRarityByType = JSON.parse(row.lastRarityByType);
            } catch (e) {
                lastRarityByType = {};
            }
        }
        return {
            currentLevel,
            targetLevel,
            coinDiscount: row.coinDiscount,
            shardDiscount: row.shardDiscount,
            lastRarityByType
        };
    }
    // Add lastRarityByType for new users
    return { ...getDefaultModuleSettings(), lastRarityByType: {}, currentLevel: {}, targetLevel: {} };
}


function saveUserSettings(userId, settings) {
    db.prepare(`INSERT INTO user_settings (user_id, currentLevel, targetLevel, coinDiscount, shardDiscount, lastRarityByType)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            currentLevel=excluded.currentLevel,
            targetLevel=excluded.targetLevel,
            coinDiscount=excluded.coinDiscount,
            shardDiscount=excluded.shardDiscount,
            lastRarityByType=excluded.lastRarityByType
    `).run(
        userId,
        JSON.stringify(settings.currentLevel || {}),
        JSON.stringify(settings.targetLevel || {}),
        settings.coinDiscount,
        settings.shardDiscount,
        JSON.stringify(settings.lastRarityByType || {})
    );
}

// Store per-user session state (in-memory for ephemeral session)
const moduleSessionState = new Map();
let modalHandlerRegistered = false;

module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('module')
        .setDescription('Calculate the cost to upgrade a module.'),
    async execute(interaction) {
        // Per-user session
        const userId = interaction.user.id;
        let session = moduleSessionState.get(userId);
        if (!session) {
            // Load persistent settings from DB
            const userSettings = getUserSettings(userId);
            session = {
                moduleType: null,
                rarity: null,
                moduleSettings: userSettings,
                lastRarityByType: userSettings.lastRarityByType || {}
            };
            moduleSessionState.set(userId, session);
        } else if (!session.lastRarityByType) {
            session.lastRarityByType = {};
        }

        // Build type dropdown
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('module_type')
            .setPlaceholder('Select Module Type')
            .addOptions(MODULE_TYPES);


        // Initial reply (fix for ephemeral + collector)
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({
            embeds: [buildModuleEmbed({})],
            components: [
                new ActionRowBuilder().addComponents(typeMenu)
            ]
        });


        // Helper to update the ephemeral reply for a user
        async function updateReply(userId, interactionObj) {
            const session = moduleSessionState.get(userId);
            const components = [];
            // Always show type dropdown
            components.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('module_type')
                    .setPlaceholder('Select Module Type')
                    .addOptions(MODULE_TYPES.map(opt => ({ ...opt, default: opt.value === session.moduleType })))
            ));
            // Show rarity dropdown if type selected
            if (session.moduleType) {
                components.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('module_rarity')
                        .setPlaceholder('Select Rarity')
                        .addOptions(MODULE_RARITIES.map(opt => ({ ...opt, default: opt.value === session.rarity })))
                ));
            }
            // Show settings and modal button if both selected
            if (session.moduleType && session.rarity) {
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('module_settings')
                        .setLabel('Enter Settings')
                        .setStyle(ButtonStyle.Primary)
                ));
            }
            // Build settings for current type
            let settings = { ...session.moduleSettings };
            if (session.moduleType) {
                const type = session.moduleType;
                settings.currentLevel = (session.moduleSettings.currentLevel && session.moduleSettings.currentLevel[type]) || getDefaultModuleSettings().currentLevel;
                settings.targetLevel = (session.moduleSettings.targetLevel && session.moduleSettings.targetLevel[type]) || getDefaultModuleSettings().targetLevel;
            }
            // Always generate chart if both type and rarity are selected and valid range
            let chartAttachment = null;
            let chartImageUrl = null;
            if (session.moduleType && session.rarity && settings.currentLevel < settings.targetLevel) {
                // Always pass the canonical value (not label) for moduleType, and ensure it's the value, not the label
                const canonicalTypeObj = MODULE_TYPES.find(t => t.value === session.moduleType || t.label === session.moduleType);
                const canonicalType = canonicalTypeObj ? canonicalTypeObj.value : session.moduleType;
                const chartData = buildModuleUpgradeChart({
                    type: canonicalType,
                    rarity: session.rarity,
                    fromLevel: settings.currentLevel,
                    toLevel: settings.targetLevel,
                    coinDiscount: settings.coinDiscount,
                    shardDiscount: settings.shardDiscount
                });
                const buf = generateModuleChartImage(chartData, {
                    fromLevel: settings.currentLevel,
                    toLevel: settings.targetLevel,
                    coinDiscount: settings.coinDiscount,
                    shardDiscount: settings.shardDiscount,
                    moduleType: canonicalType
                });
                const fileName = `module_chart_${Date.now()}.png`;
                chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                chartImageUrl = `attachment://${fileName}`;
            }
            await interactionObj.editReply({
                embeds: [buildModuleEmbed({ moduleType: session.moduleType ? MODULE_TYPES.find(t => t.value === session.moduleType).label : null, rarity: session.rarity ? MODULE_RARITIES.find(r => r.value === session.rarity).label : null, settings, chartImageUrl })],
                components,
                files: chartAttachment ? [chartAttachment] : [],
                ephemeral: true
            });
        }

        // Register the global handler only once
        if (!modalHandlerRegistered) {
            interaction.client.on('interactionCreate', async int => {
                // Only handle select menus and buttons for this command
                if (!int.isStringSelectMenu() && !int.isButton() && !int.isModalSubmit()) return;
                const userId = int.user.id;
                let session = moduleSessionState.get(userId);
                if (!session) {
                    const userSettings = getUserSettings(userId);
                    session = {
                        moduleType: null,
                        rarity: null,
                        moduleSettings: userSettings,
                        lastRarityByType: userSettings.lastRarityByType || {}
                    };
                    moduleSessionState.set(userId, session);
                } else if (!session.lastRarityByType) {
                    session.lastRarityByType = {};
                }

                // Only allow the user who started the session
                if (int.isStringSelectMenu() || int.isButton()) {
                    // Only handle our customIds
                    if (!['module_type', 'module_rarity', 'module_settings'].includes(int.customId)) return;
                    // Only allow if the user has an active session
                    if (!session) return;
                    // Only allow if the interaction is on the ephemeral message
                    // (ephemeral messages can only be seen by the user, so this is safe)
                if (int.isStringSelectMenu()) {
                    let shouldSave = false;
                    if (int.customId === 'module_type') {
                        const newType = int.values[0];
                        if (session.moduleType !== newType) {
                            // Save last rarity for previous type
                            if (session.moduleType && session.rarity) {
                                session.lastRarityByType[session.moduleType] = session.rarity;
                            }
                            session.moduleType = newType;
                            // Restore last-used rarity for this type, or null if none
                            session.rarity = session.lastRarityByType[newType] || null;
                            shouldSave = true;
                        }
                    } else if (int.customId === 'module_rarity') {
                        session.rarity = int.values[0];
                        // Save this as last-used rarity for the current type
                        if (session.moduleType) {
                            session.lastRarityByType[session.moduleType] = session.rarity;
                            shouldSave = true;
                        }
                    }
                    // Save type/rarity selection immediately
                    if (shouldSave) {
                        saveUserSettings(userId, {
                            ...session.moduleSettings,
                            lastRarityByType: session.lastRarityByType
                        });
                    }
                    // Build settings for current type
                    let settings = { ...session.moduleSettings };
                    if (session.moduleType) {
                        const type = session.moduleType;
                        settings.currentLevel = (session.moduleSettings.currentLevel && session.moduleSettings.currentLevel[type]) || getDefaultModuleSettings().currentLevel;
                        settings.targetLevel = (session.moduleSettings.targetLevel && session.moduleSettings.targetLevel[type]) || getDefaultModuleSettings().targetLevel;
                    }
                    // Always generate chart if both type and rarity are selected and valid range
                    let chartAttachment = null;
                    let chartImageUrl = null;
                    if (session.moduleType && session.rarity && settings.currentLevel < settings.targetLevel) {
                        // Always pass the canonical value (not label) for moduleType, and ensure it's the value, not the label
                        const canonicalTypeObj = MODULE_TYPES.find(t => t.value === session.moduleType || t.label === session.moduleType);
                        const canonicalType = canonicalTypeObj ? canonicalTypeObj.value : session.moduleType;
                        const chartData = buildModuleUpgradeChart({
                            type: canonicalType,
                            rarity: session.rarity,
                            fromLevel: settings.currentLevel,
                            toLevel: settings.targetLevel,
                            coinDiscount: settings.coinDiscount,
                            shardDiscount: settings.shardDiscount
                        });
                        const buf = generateModuleChartImage(chartData, {
                            fromLevel: settings.currentLevel,
                            toLevel: settings.targetLevel,
                            coinDiscount: settings.coinDiscount,
                            shardDiscount: settings.shardDiscount,
                            moduleType: canonicalType
                        });
                        const fileName = `module_chart_${Date.now()}.png`;
                        chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                        chartImageUrl = `attachment://${fileName}`;
                    }
                    await int.update({
                        embeds: [buildModuleEmbed({ moduleType: session.moduleType ? MODULE_TYPES.find(t => t.value === session.moduleType).label : null, rarity: session.rarity ? MODULE_RARITIES.find(r => r.value === session.rarity).label : null, settings, chartImageUrl })],
                        components: (() => {
                            const components = [];
                            components.push(new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('module_type')
                                    .setPlaceholder('Select Module Type')
                                    .addOptions(MODULE_TYPES.map(opt => ({ ...opt, default: opt.value === session.moduleType })))
                            ));
                            if (session.moduleType) {
                                components.push(new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('module_rarity')
                                        .setPlaceholder('Select Rarity')
                                        .addOptions(MODULE_RARITIES.map(opt => ({ ...opt, default: opt.value === session.rarity })))
                                ));
                            }
                            if (session.moduleType && session.rarity) {
                                components.push(new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('module_settings')
                                        .setLabel('Enter Settings')
                                        .setStyle(ButtonStyle.Primary)
                                ));
                            }
                            return components;
                        })(),
                        files: chartAttachment ? [chartAttachment] : [],
                        ephemeral: true
                    });
                } else if (int.isButton() && int.customId === 'module_settings') {
                    // Show modal for settings
                    let settings = { ...session.moduleSettings };
                    if (session.moduleType) {
                        const type = session.moduleType;
                        settings.currentLevel = (session.moduleSettings.currentLevel && session.moduleSettings.currentLevel[type]) || getDefaultModuleSettings().currentLevel;
                        settings.targetLevel = (session.moduleSettings.targetLevel && session.moduleSettings.targetLevel[type]) || getDefaultModuleSettings().targetLevel;
                    }
                    const modal = createModuleModal(settings);
                    await int.showModal(modal);
                } else if (int.isButton() && int.customId === 'module_chart') {
                    // Generate and send chart image
                    let settings = { ...session.moduleSettings };
                    if (session.moduleType) {
                        const type = session.moduleType;
                        settings.currentLevel = (session.moduleSettings.currentLevel && session.moduleSettings.currentLevel[type]) || getDefaultModuleSettings().currentLevel;
                        settings.targetLevel = (session.moduleSettings.targetLevel && session.moduleSettings.targetLevel[type]) || getDefaultModuleSettings().targetLevel;
                    }
                    if (!session.moduleType || !session.rarity || !settings.currentLevel || !settings.targetLevel || settings.currentLevel >= settings.targetLevel) {
                        await int.reply({ content: 'Please select a module type, rarity, and valid level range first.', ephemeral: true });
                        return;
                    }
                    const chartData = buildModuleUpgradeChart({
                        type: session.moduleType,
                        rarity: session.rarity,
                        fromLevel: settings.currentLevel,
                        toLevel: settings.targetLevel,
                        coinDiscount: settings.coinDiscount,
                        shardDiscount: settings.shardDiscount,
                        moduleType: session.moduleType
                    });
                    const buf = generateModuleChartImage(chartData, {
                        fromLevel: settings.currentLevel,
                        toLevel: settings.targetLevel,
                        coinDiscount: settings.coinDiscount,
                        shardDiscount: settings.shardDiscount
                    });

                    const fileName = `module_chart_${Date.now()}.png`;
                    const attachment = new AttachmentBuilder(buf, { name: fileName });
                    await int.reply({
                        content: 'Module upgrade chart:',
                        files: [attachment],
                        ephemeral: true
                    });
                }
                } else if (int.isModalSubmit() && int.customId === 'module_settings_modal') {
                    // Save settings from modal
                    // Update only the current type's values
                    const type = session.moduleType;
                    let currentLevelObj = { ...(session.moduleSettings.currentLevel || {}) };
                    let targetLevelObj = { ...(session.moduleSettings.targetLevel || {}) };
                    currentLevelObj[type] = parseInt(int.fields.getTextInputValue('current_level')) || getDefaultModuleSettings().currentLevel;
                    targetLevelObj[type] = parseInt(int.fields.getTextInputValue('target_level')) || getDefaultModuleSettings().targetLevel;
                    session.moduleSettings = {
                        ...session.moduleSettings,
                        currentLevel: currentLevelObj,
                        targetLevel: targetLevelObj,
                        coinDiscount: parseInt(int.fields.getTextInputValue('coin_discount')) || 0,
                        shardDiscount: parseInt(int.fields.getTextInputValue('shard_discount')) || 0,
                        lastRarityByType: session.lastRarityByType
                    };
                    // Persist to DB (all settings, including per-type rarity)
                    saveUserSettings(userId, session.moduleSettings);
                    // Build settings for current type
                    let settings = { ...session.moduleSettings };
                    if (session.moduleType) {
                        settings.currentLevel = (session.moduleSettings.currentLevel && session.moduleSettings.currentLevel[type]) || getDefaultModuleSettings().currentLevel;
                        settings.targetLevel = (session.moduleSettings.targetLevel && session.moduleSettings.targetLevel[type]) || getDefaultModuleSettings().targetLevel;
                    }
                    // Always generate chart if both type and rarity are selected and valid range
                    let chartAttachment = null;
                    let chartImageUrl = null;
                    if (session.moduleType && session.rarity && settings.currentLevel < settings.targetLevel) {
                        // Always pass the canonical value (not label) for moduleType, and ensure it's the value, not the label
                        const canonicalTypeObj = MODULE_TYPES.find(t => t.value === session.moduleType || t.label === session.moduleType);
                        const canonicalType = canonicalTypeObj ? canonicalTypeObj.value : session.moduleType;
                        const chartData = buildModuleUpgradeChart({
                            type: canonicalType,
                            rarity: session.rarity,
                            fromLevel: settings.currentLevel,
                            toLevel: settings.targetLevel,
                            coinDiscount: settings.coinDiscount,
                            shardDiscount: settings.shardDiscount
                        });
                        const buf = generateModuleChartImage(chartData, {
                            fromLevel: settings.currentLevel,
                            toLevel: settings.targetLevel,
                            coinDiscount: settings.coinDiscount,
                            shardDiscount: settings.shardDiscount,
                            moduleType: canonicalType
                        });
                        const fileName = `module_chart_${Date.now()}.png`;
                        chartAttachment = new AttachmentBuilder(buf, { name: fileName });
                        chartImageUrl = `attachment://${fileName}`;
                    }
                    await int.update({
                        embeds: [buildModuleEmbed({ moduleType: session.moduleType ? MODULE_TYPES.find(t => t.value === session.moduleType).label : null, rarity: session.rarity ? MODULE_RARITIES.find(r => r.value === session.rarity).label : null, settings, chartImageUrl })],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('module_type')
                                    .setPlaceholder('Select Module Type')
                                    .addOptions(MODULE_TYPES.map(opt => ({ ...opt, default: opt.value === session.moduleType })))
                            ),
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('module_rarity')
                                    .setPlaceholder('Select Rarity')
                                    .addOptions(MODULE_RARITIES.map(opt => ({ ...opt, default: opt.value === session.rarity })))
                            ),
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('module_settings')
                                    .setLabel('Enter Settings')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ],
                        files: chartAttachment ? [chartAttachment] : [],
                        ephemeral: true
                    });
                }
            });
            modalHandlerRegistered = true;
        }
    }
};
