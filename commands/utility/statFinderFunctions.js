const NOTATIONS = {
    K: 1e3,
    M: 1e6,
    B: 1e9,
    T: 1e12,
    q: 1e15,
    Q: 1e18,
    s: 1e21,
    S: 1e24,
    O: 1e27,
    N: 1e30,
    D: 1e33,
    AA: 1e36,
    AB: 1e39,   
    AC: 1e42,
    AD: 1e45,
    AE: 1e48,
    AF: 1e51,
    AG: 1e54,
    AH: 1e57,
    AI: 1e60,   
    AJ: 1e63
};

const TOURNAMENT_MODS = {
    base: 9.3,
    scaling: 7.3,
    exp: 1.004
};

const VALID_TOURNAMENT_TIERS = [1, 3, 5, 8, 11, 14];

const TIER_MULTIPLIERS = {
    18: 5.07e16,
    17: 2.54e15,
    16: 1.27e14,
    15: 3.17e12,
    14: 1.76e10,
    13: 7.34e7,
    12: 2.45e5,
    11: 5.97e2,
    10: 1.46e1,
    9: 3.38,
    8: 1.93,
    7: 1.40,
    6: 1.17,
    5: 1.05,
    4: 1,
    3: 1,
    2: 1,
    1: 1
};

const TIER_EXPONENT_HP = {
    15: 0.51,
    14: 0.36,
    13: 0.22,
    12: 0.1,
    11: 0.01,
    default: 0
};

const TIER_EXPONENT_DMG = {
    15: 0.102,
    14: 0.073,
    13: 0.046,
    12: 0.02,
    11: 0.004,
    10: 0.002,
    default: 0
};

// New tier damage divisors
const TIER_DMG_DIVISORS = {
    15: 14375000,
    14: 287500,
    13: 5750,
    12: 115,
    11: 11.5,
    10: 2.3,
    default: 1
};

function calculateTierDiff(tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    
    if (tier === 1) return 1;

    const multiplier = TIER_MULTIPLIERS[tier];

    return (
        (1 + (tier - 1) * 15.5) *
        (Math.pow(1.43, tier - 2) + 0.2 * (tier - 1)) *
        multiplier *
        (isTournament ? TOURNAMENT_MODS.base : 1)
    );
}

function parseNumberInput(input) {
    if (typeof input === 'number') return input;
    
    const inputStr = String(input).trim();
    const match = inputStr.match(/^(\d+|\d*\.\d+)([KMBTqQsSOND]|A[A-J])$/);
    
    if (!match) {
        const number = parseFloat(inputStr);
        if (!isNaN(number)) return number;
        throw new Error('Invalid number format. Examples: 1234, 1.23K, 45.6M, 12.34B, 5q, 2.5Q');
    }

    const [_, numberPart, notation] = match;
    const number = parseFloat(numberPart);
    
    if (isNaN(number)) {
        throw new Error('Invalid number');
    }
    
    const multiplier = NOTATIONS[notation];
    if (!multiplier) {
        throw new Error(`Invalid notation: ${notation}. Valid notations are: ${Object.keys(NOTATIONS).join(', ')}`);
    }

    const result = number * multiplier;
    return result;
}

function formatNumberOutput(number, precision = 2) {
    if (number < 1000) return Math.round(number).toString();

    const notationEntries = Object.entries(NOTATIONS).reverse();
    
    for (const [notation, value] of notationEntries) {
        if (number >= value) {
            return (number / value).toFixed(precision) + notation;
        }
    }

    return number.toString();
}

