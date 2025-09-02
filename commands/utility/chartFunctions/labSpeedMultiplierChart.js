// Generates the Most Efficient Lab Speed Multiplier chart
const { createCanvas } = require('canvas');
const style = require('./style.js');

const HEADERS = [
    'Lab 1', 'Lab 2', 'Lab 3', 'Lab 4', 'Lab 5', '24h', '8h', '1h'
];
const TITLE = 'Most Efficient Lab Speed Multiplier';
const FOOTER_TEXT = [
    'Shows the most efficient speed multiplier combinations for labs.'
];

// Data extracted and transformed from the image, now with 24h, 8h, 1h columns
const DATA = [
    ['1.5', '1.5', '1.5', '1.5', '1.5', '1,800', '600', '75'],
    ['2', '1.5', '1.5', '1.5', '1.5', '3,840', '1,280', '160'],
    ['2', '2', '1.5', '1.5', '1.5', '5,880', '1,960', '245'],
    ['2', '2', '2', '1.5', '1.5', '7,920', '2,640', '330'],
    ['2', '2', '2', '2', '1.5', '9,960', '3,320', '415'],
    ['2', '2', '2', '2', '2', '12,000', '4,000', '500'],
    ['3', '2', '2', '2', '2', '29,760', '9,920', '1,240'],
    ['3', '3', '2', '2', '2', '47,520', '15,840', '1,980'],
    ['3', '3', '3', '2', '2', '65,280', '21,760', '2,720'],
    ['3', '3', '3', '3', '2', '83,040', '27,680', '3,460'],
    ['3', '3', '3', '3', '3', '100,800', '33,600', '4,200'],
    ['4', '3', '3', '3', '3', '161,280', '53,760', '6,720'],
    ['4', '4', '3', '3', '3', '221,760', '73,920', '9,240'],
    ['4', '4', '4', '3', '3', '282,240', '94,080', '11,760'],
    ['4', '4', '4', '4', '3', '342,720', '114,240', '14,280'],
    ['4', '4', '4', '4', '4', '403,200', '134,400', '16,800'],
    ['5', '4', '4', '4', '4', '608,160', '202,720', '25,340'],
    ['5', '5', '4', '4', '4', '813,120', '271,040', '33,880'],
    ['5', '5', '5', '4', '4', '1,018,080', '339,360', '42,420'],
    ['5', '5', '5', '5', '4', '1,223,040', '407,680', '50,960'],
    ['5', '5', '5', '5', '5', '1,428,000', '476,000', '59,500'],
    ['6', '5', '5', '5', '5', '2,582,400', '860,800', '107,600'],
    ['6', '6', '5', '5', '5', '3,736,800', '1,245,600', '155,700'],
    ['6', '6', '6', '5', '5', '4,891,200', '1,630,400', '203,800'],
    ['6', '6', '6', '6', '5', '6,045,600', '2,015,200', '251,900'],
    ['6', '6', '6', '6', '6', '7,200,000', '2,400,000', '300,000'],
];

async function generateLabSpeedMultiplierChart() {
    // Use global style variables
    const font = style.font;
    const headerFont = 'bold 24px Arial'; // Not in style.js, keep as is for now
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

    // Color palette for each multiplier value (dark mode friendly, muted)
    const valueColors = {
        '1':   '#23272f', // dark gray
        '1.5': '#1e3a2a', // muted red
        '2':   '#23272f', // muted purple
        '3':   '#1e3a2a', // muted green
        '4':   '#23272f', // muted brown/orange
        '5':   '#1e3a2a', // muted blue
        '6':   '#23272f', // deeper/darker purple for 6
    };

    // Calculate column widths
    const ctx = createCanvas(10, 10).getContext('2d');
    ctx.font = cellFont;
    const colWidths = HEADERS.map((header, i) => {
        let max = 0;
        ctx.font = headerCellFont;
        max = Math.max(max, ctx.measureText(header).width);
        ctx.font = cellFont;
        for (const row of DATA) {
            max = Math.max(max, ctx.measureText(row[i]).width);
        }
        return Math.ceil(max) + cellPadding * 2;
    });
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const width = tableWidth;

    // --- Calculate header row height ---
    let headerHeight = 0;
    for (const header of HEADERS) {
        headerHeight = Math.max(headerHeight, 30); // single line
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
        ctx2.fillText(HEADERS[i], x + colWidths[i] / 2, y + headerHeight / 2);
        x += colWidths[i];
    }

    // Draw table rows with cell-based background colors (diagonal pattern)
    y += headerHeight;
    ctx2.font = cellFont;
    for (let r = 0; r < DATA.length; r++) {
        x = 0;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        for (let i = 0; i < DATA[r].length; i++) {
            // Only color multiplier columns (not cost columns)
            let cellBg = '#181a20'; // Use a distinct dark background for cost columns
            if (i < 5) {
                const val = DATA[r][i];
                cellBg = valueColors[val] || '#181a20';
            }
            ctx2.fillStyle = cellBg;
            ctx2.fillRect(x, y, colWidths[i], rowHeight);
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

module.exports = { generateLabSpeedMultiplierChart };
