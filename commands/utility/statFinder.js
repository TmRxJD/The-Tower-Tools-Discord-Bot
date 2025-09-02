/**
 * Tower Enemy Stat Finder Utility Functions
 * 
 * This module provides functions to calculate enemy stats in The Tower game
 * including health points (HP) and damage (DMG) based on tier, wave number,
 * and skip levels.
 */

/**
 * Notation multipliers for compact number representation
 * Maps suffix letters to their numerical multiplier values
 */
const NOTATIONS = {
    K: 1e3,    // Thousand
    M: 1e6,    // Million
    B: 1e9,    // Billion
    T: 1e12,   // Trillion
    q: 1e15,   // Quadrillion 
    Q: 1e18,   // Quintillion
    s: 1e21,   // Sextillion
    S: 1e24,   // Septillion
    O: 1e27,   // Octillion
    N: 1e30,   // Nonillion
    D: 1e33,   // Decillion
    AA: 1e36,  // Undecillion
    AB: 1e39,  // Duodecillion   
    AC: 1e42,  // Tredecillion
    AD: 1e45,  // Quattuordecillion
    AE: 1e48,  // Quindecillion
    AF: 1e51,  // Sexdecillion
    AG: 1e54,  // Septendecillion
    AH: 1e57,  // Octodecillion
    AI: 1e60,  // Novemdecillion   
    AJ: 1e63   // Vigintillion
};

/**
 * Tournament mode specific modifiers
 * These values adjust the difficulty scaling in tournament mode
 */
const TOURNAMENT_MODS = {
    base: 9.3,     // Base multiplier for tournament mode
    scaling: 7.3,   // Additional scaling factor
    exp: 1.004     // Exponential growth factor
};

/**
 * Valid tier numbers that can be played in tournament mode
 */
const VALID_TOURNAMENT_TIERS = [1, 3, 5, 8, 11, 14];

/**
 * Tier-specific multipliers that affect overall difficulty scaling
 * Higher tiers have exponentially larger multipliers
 */
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

/**
 * Additional exponent modifiers for HP calculations by tier
 * These values are added to the base exponent to calculate final HP
 */
const TIER_EXPONENT_HP = {
    15: 0.51,
    14: 0.36,
    13: 0.22,
    12: 0.1,
    11: 0.01,
    default: 0  // Default value for tiers not specified above
};

/**
 * Additional exponent modifiers for damage calculations by tier
 * These values are added to the base exponent to calculate final damage
 */
const TIER_EXPONENT_DMG = {
    15: 0.102,
    14: 0.073,
    13: 0.046,
    12: 0.02,
    11: 0.004,
    10: 0.002,
    default: 0  // Default value for tiers not specified above
};

/**
 * Divisor values for damage calculation by tier
 * Higher tiers have larger divisors to balance damage output
 */
const TIER_DMG_DIVISORS = {
    15: 14375000,
    14: 287500,
    13: 5750,
    12: 115,
    11: 11.5,
    10: 2.3,
    default: 1  // Default value for tiers not specified above
};

/**
 * Calculates the tier difficulty multiplier based on tier level
 * 
 * @param {string|object} tierInput - Tier level (e.g., "1", "5+") or parsed tier object
 * @returns {number} - The calculated tier multiplier
 */
function calculateTierDiff(tierInput) {
    // Parse tier input if it's a string, or use directly if it's already an object
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    
    // Tier 1 has no additional multiplier
    if (tier === 1) return 1;

    // Get the base tier multiplier from the constants
    const multiplier = TIER_MULTIPLIERS[tier];

    // Complex formula to calculate tier difficulty scaling
    return (
        (1 + (tier - 1) * 15.5) *                // Linear scaling component
        (Math.pow(1.43, tier - 2) + 0.2 * (tier - 1)) *  // Exponential scaling component
        multiplier *                             // Tier-specific multiplier
        (isTournament ? TOURNAMENT_MODS.base : 1) // Tournament modifier if applicable
    );
}

/**
 * Parses string number input with notations (e.g., "1.5K", "2.3M")
 * 
 * @param {string|number} input - Number input, possibly with notation suffix
 * @returns {number} - Parsed number value
 * @throws {Error} - If input format is invalid
 */
