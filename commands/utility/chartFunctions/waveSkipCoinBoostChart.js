// Generates the BHD Coin Boost Chart (Wave Skip Coin Boost) as shown in the provided spreadsheet

const { createCanvas } = require('canvas');
const style = require('./style');

// Table data and headers (from spreadsheet)
const HEADERS = [
    'Sum of\nFree-Up Chance', 'None\n0%', '0\n10%', '1\n15%', '2\n20%', '3\n25%', '4\n30%', '5\n35%', '6\n40%', '7\n45%', '8\n50%', '9\n55%'
];
const SUBHEADER = 'Wave Skip Mastery Level';
const TITLE = 'BHD Coin Boost';
const DATA = [
    ['100%', '12.35%', '12.58%', '12.70%', '12.81%', '12.93%', '13.05%', '13.17%', '13.28%', '13.40%', '13.52%', '13.64%'],
    ['125%', '15.43%', '15.73%', '15.87%', '16.02%', '16.17%', '16.31%', '16.46%', '16.60%', '16.75%', '16.90%', '17.04%'],
    ['150%', '18.52%', '18.87%', '19.05%', '19.22%', '19.40%', '19.57%', '19.75%', '19.93%', '20.10%', '20.28%', '20.45%'],
    ['175%', '21.60%', '22.02%', '22.22%', '22.43%', '22.63%', '22.84%', '23.04%', '23.25%', '23.45%', '23.66%', '23.86%'],
    ['200%', '24.69%', '25.16%', '25.40%', '25.63%', '25.86%', '26.10%', '26.33%', '26.57%', '26.80%', '27.04%', '27.27%'],
    ['225%', '27.78%', '28.31%', '28.57%', '28.81%', '29.05%', '29.29%', '29.63%', '29.89%', '30.15%', '30.42%', '30.68%'],
    ['250%', '30.86%', '31.45%', '31.74%', '32.03%', '32.32%', '32.61%', '32.91%', '33.21%', '33.50%', '33.80%', '34.09%'],
    ['275%', '33.95%', '34.60%', '34.92%', '35.24%', '35.56%', '35.89%', '36.21%', '36.53%', '36.85%', '37.18%', '37.50%'],
    ['300%', '37.04%', '37.74%', '38.09%', '38.44%', '38.80%', '39.15%', '39.50%', '39.85%', '40.20%', '40.56%', '40.91%'],
    ['325%', '40.12%', '40.89%', '41.17%', '41.44%', '41.72%', '41.99%', '42.27%', '42.54%', '42.82%', '43.09%', '43.37%'],
    ['350%', '43.21%', '44.03%', '44.44%', '44.85%', '45.26%', '45.67%', '46.08%', '46.49%', '46.90%', '47.31%', '47.73%'],
    ['375%', '46.30%', '47.18%', '47.70%', '48.22%', '48.74%', '49.26%', '49.38%', '49.81%', '50.25%', '50.69%', '51.13%'],
    ['400%', '49.38%', '50.32%', '50.79%', '51.26%', '51.73%', '52.20%', '52.67%', '53.14%', '53.60%', '54.07%', '54.54%'],
    ['425%', '52.47%', '53.47%', '53.96%', '54.46%', '54.95%', '55.46%', '55.96%', '56.46%', '56.96%', '57.45%', '57.95%'],
    ['450%', '55.56%', '56.61%', '57.13%', '57.66%', '58.18%', '58.71%', '59.23%', '59.76%', '60.28%', '60.81%', '61.33%'],
    ['475%', '58.64%', '59.76%', '60.31%', '60.87%', '61.43%', '61.98%', '62.54%', '63.10%', '63.66%', '64.21%', '64.77%'],
    ['500%', '61.73%', '62.90%', '63.49%', '64.08%', '64.67%', '65.26%', '65.85%', '66.44%', '67.01%', '67.59%', '68.18%'],
    ['525%', '64.81%', '66.04%', '66.66%', '67.28%', '67.90%', '68.52%', '69.13%', '69.74%', '70.35%', '70.97%', '71.58%'],
    ['550%', '67.90%', '69.19%', '69.84%', '70.49%', '71.13%', '71.77%', '72.42%', '73.06%', '73.71%', '74.35%', '75.00%']
];

// Explanatory/footnote text (concise, for footer)
const FOOTER_TEXT = [
    'This chart shows the average expected CPK increase from BHD based on Wave Skip Mastery and total Free-Up Chance,',
    'assuming Ancestral BHD and a maxed Wave Skip card for "None."',
    '',
    'The distribution of Free-Ups between stats does not matter. Actual values may vary due to Wave Skip RNG.',
    'The chart only reflects the portion of Wave Skip Mastery value unique to the BHD module.',
    '',
    'Max Free-Up chance per stat (with maxed workshop, card, and SPB): (90.75 + Substat) × Enhancement × Relic × Keys.',
    '',
    'Credit: Yugiohcd10.'
];

// Main chart generator
async function generateWaveSkipCoinBoostChart() {
    // --- Chart layout config ---
    // --- Chart layout config (consistent with other charts) ---
    // Style constants (matching waveAccelerator chart)
    const font = style.font;
    const headerFont = 'bold 24px Arial'; // Custom for this chart's main title
    const subheaderFont = 'bold 18px Arial'; // Custom for this chart's subheader
    const cellFont = style.cellFont;
    const headerCellFont = style.headerCellFont;
    const footerFont = style.footerFont;
    const cellPadding = style.cellPadding;
    const rowHeight = style.baseRowHeight;
    const subheaderHeight = 32;
    const titleHeight = 44;
    const margin = style.margin;
    const footerLineSpacing = 4;
    const footerPadding = 10;
    const borderColor = style.borderColor;
    const headerBg = style.headerBg;
    const headerText = style.headerText;
    const evenRowBg = style.evenRowBg;
    const oddRowBg = style.oddRowBg;
    const textColor = style.textColor;
    const footerBg = style.footerBg;
    const footerColor = style.footerColor;

    // Calculate column widths
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

    const height = titleHeight + subheaderHeight + headerHeight + DATA.length * rowHeight + margin * 2 + footerHeight;

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

    // Draw subheader
    ctx2.font = subheaderFont;
    ctx2.fillStyle = headerText;
    ctx2.textAlign = 'center';
    ctx2.fillText(SUBHEADER, width / 2, margin / 2 + titleHeight - 8);

    // Draw table headers
    let x = 0;
    let y = margin / 2 + titleHeight + subheaderHeight - 8;
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

module.exports = { generateWaveSkipCoinBoostChart };
