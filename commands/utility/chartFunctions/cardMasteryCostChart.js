// Generates the Card Mastery Cost and Bonuses chart
const { createCanvas } = require('canvas');
const style = require('./style.js');

const HEADERS = [
    'Card', 'Mastery Description', 'Stone Cost', '0', '1 (1.1q)', '2 (1.3q)', '3 (2q)', '4 (3.4q)', '5 (5.6q)', '6 (7.7q)', '7 (8.1q)', '8 (9.8q)', '9 (10q)'
];
const DATA = [
    ['Damage', 'Increases card stat multiplier', '750', 'x1.4', 'x1.8', 'x2.2', 'x2.6', 'x3', 'x3.4', 'x3.8', 'x4.2', 'x4.6', 'x5'],
    ['Attack Speed', 'Increases card stat multiplier', '750', 'x1.03', 'x1.06', 'x1.09', 'x1.12', 'x1.15', 'x1.18', 'x1.21', 'x1.24', 'x1.27', 'x1.3'],
    ['Health', 'Increases card stat multiplier', '750', 'x1.2', 'x1.4', 'x1.6', 'x1.8', 'x2', 'x2.2', 'x2.4', 'x2.6', 'x2.8', 'x3'],
    ['Health Regen', 'Increases card stat multiplier', '750', 'x1.4', 'x1.8', 'x2.2', 'x2.6', 'x3', 'x3.4', 'x3.8', 'x4.2', 'x4.6', 'x5'],
    ['Range', 'Adds damager per meter bonus multiplier', '750', 'x1.2', 'x1.4', 'x1.6', 'x1.8', 'x2', 'x2.2', 'x2.4', 'x2.6', 'x2.8', 'x3'],
    ['Cash', 'Adds chance for elite to drop reroll dice', '500', '0.4%', '0.8%', '1.2%', '1.6%', '2%', '2.4%', '2.8%', '3.2%', '3.6%', '4%'],
    ['Coins', 'Increases card stat multiplier', '1250', 'x1.03', 'x1.06', 'x1.09', 'x1.12', 'x1.15', 'x1.18', 'x1.21', 'x1.24', 'x1.27', 'x1.30'],
    ['Slow Aura', 'Reduces enemy attack speed', '1000', 'x1.05', 'x1.1', 'x1.15', 'x1.2', 'x1.25', 'x1.3', 'x1.35', 'x1.4', 'x1.45', 'x1.5'],
    ['Critical Chance', 'Bonus to super crit chance', '750', '1%', '2%', '3%', '4%', '5%', '6%', '7%', '8%', '9%', '10%'],
    ['Enemy Balance', 'Chance for double elite spawn', '1000', '6%', '12%', '18%', '24%', '30%', '36%', '42%', '48%', '54%', '60%'],
    ['Extra Defense', 'Increases card stat multiplier', '1000', '+0.7%', '+1.4%', '+2.1%', '+2.8%', '+3.5%', '+4.2%', '+4.9%', '+5.6%', '+6.3%', '+7%'],
    ['Fortress', 'Reduces wall rebuild time', '750', '-10s', '-20s', '-30s', '-40s', '-50s', '-60s', '-70s', '-80s', '-90s', '-100s'],
    ['Free Upgrades', 'Lock a stat from free ups', '500', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    ['Extra Orb', 'Orb coin bonus', '750', 'x1.04', 'x1.08', 'x1.12', 'x1.16', 'x1.2', 'x1.24', 'x1.28', 'x1.32', 'x1.36', 'x1.4'],
    ['Plasma Cannon', 'Percent of plasma cannon applied to elites', '1250', '5%', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%'],
    ['Critical Coin', 'Chance of double coin drop', '1000', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%'],
    ['Wave Skip', 'Chance to double wave skip', '1000', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%', '55%'],
    ['Intro Sprint', 'Increases how many waves it skips', '1250', 'x1.8', 'x3.6', 'x5.4', 'x7.2', 'x9', 'x10.8', 'x12.6', 'x14.4', 'x16.2', 'x18'],    
    ['Land Mine Stun', 'Chance enemies will miss attacks', '1000', '2.7%', '5.4%', '8.1%', '10.8%', '13.5%', '16.2%', '18.9%', '21.6%', '24.3%', '27%'],
    ['Package Chance', 'Packages have a chance to drop common modules', '1000', '0.4%', '0.8%', '1.2%', '1.6%', '2%', '2.4%', '2.8%', '3.2%', '3.6%', '4%'],
    ['Death Ray', 'Death ray partially pierces protector shield', '750', '5%', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%'],
    ['Energy Net', 'Damage multi to bosses when trapped and slot filled', '750', 'x2', 'x4', 'x6', 'x8', 'x10', 'x12', 'x14', 'x16', 'x18', 'x20'],
    ['Super Tower', '33% of super tower bonus to UW buffs, reduces cooldown', '1000', '-3s', '-6s', '-9s', '-12s', '-15s', '-18s', '-21s', '-24s', '-27s', '-30s'],
    ['Second Wind', 'Increases HP regen for 40 waves when triggered', '1000', 'x1.9', 'x2.8', 'x3.7', 'x4.6', 'x5.5', 'x6.4', 'x7.3', 'x8.2', 'x9.1', 'x10'],
    ['Demon Mode', 'Lingering damage multi for 300 waves', '1000', 'x1.5', 'x2', 'x2.5', 'x3', 'x3.5', 'x4', 'x4.5', 'x5', 'x5.5', 'x6'],
    ['Energy Shield', 'Causes a pushback of enemies when card shield is used', '1000', '5%', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%'],
    ['Wave Accelerator', 'Increases spawn rate acceleration', '1000', '110%', '+120%', '+130%', '+140%', '+150%', '+160%', '+170%', '+180%', '+190%', '+200%'],
    ['Berserker', 'Increases damage cap from berserk for a limited time after death delay', '750', '30s', '60s', '90s', '120s', '150s', '180s', '210s', '240s', '270s', '300s'],
    ['Ultimate Crit', 'Ultimate crit chance', '750', '+0.3%', '+0.7%', '+1.0%', '+1.3%', '+1.7%', '+2.0%', '+2.3%', '+2.7%', '+3.0%', '+3.3%'],
    ['Nuke', 'Reduces enemy attack speed for 300 waves', '750', '5%', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%']
];
const TITLE = 'Card Mastery All Bonuses';
const FOOTER_TEXT = [
    'All values are for labs with no discount.',
    'See in-game for more details on each mastery.'
];


async function generateCardMasteryCostChart() {
    // Use global style variables
    const font = style.font;
    const headerFont = 'bold 24px Arial'; // Not in style.js, keep as is for now
    const subheaderFont = 'bold 18px Arial'; // Not in style.js, keep as is for now
    const cellFont = style.cellFont;
    const headerCellFont = style.headerCellFont;
    const footerFont = style.footerFont;
    const cellPadding = style.cellPadding;
    const rowHeight = style.baseRowHeight;
    const titleHeight = 44; // Not in style.js, keep as is for now
    const margin = style.margin;
    const footerLineSpacing = 4; // Not in style.js, keep as is for now
    const footerPadding = 10; // Not in style.js, keep as is for now
    const borderColor = style.borderColor;
    const headerBg = style.headerBg;
    const headerText = style.headerText;
    const evenRowBg = style.evenRowBg;
    const oddRowBg = style.oddRowBg;
    const textColor = style.textColor;
    const footerBg = style.footerBg;
    const footerColor = style.footerColor;


    // Calculate column widths (support multi-line headers if needed)
    const ctx = createCanvas(10, 10).getContext('2d');
    ctx.font = cellFont;
    const colWidths = HEADERS.map((header, i) => {
        let max = 0;
        for (const part of String(header).split('\n')) {
            ctx.font = headerCellFont;
            max = Math.max(max, ctx.measureText(part).width);
        }
        ctx.font = cellFont;
        for (const row of DATA) {
            max = Math.max(max, ctx.measureText(row[i]).width);
        }
        return Math.ceil(max) + cellPadding * 2;
    });
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const width = tableWidth;

    // --- Calculate header row height (multi-line support) ---
    let headerHeight = 0;
    for (const header of HEADERS) {
        const lines = String(header).split('\n').length;
        headerHeight = Math.max(headerHeight, lines * 18 + 12); // 18px per line + padding
    }


    // --- Calculate footer height (with wrapping) ---
    ctx.font = footerFont;
    const maxFooterWidth = tableWidth - 8;
    function wrapText(text, font, maxWidth) {
        ctx.font = font;
        if (!text) return [''];
        const words = text.split(' ');
        let lines = [];
        let current = '';
        for (let word of words) {
            const test = current ? current + ' ' + word : word;
            if (ctx.measureText(test).width > maxWidth && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        return lines;
    }
    let footerLines = [];
    for (const line of FOOTER_TEXT) {
        if (line === '') {
            footerLines.push('');
        } else {
            footerLines.push(...wrapText(line, footerFont, maxFooterWidth));
        }
    }
    // Add extra spacing for blank lines
    const footerHeight = footerLines.reduce((sum, line) => sum + (line === '' ? footerPadding : 20 + footerLineSpacing), 0) + margin;

    const height = titleHeight + headerHeight + DATA.length * rowHeight + margin * 2 + footerHeight;


    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx2 = canvas.getContext('2d');
    // Background
    ctx2.fillStyle = oddRowBg;
    ctx2.fillRect(0, 0, width, height);

    // Draw title
    ctx2.font = headerFont;
    ctx2.fillStyle = headerText;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'top';
    ctx2.fillText(TITLE, width / 2, margin / 2);

    // Draw table headers
    let x = 0;
    let y = margin / 2 + titleHeight;
    ctx2.font = headerCellFont;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    for (let i = 0; i < HEADERS.length; i++) {
        ctx2.fillStyle = headerBg;
        ctx2.fillRect(x, y, colWidths[i], headerHeight);
        ctx2.strokeStyle = borderColor;
        ctx2.lineWidth = 1;
        ctx2.strokeRect(x, y, colWidths[i], headerHeight);
        ctx2.fillStyle = headerText;
        // Support multi-line header
        const headerParts = String(HEADERS[i]).split('\n');
        for (let j = 0; j < headerParts.length; j++) {
            ctx2.fillText(headerParts[j], x + colWidths[i] / 2, y + (headerHeight / 2) + (j - (headerParts.length-1)/2) * 16);
        }
        x += colWidths[i];
    }

    // Draw table rows
    y += headerHeight;
    ctx2.font = cellFont;
    for (let r = 0; r < DATA.length; r++) {
        x = 0;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillStyle = (r % 2 === 0) ? evenRowBg : oddRowBg;
        ctx2.fillRect(0, y, width, rowHeight);
        for (let i = 0; i < DATA[r].length; i++) {
            ctx2.strokeStyle = borderColor;
            ctx2.lineWidth = 1;
            ctx2.strokeRect(x, y, colWidths[i], rowHeight);
            ctx2.fillStyle = textColor;
            ctx2.fillText(DATA[r][i], x + colWidths[i] / 2, y + rowHeight / 2);
            x += colWidths[i];
        }
        y += rowHeight;
    }

    // Draw footer background and text
    ctx2.font = footerFont;
    ctx2.fillStyle = footerBg;
    ctx2.fillRect(0, y, width, footerHeight);
    ctx2.fillStyle = footerColor;
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'top';
    let footerY = y + 6;
    let footerX = 12;
    for (const line of footerLines) {
        if (line === '') {
            footerY += footerPadding;
        } else {
            ctx2.fillText(line, footerX, footerY);
            footerY += 20 + footerLineSpacing;
        }
    }

    // Convert to buffer and return directly
    return canvas.toBuffer('image/png');
}

module.exports = { generateCardMasteryCostChart };