function calculateWaveMultipliers(wave, isHP = false) {
    if (isHP) {
        const bonusSum = 
            0.04 * Math.floor(wave / 5) + 
            0.05 * Math.floor(wave / 10) + 
            0.06 * Math.floor(wave / 25) + 
            0.08 * Math.floor(wave / 50) + 
            0.1 * Math.floor(wave / 60) + 
            0.18 * Math.floor(wave / 72) + 
            0.2 * Math.floor(wave / 83) + 
            0.21 * Math.floor(wave / 94) + 
            0.12 * Math.floor(wave / 100) + 
            0.1 * Math.floor(wave / 107) +
            0.15 * Math.floor(wave / 200) + 
            0.35 * Math.floor(wave / 900);

        const powerProduct = 
            Math.pow(1.035, Math.floor(wave / 30)) * 
            Math.pow(1.02, Math.floor(wave / 60)) * 
            Math.pow(1.025, Math.floor(wave / 72)) * 
            Math.pow(1.03, Math.floor(wave / 83)) * 
            Math.pow(1.03, Math.floor(wave / 94)) * 
            Math.pow(1.02, Math.floor(wave / 100)) * 
            Math.pow(1.02, Math.floor(wave / 107)) * 
            Math.pow(1.11, Math.floor(wave / 139)) * 
            Math.pow(1.11, Math.floor(wave / 182)) * 
            Math.pow(1.03, Math.floor(wave / 200)) * 
            Math.pow(1.13, Math.floor(wave / 241)) * 
            Math.pow(1.13, Math.floor(wave / 332)) * 
            Math.pow(1.06, Math.floor(wave / 400)) * 
            Math.pow(1.15, Math.floor(wave / 900)) * 
            Math.pow(1.15, Math.floor(wave / 1024));

        return { bonusSum, powerProduct };
    } else {
        const bonusSum = 
            0.02 * Math.floor(wave / 5) + 
            0.025 * Math.floor(wave / 10) + 
            0.012 * Math.floor(wave / 25) + 
            0.017 * Math.floor(wave / 50) + 
            0.02 * Math.floor(wave / 100) + 
            0.025 * Math.floor(wave / 200) + 
            0.02 * Math.floor(wave / 900);

        let powerProduct = Math.pow(1.005, Math.floor(wave / 30));
        powerProduct *= Math.pow(1.01, Math.floor(wave / 72));
        powerProduct *= Math.pow(1.01, Math.floor(wave / 83));
        powerProduct *= Math.pow(1.01, Math.floor(wave / 94));
        powerProduct *= Math.pow(1.01, Math.floor(wave / 107));
        powerProduct *= Math.pow(1.02, Math.floor(wave / 200));
        powerProduct *= Math.pow(1.02, Math.floor(wave / 400));
        powerProduct *= Math.pow(1.035, Math.floor(wave / 900));
        powerProduct *= Math.pow(1.05, Math.floor(wave / 1024));

        const h = Math.floor(wave / 139);  // tier >= 7
        const m = Math.floor(wave / 182);  // tier >= 8
        const v = Math.floor(wave / 241);  // all tiers
        const g = Math.floor(wave / 332);  // all tiers

        return {
            bonusSum,
            powerProduct,
            getAdjustedProduct: (tier) => {
                let adjusted = powerProduct;
                if (tier >= 7) adjusted *= Math.pow(1.025, h);
                if (tier >= 8) adjusted *= Math.pow(1.025, m);
                adjusted *= Math.pow(1.03, v);
                adjusted *= Math.pow(1.03, g);
                return adjusted;
            }
        };
    }
}

function parseTier(tierInput) {
    const match = String(tierInput).match(/^(\d+)(\+)?$/);
    if (!match) {
        throw new Error('Invalid tier format');
    }

    const tier = parseInt(match[1]);
    const isTournament = match[2] === '+';

    if (isTournament && !VALID_TOURNAMENT_TIERS.includes(tier)) {
        throw new Error(`Invalid tournament tier. Valid tournament tiers are: ${VALID_TOURNAMENT_TIERS.map(t => t + '+').join(', ')}`);
    }

    if (!isTournament && (tier < 1 || tier > 18)) {
        throw new Error('Regular tier must be between 1 and 18');
    }

    return { tier, isTournament };
}

function calculateHPExponent(tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    const baseExponent = isTournament ? 2.308 : 2.13;
    const tierExponent = TIER_EXPONENT_HP[Math.min(tier, 15)] || TIER_EXPONENT_HP.default;    
    return baseExponent + tierExponent;
}

function calculateDMGExponent(tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    const baseExponent = isTournament ? 2.105 : 2.007;
    const tierExponent = TIER_EXPONENT_DMG[Math.min(tier, 15)] || TIER_EXPONENT_DMG.default;    
    return baseExponent + tierExponent;
}

