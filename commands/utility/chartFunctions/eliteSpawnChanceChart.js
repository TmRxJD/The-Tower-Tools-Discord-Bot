// Generates the Elite Spawn Chance chart as shown in the provided spreadsheet
const { createCanvas } = require('canvas');
const style = require('./style.js');

// Table headers and data (from spreadsheet image)
// For the reference columns, use two columns, but only draw 'reference' once, spanned across both columns
const HEADERS = [
    'Double%', 'Single%', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', '', ''
];
const DATA = [
    ...[
        ['0%', '0%', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
        ['0%', '1%', '500', '450', '405', '365', '328', '295', '266', '239', '215', '194', '174', '157', '141', '127', '114', '41', '37', '33', '1', '1'],
        ['0%', '4%', '1000', '900', '810', '729', '656', '590', '531', '478', '430', '387', '349', '314', '282', '254', '229', '100', '92', '83', '2', '2'],
        ['0%', '9%', '1500', '1350', '1215', '1094', '984', '886', '797', '717', '646', '581', '523', '471', '424', '381', '343', '205', '185', '167', '3', '3'],
        ['0%', '16%', '2000', '1800', '1620', '1458', '1312', '1181', '1063', '957', '861', '775', '697', '628', '565', '508', '458', '308', '277', '250', '4', '4'],
        ['0%', '25%', '3000', '2700', '2430', '2187', '1968', '1771', '1594', '1435', '1291', '1162', '1046', '941', '847', '763', '688', '411', '370', '333', '6', '5'],
        ['0%', '36%', '4000', '3600', '3240', '2916', '2624', '2362', '2126', '1913', '1722', '1550', '1395', '1255', '1130', '1017', '915', '617', '555', '500', '8', '6'],
        ['0%', '49%', '5000', '4500', '4050', '3645', '3281', '2953', '2657', '2391', '2152', '1937', '1743', '1569', '1412', '1271', '1144', '823', '741', '667', '10', '7'],
        ['0%', '64%', '6000', '5400', '4860', '4374', '3937', '3543', '3189', '2870', '2583', '2325', '2092', '1883', '1695', '1525', '1373', '1029', '926', '833', '12', '8'],
        ['0%', '81%', '7000', '6300', '5670', '5103', '4593', '4133', '3720', '3348', '3013', '2712', '2441', '2197', '1977', '1779', '1601', '1235', '1111', '1000', '14', '9'],
        ['1%', '100%', '8000', '7200', '6480', '5832', '5249', '4724', '4252', '3826', '3444', '3099', '2789', '2510', '2259', '2033', '1830', '1441', '1297', '1167', '16', '10'],
        ['4%', '100%', '9000', '8100', '7290', '6561', '5905', '5314', '4783', '4305', '3874', '3487', '3138', '2824', '2542', '2288', '2059', '1647', '1482', '1334', '18', '11'],
        ['9%', '100%', '10000', '9000', '8100', '7290', '6561', '5905', '5314', '4783', '4305', '3874', '3487', '3138', '2824', '2542', '2288', '1806', '1627', '1461', '20', '12'],
        ['16%', '100%', '11000', '9900', '8910', '8019', '7217', '6495', '5846', '5261', '4735', '4256', '3821', '3425', '3082', '2774', '2500', '1965', '1771', '1593', '22', '13'],
        ['25%', '100%', '12000', '10800', '9720', '8748', '7873', '7086', '6377', '5740', '5166', '4649', '4184', '3766', '3387', '3050', '2754', '2264', '2038', '1834', '24', '14'],
        ['36%', '100%', '13000', '11700', '10530', '9477', '8529', '7676', '6909', '6218', '5596', '5036', '4533', '4080', '3672', '3305', '2974', '2470', '2223', '2003', '26', '15'],
        ['49%', '100%', '14000', '12600', '11340', '10206', '9185', '8267', '7440', '6696', '6027', '5424', '4881', '4393', '3954', '3559', '3203', '2676', '2408', '2168', '28', '16'],
        ['64%', '100%', '15000', '13500', '12150', '10935', '9836', '8852', '7967', '7171', '6457', '5811', '5230', '4707', '4236', '3813', '3432', '2882', '2594', '2333', '30', '17'],
        ['81%', '100%', '16000', '14400', '12960', '11664', '10498', '9448', '8503', '7653', '6887', '6200', '5580', '5023', '4519', '4067', '3660', '3088', '2779', '2501', '32', '18'],
        ['100%', '100%', '17000', '15300', '13770', '12393', '11154', '10038', '9034', '8131', '7318', '6586', '5928', '5335', '4801', '4321', '3889', '3294', '2964', '2668', '34', '19']
    ]
];

const TITLE = 'Elite Enemy Spawn Chance Increase Per Wave and Tier';
const FOOTER_TEXT = [
    'Each wave has a cap on Elite Spawns. Elite Spawn is capped to 1 per wave (Single Spawn) until 100% Total,',
    'then cap becomes 2 (Double Spawn).',
    '',
    'If a Spawn Chance percentage has anything other than .00 after the decimal, it\'s a repeating value.',
    'Reference column is for lookup only.',
    '',
    'Credit: Larechar with help from Skye',
    'v. 0.24.2'
];

async function generateEliteSpawnChanceChart() {
    // Use global style variables

    const font = style.font;
    const headerFont = 'bold 22px Arial'; // Not in style.js, keep as is for now
    const subheaderFont = style.subheaderFont;
    const cellFont = style.cellFont;
    const headerCellFont = 'bold 15px Arial'; // Not in style.js, keep as is for now
    const footerFont = 'italic 13px Arial'; // Not in style.js, keep as is for now
    const cellPadding = 14; // Not in style.js, keep as is for now
    const rowHeight = 28; // Not in style.js, keep as is for now
    const titleHeight = 40; // Not in style.js, keep as is for now
    const margin = 20; // Not in style.js, keep as is for now
    const footerLineSpacing = 3; // Not in style.js, keep as is for now
    const footerPadding = 8; // Not in style.js, keep as is for now
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
        let label = typeof header === 'object' ? header.label : header;
        ctx.font = headerCellFont;
        max = Math.max(max, ctx.measureText(label).width);
        ctx.font = cellFont;
        for (const row of DATA) {
            max = Math.max(max, ctx.measureText(row[i]).width);
        }
        return Math.ceil(max) + cellPadding * 2;
    });
    // Modifiers table data (from spreadsheet)
    // First column is empty, then a single spanned header for Modifiers (Rounded), then T1-T18
    const MODIFIERS_HEADER = ['', { label: 'Modifiers (Rounded):', span: 18 }];
    const MODIFIERS_ROW_LABEL = 'Ratio';
    const MODIFIERS_ROW = ['0.9', '500.00', '450.00', '405.00', '364.50', '328.05', '295.25', '265.72', '239.15', '215.23', '193.71', '174.34', '156.91', '141.21', '127.09', '114.38', '102.95', '92.65', '83.39'];

    // Calculate modifiers colWidths (align with main table columns)
    // First column is empty, then T1-T18 columns (colWidths[2]..colWidths[19])
    const modifiersColWidths = [colWidths[0], ...colWidths.slice(2, 20)];
    const modifiersTableWidth = modifiersColWidths.reduce((a, b) => a + b, 0);
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const width = Math.max(tableWidth, modifiersTableWidth);

    // --- Calculate header row height (multi-line support) ---
    // Only one header row
    let headerHeight = 28;

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
    const footerHeight = footerLines.reduce((sum, line) => sum + (line === '' ? footerPadding : 18 + footerLineSpacing), 0) + margin;

    const modifiersRowHeight = 28;
    const modifiersHeaderHeight = 24;
    const modifiersSpacing = 18; // extra space between main table and modifiers
    const height = titleHeight + headerHeight + DATA.length * rowHeight + modifiersSpacing + modifiersHeaderHeight + modifiersRowHeight + margin * 2 + footerHeight;

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

    // Draw table headers (first 20 as normal, last 2 as merged 'reference')
    let x = 0;
    let y = margin / 2 + titleHeight;
    ctx2.font = headerCellFont;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    // Draw first 20 headers as normal
    for (let i = 0; i < 20; i++) {
        ctx2.fillStyle = headerBg;
        ctx2.fillRect(x, y, colWidths[i], headerHeight);
        ctx2.strokeStyle = borderColor;
        ctx2.lineWidth = 1;
        ctx2.strokeRect(x, y, colWidths[i], headerHeight);
        ctx2.fillStyle = headerText;
        ctx2.fillText(HEADERS[i], x + colWidths[i] / 2, y + headerHeight / 2);
        x += colWidths[i];
    }
    // Draw merged 'reference' header cell spanning last two columns
    let refHeaderX = x;
    let refHeaderWidth = colWidths[20] + colWidths[21];
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(refHeaderX, y, refHeaderWidth, headerHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(refHeaderX, y, refHeaderWidth, headerHeight);
    ctx2.fillStyle = headerText;
    ctx2.font = headerCellFont;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText('reference', refHeaderX + refHeaderWidth / 2, y + headerHeight / 2);
    y += headerHeight;

    // Draw table rows
    // (table rows now start after header)
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

    // Add spacing before modifiers
    y += modifiersSpacing;

    // Draw modifiers header row: 'Ratio' and 'Modifiers (Rounded):' in the same row, lined up with T1-T18 columns
    ctx2.font = 'bold 15px Arial';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    // Start at the x position of Single% (second column)
    let modX = colWidths[0];
    let modY = y;
    // First cell: 'Ratio' header (Single% column)
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(modX, modY, colWidths[1], modifiersHeaderHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(modX, modY, colWidths[1], modifiersHeaderHeight);
    ctx2.fillStyle = headerText;
    ctx2.fillText(MODIFIERS_ROW_LABEL, modX + colWidths[1] / 2, modY + modifiersHeaderHeight / 2);
    modX += colWidths[1];
    // Spanned header for Modifiers (Rounded):
    let spanWidth = 0;
    for (let i = 2; i <= 19; i++) spanWidth += colWidths[i];
    ctx2.fillStyle = headerBg;
    ctx2.fillRect(modX, modY, spanWidth, modifiersHeaderHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(modX, modY, spanWidth, modifiersHeaderHeight);
    ctx2.fillStyle = headerText;
    ctx2.fillText('Modifiers (Rounded):', modX + spanWidth / 2, modY + modifiersHeaderHeight / 2);

    // Draw modifiers value row (0.9, 500.00, ...), lined up with T1-T18 columns
    modX = colWidths[0];
    modY += modifiersHeaderHeight;
    ctx2.font = cellFont;
    // First cell: 0.9 (under Ratio, Single% column)
    ctx2.fillStyle = evenRowBg;
    ctx2.fillRect(modX, modY, colWidths[1], modifiersRowHeight);
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(modX, modY, colWidths[1], modifiersRowHeight);
    ctx2.fillStyle = textColor;
    ctx2.fillText(MODIFIERS_ROW[0], modX + colWidths[1] / 2, modY + modifiersRowHeight / 2);
    modX += colWidths[1];
    // The rest: 500.00, 450.00, ...
    for (let i = 1; i < MODIFIERS_ROW.length; i++) {
        ctx2.fillStyle = evenRowBg;
        ctx2.fillRect(modX, modY, colWidths[i+1], modifiersRowHeight);
        ctx2.strokeStyle = borderColor;
        ctx2.lineWidth = 1;
        ctx2.strokeRect(modX, modY, colWidths[i+1], modifiersRowHeight);
        ctx2.fillStyle = textColor;
        ctx2.fillText(MODIFIERS_ROW[i], modX + colWidths[i+1] / 2, modY + modifiersRowHeight / 2);
        modX += colWidths[i+1];
    }
    y = modY + modifiersRowHeight;

    // Draw footer background and text
    ctx2.font = footerFont;
    ctx2.fillStyle = footerBg;
    ctx2.fillRect(0, y, width, footerHeight);
    ctx2.fillStyle = footerColor;
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'top';
    let footerY = y + 5;
    let footerX = 10;
    for (const line of footerLines) {
        if (line === '') {
            footerY += footerPadding;
        } else {
            ctx2.fillText(line, footerX, footerY);
            footerY += 18 + footerLineSpacing;
        }
    }

    // Convert to buffer and return directly
    return canvas.toBuffer('image/png');
}

module.exports = { generateEliteSpawnChanceChart };