function parseNumberInput(input) {
    // If input is already a number, return it directly
    if (typeof input === 'number') return input;
    
    const inputStr = String(input).trim();
    // Match pattern: number part followed by optional notation suffix
    const match = inputStr.match(/^(\d+|\d*\.\d+)([KMBTqQsSOND]|A[A-J])$/);
    
    if (!match) {
        // Try parsing as a plain number if no notation is present
        const number = parseFloat(inputStr);
        if (!isNaN(number)) return number;
        throw new Error('Invalid number format. Examples: 1234, 1.23K, 45.6M, 12.34B, 5q, 2.5Q');
    }

    // Extract number part and notation from the match
    const [_, numberPart, notation] = match;
    const number = parseFloat(numberPart);
    
    if (isNaN(number)) {
        throw new Error('Invalid number');
    }
    
    // Look up the multiplier for the notation
    const multiplier = NOTATIONS[notation];
    if (!multiplier) {
        throw new Error(`Invalid notation: ${notation}. Valid notations are: ${Object.keys(NOTATIONS).join(', ')}`);
    }

    // Calculate and return the final value
    const result = number * multiplier;
    return result;
}

/**
 * Formats a number using compact notation (K, M, B, etc.)
 * 
 * @param {number} number - The number to format
 * @param {number} precision - Decimal places to show (default: 2)
 * @returns {string} - Formatted number with appropriate notation
 */
function formatNumberOutput(number, precision = 2) {
    // For small numbers, just return the rounded value
    if (number < 1000) return Math.round(number).toString();

    // Sort notations from largest to smallest
    const notationEntries = Object.entries(NOTATIONS).reverse();
    
    // Find the appropriate notation for the number's magnitude
    for (const [notation, value] of notationEntries) {
        if (number >= value) {
            return (number / value).toFixed(precision) + notation;
        }
    }

    // Fallback if no notation matches (shouldn't happen with the checks above)
    return number.toString();
}

/**
 * Calculates various wave-based multipliers that affect enemy stats
 * 
 * @param {number} wave - The wave number
 * @param {boolean} isHP - Whether calculating for HP (true) or damage (false)
 * @returns {object} - Object containing calculated multipliers
 */