function calculateNewDMG(tier) {
    let value = 1;
    if (tier >= 10) value *= 0.43478245;
    if (tier >= 11) value *= 0.2;
    if (tier >= 12) value *= 0.1;
    if (tier >= 13) value *= 0.02;
    if (tier >= 14) value *= 0.02;
    if (tier >= 15) value *= 0.02;
    return value;
}

function calculateEnemyHP(wave, tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    const { base: baseMod, scaling: scalingMod, exp: expMod } = 
        isTournament ? TOURNAMENT_MODS : { base: 1, scaling: 1, exp: 1 };

    const { bonusSum, powerProduct } = calculateWaveMultipliers(wave, true);
    const baseHP = (0.05 * baseMod * Math.pow(wave, calculateHPExponent({ tier, isTournament }))) +
                  (0.8 * scalingMod * wave) + 1.5;
    const waveMultiplier = (1 + bonusSum) * powerProduct;
    const tournamentMultiplier = isTournament ? 
        Math.pow(1.65, Math.floor(Math.max(1, wave - 1) / 100)) : 1;

    return baseHP * 
           waveMultiplier * 
           calculateTierDiff({ tier, isTournament }) * 
           Math.pow(expMod, wave) *
           tournamentMultiplier;
}

function calculateEnemyDMG(wave, tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    const { base: baseMod, scaling: scalingMod } = 
        isTournament ? TOURNAMENT_MODS : { base: 1, scaling: 1 };

    const baseExponent = isTournament ? 2.355 : 2.007;
    const tierExponent = TIER_EXPONENT_DMG[Math.min(tier, 15)] || TIER_EXPONENT_DMG.default;
    const totalExponent = baseExponent + tierExponent;

    let hundredPlusMulti = 1;
    if (isTournament) {
        const hundreds = Math.floor(Math.max(0, wave - 100) / 100);
        hundredPlusMulti = Math.pow(1.06, hundreds);
    }

    const baseDMG = (0.021 * baseMod * Math.pow(wave, totalExponent)) + 
                   (0.16 * scalingMod * wave) + 1.07;
    const { bonusSum, powerProduct } = calculateWaveMultipliers(wave);
    const tierDivisor = TIER_DMG_DIVISORS[Math.min(tier, 15)] || TIER_DMG_DIVISORS.default;
    const tierDamageMultiplier = tier < 4 ? 0.94 : (tier < 7 ? 0.9 : 0.86);

    return baseDMG * 
           (1 + bonusSum) * 
           powerProduct * 
           calculateTierDiff({ tier, isTournament }) * 
           hundredPlusMulti * 
           tierDamageMultiplier / 
           tierDivisor;
}

function enemyStatFinderWave(tierInput, wave, attackSkips, healthSkips) {
    try {
        const { tier, isTournament } = parseTier(tierInput);
        const parsedWave = parseNumberInput(wave);
        const parsedAttackSkips = parseNumberInput(attackSkips);
        const parsedHealthSkips = parseNumberInput(healthSkips);
        
        const actualWave = parsedWave - Math.max(parsedAttackSkips, parsedHealthSkips);
        if (actualWave <= 0) {
            return "Error: Skips exceed target wave";
        }

        const baseWaveHP = calculateEnemyHP(parsedWave - parsedHealthSkips, { tier, isTournament });
        const baseWaveDMG = calculateEnemyDMG(parsedWave - parsedAttackSkips, { tier, isTournament });
        const maxWaveHP = baseWaveHP * 1;
        const maxWaveDMG = baseWaveDMG * 1;
        
        return `> To reach Wave ${formatNumberOutput(parsedWave)} on Tier ${tier}${isTournament ? '+' : ''}\n` +
               `> EALS: ${formatNumberOutput(parsedAttackSkips)}\n` +
               `> EHLS: ${formatNumberOutput(parsedHealthSkips)}\n` +
               `Enemy HP: ${formatNumberOutput(maxWaveHP)}\n` +
               `Enemy DMG: ${formatNumberOutput(maxWaveDMG)}`; 
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

module.exports = {
    calculateEnemyHP,
    calculateEnemyDMG,
    parseTier,
    parseNumberInput,
    formatNumberOutput,
    calculateDMGExponent,
    calculateHPExponent,
    calculateWaveMultipliers,
};