function calculateWaveMultipliers(wave, isHP = false) {
    if (isHP) {
        // Health multiplier calculations - two components:
        
        // 1. Bonus sum: Additive bonuses at various wave thresholds
        const bonusSum = 
            0.04 * Math.floor(wave / 5) +   // Every 5 waves: +4% 
            0.05 * Math.floor(wave / 10) +  // Every 10 waves: +5%
            0.06 * Math.floor(wave / 25) +  // Every 25 waves: +6%
            0.08 * Math.floor(wave / 50) +  // Every 50 waves: +8%
            0.1 * Math.floor(wave / 60) +   // Every 60 waves: +10%
            0.18 * Math.floor(wave / 72) +  // Every 72 waves: +18%
            0.2 * Math.floor(wave / 83) +   // Every 83 waves: +20%
            0.21 * Math.floor(wave / 94) +  // Every 94 waves: +21%
            0.12 * Math.floor(wave / 100) + // Every 100 waves: +12%
            0.1 * Math.floor(wave / 107) +  // Every 107 waves: +10%
            0.15 * Math.floor(wave / 200) + // Every 200 waves: +15%
            0.35 * Math.floor(wave / 900);  // Every 900 waves: +35%

        // 2. Power product: Multiplicative bonuses at various wave thresholds
        const powerProduct = 
            Math.pow(1.035, Math.floor(wave / 30)) *  // Every 30 waves: ×1.035
            Math.pow(1.02, Math.floor(wave / 60)) *   // Every 60 waves: ×1.02
            Math.pow(1.025, Math.floor(wave / 72)) *  // Every 72 waves: ×1.025
            Math.pow(1.03, Math.floor(wave / 83)) *   // Every 83 waves: ×1.03
            Math.pow(1.03, Math.floor(wave / 94)) *   // Every 94 waves: ×1.03
            Math.pow(1.02, Math.floor(wave / 100)) *  // Every 100 waves: ×1.02
            Math.pow(1.02, Math.floor(wave / 107)) *  // Every 107 waves: ×1.02
            Math.pow(1.11, Math.floor(wave / 139)) *  // Every 139 waves: ×1.11
            Math.pow(1.11, Math.floor(wave / 182)) *  // Every 182 waves: ×1.11
            Math.pow(1.03, Math.floor(wave / 200)) *  // Every 200 waves: ×1.03
            Math.pow(1.13, Math.floor(wave / 241)) *  // Every 241 waves: ×1.13
            Math.pow(1.13, Math.floor(wave / 332)) *  // Every 332 waves: ×1.13
            Math.pow(1.06, Math.floor(wave / 400)) *  // Every 400 waves: ×1.06
            Math.pow(1.15, Math.floor(wave / 900)) *  // Every 900 waves: ×1.15
            Math.pow(1.15, Math.floor(wave / 1024)); // Every 1024 waves: ×1.15

        return { bonusSum, powerProduct };
    } else {
        // Damage multiplier calculations
        
        // 1. Bonus sum: Additive bonuses for damage at various wave thresholds
        const bonusSum = 
            0.02 * Math.floor(wave / 5) +    // Every 5 waves: +2%
            0.025 * Math.floor(wave / 10) +  // Every 10 waves: +2.5%
            0.012 * Math.floor(wave / 25) +  // Every 25 waves: +1.2%
            0.017 * Math.floor(wave / 50) +  // Every 50 waves: +1.7%
            0.02 * Math.floor(wave / 100) +  // Every 100 waves: +2%
            0.025 * Math.floor(wave / 200) + // Every 200 waves: +2.5%
            0.02 * Math.floor(wave / 900);   // Every 900 waves: +2%

        // 2. Power product: Multiplicative bonuses for damage at various thresholds
        let powerProduct = Math.pow(1.005, Math.floor(wave / 30));  // Every 30 waves: ×1.005
        powerProduct *= Math.pow(1.01, Math.floor(wave / 72));      // Every 72 waves: ×1.01
        powerProduct *= Math.pow(1.01, Math.floor(wave / 83));      // Every 83 waves: ×1.01
        powerProduct *= Math.pow(1.01, Math.floor(wave / 94));      // Every 94 waves: ×1.01
        powerProduct *= Math.pow(1.01, Math.floor(wave / 107));     // Every 107 waves: ×1.01
        powerProduct *= Math.pow(1.02, Math.floor(wave / 200));     // Every 200 waves: ×1.02
        powerProduct *= Math.pow(1.02, Math.floor(wave / 400));     // Every 400 waves: ×1.02
        powerProduct *= Math.pow(1.035, Math.floor(wave / 900));    // Every 900 waves: ×1.035
        powerProduct *= Math.pow(1.05, Math.floor(wave / 1024));    // Every 1024 waves: ×1.05

        // Additional tier-specific power multipliers at specific wave thresholds
        const h = Math.floor(wave / 139);  // tier >= 7 threshold
        const m = Math.floor(wave / 182);  // tier >= 8 threshold
        const v = Math.floor(wave / 241);  // all tiers threshold
        const g = Math.floor(wave / 332);  // all tiers threshold

        return {
            bonusSum,
            powerProduct,
            // Function to adjust power product based on tier
            getAdjustedProduct: (tier) => {
                let adjusted = powerProduct;
                if (tier >= 7) adjusted *= Math.pow(1.025, h);  // 2.5% extra per 139 waves for tier 7+
                if (tier >= 8) adjusted *= Math.pow(1.025, m);  // 2.5% extra per 182 waves for tier 8+
                adjusted *= Math.pow(1.03, v);  // 3% extra per 241 waves for all tiers
                adjusted *= Math.pow(1.03, g);  // 3% extra per 332 waves for all tiers
                return adjusted;
            }
        };
    }
}

/**
 * Parses tier input in format like "5" or "8+" (tournament mode)
 * 
 * @param {string} tierInput - Tier input string
 * @returns {object} - Object with tier number and tournament flag
 * @throws {Error} - If tier format is invalid
 */
function parseTier(tierInput) {
    // Match patterns like "5" or "8+"
    const match = String(tierInput).match(/^(\d+)(\+)?$/);
    if (!match) {
        throw new Error('Invalid tier format');
    }

    // Extract tier number and tournament flag
    const tier = parseInt(match[1]);
    const isTournament = match[2] === '+';

    // Validate tournament tier
    if (isTournament && !VALID_TOURNAMENT_TIERS.includes(tier)) {
        throw new Error(`Invalid tournament tier. Valid tournament tiers are: ${VALID_TOURNAMENT_TIERS.map(t => t + '+').join(', ')}`);
    }

    // Validate regular tier
    if (!isTournament && (tier < 1 || tier > 18)) {
        throw new Error('Regular tier must be between 1 and 18');
    }

    return { tier, isTournament };
}

/**
 * Calculates the HP exponent used in the enemy HP formula
 * 
 * @param {string|object} tierInput - Tier level or parsed tier object
 * @returns {number} - The calculated HP exponent
 */
function calculateHPExponent(tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    // Base exponent is different for tournament mode
    const baseExponent = isTournament ? 2.308 : 2.13;
    // Add tier-specific exponent modifier
    const tierExponent = TIER_EXPONENT_HP[Math.min(tier, 15)] || TIER_EXPONENT_HP.default;    
    return baseExponent + tierExponent;
}

/**
 * Calculates the damage exponent used in the enemy damage formula
 * 
 * @param {string|object} tierInput - Tier level or parsed tier object
 * @returns {number} - The calculated damage exponent
 */
function calculateDMGExponent(tierInput) {
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    // Base exponent is different for tournament mode
    const baseExponent = isTournament ? 2.105 : 2.007;
    // Add tier-specific exponent modifier
    const tierExponent = TIER_EXPONENT_DMG[Math.min(tier, 15)] || TIER_EXPONENT_DMG.default;    
    return baseExponent + tierExponent;
}

/**
 * Calculates additional damage reduction factor for higher tiers
 * 
 * @param {number} tier - Tier level
 * @returns {number} - Damage reduction multiplier
 */
function calculateNewDMG(tier) {
    let value = 1;
    // Apply multipliers for higher tiers to reduce damage
    if (tier >= 10) value *= 0.43478245;  // ~57% reduction at tier 10+
    if (tier >= 11) value *= 0.2;         // 80% further reduction at tier 11+
    if (tier >= 12) value *= 0.1;         // 90% further reduction at tier 12+
    if (tier >= 13) value *= 0.02;        // 98% further reduction at tier 13+
    if (tier >= 14) value *= 0.02;        // 98% further reduction at tier 14+
    if (tier >= 15) value *= 0.02;        // 98% further reduction at tier 15+
    return value;
}

/**
 * Calculates enemy HP at a specific wave and tier
 * 
 * @param {number} wave - Wave number
 * @param {string|object} tierInput - Tier level or parsed tier object
 * @returns {number} - Enemy HP value
 */
function calculateEnemyHP(wave, tierInput) {
    // Parse tier if needed
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    
    // Get appropriate modifiers for regular or tournament mode
    const { base: baseMod, scaling: scalingMod, exp: expMod } = 
        isTournament ? TOURNAMENT_MODS : { base: 1, scaling: 1, exp: 1 };

    // Calculate wave-based multipliers
    const { bonusSum, powerProduct } = calculateWaveMultipliers(wave, true);
    
    // Base HP formula combines exponential and linear components
    const baseHP = (0.05 * baseMod * Math.pow(wave, calculateHPExponent({ tier, isTournament }))) +
                  (0.8 * scalingMod * wave) + 1.5;
                  
    // Apply wave multipliers (additive and multiplicative)
    const waveMultiplier = (1 + bonusSum) * powerProduct;
    
    // Additional multiplier for tournament mode based on hundreds of waves
    const tournamentMultiplier = isTournament ? 
        Math.pow(1.65, Math.floor(Math.max(1, wave - 1) / 100)) : 1;

    // Combine all factors to get final HP
    return baseHP * 
           waveMultiplier * 
           calculateTierDiff({ tier, isTournament }) * 
           Math.pow(expMod, wave) *
           tournamentMultiplier;
}

/**
 * Calculates enemy damage at a specific wave and tier
 * 
 * @param {number} wave - Wave number
 * @param {string|object} tierInput - Tier level or parsed tier object
 * @returns {number} - Enemy damage value
 */
function calculateEnemyDMG(wave, tierInput) {
    // Parse tier if needed
    const { tier, isTournament } = typeof tierInput === 'object' ? tierInput : parseTier(tierInput);
    
    // Get appropriate modifiers for regular or tournament mode
    const { base: baseMod, scaling: scalingMod } = 
        isTournament ? TOURNAMENT_MODS : { base: 1, scaling: 1 };

    // Get damage exponent based on tier and tournament status
    const baseExponent = isTournament ? 2.355 : 2.007;
    const tierExponent = TIER_EXPONENT_DMG[Math.min(tier, 15)] || TIER_EXPONENT_DMG.default;
    const totalExponent = baseExponent + tierExponent;

    // Special multiplier for waves > 100 in tournament mode
    let hundredPlusMulti = 1;
    if (isTournament) {
        const hundreds = Math.floor(Math.max(0, wave - 100) / 100);
        hundredPlusMulti = Math.pow(1.06, hundreds);  // 6% increase per 100 waves over 100
    }

    // Base damage formula combines exponential and linear components
    const baseDMG = (0.021 * baseMod * Math.pow(wave, totalExponent)) + 
                   (0.16 * scalingMod * wave) + 1.07;
                   
    // Calculate wave-based multipliers
    const { bonusSum, powerProduct } = calculateWaveMultipliers(wave);
    
    // Apply tier-specific damage reduction
    const tierDivisor = TIER_DMG_DIVISORS[Math.min(tier, 15)] || TIER_DMG_DIVISORS.default;
    const tierDamageMultiplier = tier < 4 ? 0.94 : (tier < 7 ? 0.9 : 0.86);

    // Combine all factors to get final damage
    return baseDMG * 
           (1 + bonusSum) * 
           powerProduct * 
           calculateTierDiff({ tier, isTournament }) * 
           hundredPlusMulti * 
           tierDamageMultiplier / 
           tierDivisor;
}

/**
 * Main function to calculate enemy stats for a specific wave with skips
 * 
 * @param {string} tierInput - Tier input (e.g. "5" or "8+")
 * @param {string|number} wave - Target wave number
 * @param {string|number} attackSkips - Attack Life Skips count (EALS)
 * @param {string|number} healthSkips - Health Life Skips count (EHLS)
 * @returns {string} - Formatted result showing enemy stats
 */
function enemyStatFinderWave(tierInput, wave, attackSkips, healthSkips) {
    try {
        // Parse all inputs to their numerical values
        const { tier, isTournament } = parseTier(tierInput);
        const parsedWave = parseNumberInput(wave);
        const parsedAttackSkips = parseNumberInput(attackSkips);
        const parsedHealthSkips = parseNumberInput(healthSkips);
        
        // Validate that skips don't exceed the target wave
        const actualWave = parsedWave - Math.max(parsedAttackSkips, parsedHealthSkips);
        if (actualWave <= 0) {
            return "Error: Skips exceed target wave";
        }

        // Calculate enemy stats accounting for life skips
        // (Health skips reduce effective wave for HP calculation)
        // (Attack skips reduce effective wave for damage calculation)
        const baseWaveHP = calculateEnemyHP(parsedWave - parsedHealthSkips, { tier, isTournament });
        const baseWaveDMG = calculateEnemyDMG(parsedWave - parsedAttackSkips, { tier, isTournament });
        
        // Apply any additional boss multipliers if needed
        const maxWaveHP = baseWaveHP * 1;  // Could multiply by boss factor here
        const maxWaveDMG = baseWaveDMG * 1; // Could multiply by boss factor here
        
        // Format the results into a readable string
        return `> To reach Wave ${formatNumberOutput(parsedWave)} on Tier ${tier}${isTournament ? '+' : ''}\n` +
               `> EALS: ${formatNumberOutput(parsedAttackSkips)}\n` +
               `> EHLS: ${formatNumberOutput(parsedHealthSkips)}\n` +
               `Enemy HP: ${formatNumberOutput(maxWaveHP)}\n` +
               `Enemy DMG: ${formatNumberOutput(maxWaveDMG)}`; 
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

// Export public functions for use in other modules
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