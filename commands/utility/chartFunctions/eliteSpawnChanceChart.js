// Programmatic Elite Spawn Chance chart (uses reference column as multiplier)
const { createCanvas } = require('canvas');
const style = require('./style.js');

const HEADERS = [
    'Double%', 'Single%', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', '', ''
];

function generateProgrammaticData() {
    // 1) Tier modifiers: modifier[n] = 500 * (0.9)^n for n = 0..20
    const modifiers = [];
    for (let n = 0; n < 21; n++) {
        modifiers.push(500 * Math.pow(0.9, n));
    }

    // Keep canonical modifiers (500 * 0.9^n). We will only apply a display override for row 1
    // where T16 is forced to 41 and T17..T21 are 0.9x of the prior display value.

    // 2) Reference arrays: left (non-linear) and right (linear)
    // leftReferences matches the original chart's wave lookup; rightReferences is a simple index
    const leftReferences = [0,1,2,3,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34];
    const rightReferences = Array.from({ length: 20 }, (_, i) => i);

    // 3) Percentages mapping (rows 0..19)
    const percentages = [
        ['0%','0%'],['0%','1%'],['0%','4%'],['0%','9%'],['0%','16%'],['0%','25%'],['0%','36%'],['0%','49%'],['0%','64%'],['0%','81%'],
        ['1%','100%'],['4%','100%'],['9%','100%'],['16%','100%'],['25%','100%'],['36%','100%'],['49%','100%'],['64%','100%'],['81%','100%'],['100%','100%']
    ];

    const data = [];
    // Build rows programmatically: every tier value is computed from the canonical modifiers.
    // Special-case: row 1 uses an explicit display override chain for T16+ starting at 41.
    // For rows r>=2, tiers T16+ are computed from the canonical modifiers but use the
    // references[r-1] (one-row delay) as the multiplier.

    // Precompute row-1 display overrides for T16..T21 using 0.9 propagation from 41
    const row1Override = {};
    row1Override[15] = 41; // T16 at row 1
    for (let i = 16; i < 21; i++) {
        row1Override[i] = Math.round(row1Override[i - 1] * 0.9);
    }
    for (let r = 0; r < percentages.length; r++) {
        const rowArr = [];
        rowArr.push(percentages[r][0]);
        rowArr.push(percentages[r][1]);

        for (let t = 0; t < modifiers.length; t++) {
            // Base row (r === 1) uses multiplier 1 for all tiers
            let refIndex;
            if (r === 1) {
                // row 1: for T16+ use the explicit override chain, otherwise use canonical modifier * 1
                if (t >= 15) {
                    rowArr.push(String(row1Override[t]));
                    continue;
                }
                refIndex = r;
            } else {
                // rows r>=2: tiers T16+ use references[r-1] (one-row delay), other tiers use references[r]
                refIndex = (t >= 15) ? Math.max(0, r - 1) : r;
            }

            const refValue = leftReferences[refIndex];
            const val = Math.round(modifiers[t] * refValue);
            rowArr.push(String(val));
        }

        // Append reference columns (left and right reference series)
        rowArr.push(String(leftReferences[r]));
        rowArr.push(String(rightReferences[r]));

        data.push(rowArr);
    }

    return data;
}

const DATA = generateProgrammaticData();

// Copy footer/title/etc from original for compatibility
const TITLE = 'Elite Enemy Spawn Chance Increase Per Wave and Tier';
const FOOTER_TEXT = [
    'Each wave has a cap on Elite Spawns. Elite Spawn is capped to 1 per wave (Single Spawn) until 100% Total, then cap becomes 2 (Double Spawn) before Enemy Balance Mastery',
    'Enemy Balance Mastery allows each spawn to have a chance to be a double spawn (so 2-4 will spawn per wave once at 100% double spawn chance.',
    '',
    'How values are calculated:',
        '- Each column T1–T21 uses a modifier x ratio to the power of the tier: 500 × (0.9)^tier',
        '- Each row is tied to a spawn chance threshold, with a nonlinear multiplier (leftRef)',
        '- Wave values are computed as: round(modifier × leftRef[row])',
        '- Tiers T16–T21 use a one-row reference delay (leftRef[row - 1])',
        '- rightRef is used as a row index',
    '',
    'Credit: Larechar with help from Skye',
    'Current as of v.27.0.6',
    "DM or tag @Cruoton in Discord if an error, or change in future version, is found"
];

async function generateEliteSpawnChanceChart() {
    // minimal chart render: reuse original chart rendering logic but based on DATA above
    const font = style.font;
    const headerFont = 'bold 22px Arial';
    const cellFont = style.cellFont;
    const headerCellFont = 'bold 15px Arial';
    const footerFont = 'italic 13px Arial';
    const cellPadding = 14;
    const rowHeight = 28;
    const titleHeight = 40;
    const margin = 20;
    const footerLineSpacing = 3;
    const footerPadding = 8;
    const borderColor = style.borderColor;
    const headerBg = style.headerBg;
    const headerText = style.headerText;
    const evenRowBg = style.evenRowBg;
    const oddRowBg = style.oddRowBg;
    const textColor = style.textColor;
    const footerBg = style.footerBg;
    const footerColor = style.footerColor;

    const ctx = createCanvas(10,10).getContext('2d');
    ctx.font = cellFont;
    const colWidths = HEADERS.map((header,i)=>{
        let max = 0;
        const label = typeof header === 'object' ? header.label : header;
        ctx.font = headerCellFont;
        max = Math.max(max, ctx.measureText(label).width);
        ctx.font = cellFont;
        for (const row of DATA) {
            max = Math.max(max, ctx.measureText(row[i]||'').width);
        }
        return Math.ceil(max) + cellPadding * 2;
    });

    // make ref columns same reasonable width based on their numeric content
    ctx.font = cellFont;
    const refTextWidth = Math.max(ctx.measureText('34').width, ctx.measureText('19').width);
    const refColumnWidth = Math.ceil(refTextWidth) + 8;
    colWidths[23] = refColumnWidth;
    colWidths[24] = refColumnWidth;

    const modifiersRowHeight = 28;
    const modifiersHeaderHeight = 24;
    const modifiersSpacing = 18;
    const modifiersHeader = ['', { label: 'Modifiers (Rounded):', span: 21 }];
    const modifiersRowLabel = 'Ratio';

    // Recompute canonical modifiers here so the display code below has access to them
    const modifiers = [];
    for (let n = 0; n < 21; n++) modifiers.push(500 * Math.pow(0.9, n));

    // Build modifiers row for display using the canonical modifiers array
    const modifiersRow = ['0.9'];
    for (let i = 0; i < 21; i++) modifiersRow.push((Math.round(modifiers[i] * 100) / 100).toFixed(2));

    const modifiersColWidths = [colWidths[0], ...colWidths.slice(2,23)];
    const modifiersTableWidth = modifiersColWidths.reduce((a,b)=>a+b,0);
    const tableWidth = colWidths.reduce((a,b)=>a+b,0);
    const width = Math.max(tableWidth, modifiersTableWidth);
    const headerHeight = 28;

    ctx.font = footerFont;
    const maxFooterWidth = tableWidth - 8;
    function wrapText(text,font,maxWidth){
        ctx.font = font;
        if(!text) return [''];
        const words = text.split(' ');
        let lines = [];
        let current = '';
        for (let word of words){
            const test = current ? current + ' ' + word : word;
            if (ctx.measureText(test).width > maxWidth && current){
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if(current) lines.push(current);
        return lines;
    }
    let footerLines = [];
    for (const line of FOOTER_TEXT){
        if(line === '') footerLines.push(''); else footerLines.push(...wrapText(line, footerFont, maxFooterWidth));
    }
    const footerHeight = footerLines.reduce((sum,line)=> sum + (line === '' ? footerPadding : 18 + footerLineSpacing),0) + margin;

    const height = titleHeight + headerHeight + DATA.length*rowHeight + modifiersSpacing + modifiersHeaderHeight + modifiersRowHeight + margin*2 + footerHeight;

    const canvas = createCanvas(width, height);
    const ctx2 = canvas.getContext('2d');
    ctx2.fillStyle = oddRowBg; ctx2.fillRect(0,0,width,height);

    // title
    ctx2.font = headerFont; ctx2.fillStyle = headerText; ctx2.textAlign='center'; ctx2.textBaseline='top'; ctx2.fillText(TITLE, width/2, margin/2);

    // headers
    let x=0; let y = margin/2 + titleHeight;
    ctx2.font = headerCellFont; ctx2.textAlign='center'; ctx2.textBaseline='middle';
    for (let i=0;i<23;i++){ ctx2.fillStyle=headerBg; ctx2.fillRect(x,y,colWidths[i],headerHeight); ctx2.strokeStyle=borderColor; ctx2.lineWidth=1; ctx2.strokeRect(x,y,colWidths[i],headerHeight); ctx2.fillStyle=headerText; ctx2.fillText(HEADERS[i], x+colWidths[i]/2, y+headerHeight/2); x += colWidths[i]; }
    let refHeaderX = x; let refHeaderWidth = colWidths[23]+colWidths[24]; ctx2.fillStyle=headerBg; ctx2.fillRect(refHeaderX,y,refHeaderWidth,headerHeight); ctx2.strokeStyle=borderColor; ctx2.strokeRect(refHeaderX,y,refHeaderWidth,headerHeight); ctx2.fillStyle=headerText; ctx2.fillText('Ref.', refHeaderX + refHeaderWidth/2, y + headerHeight/2);
    y += headerHeight;

    // rows
    ctx2.font = cellFont;
    for (let r=0;r<DATA.length;r++){
        x=0; ctx2.textAlign='center'; ctx2.textBaseline='middle'; ctx2.fillStyle = (r%2===0)? evenRowBg:oddRowBg; ctx2.fillRect(0,y,width,rowHeight);
        for (let i=0;i<DATA[r].length;i++){
            ctx2.strokeStyle=borderColor; ctx2.lineWidth=1; ctx2.strokeRect(x,y,colWidths[i],rowHeight); ctx2.fillStyle = textColor; ctx2.fillText(DATA[r][i], x+colWidths[i]/2, y+rowHeight/2); x += colWidths[i];
        }
        y += rowHeight;
    }

    // modifiers section
    y += modifiersSpacing;
    ctx2.font='bold 15px Arial'; ctx2.textAlign='center'; ctx2.textBaseline='middle'; let modX = colWidths[0]; let modY = y; ctx2.fillStyle = headerBg; ctx2.fillRect(modX, modY, colWidths[1], modifiersHeaderHeight); ctx2.strokeRect(modX,modY,colWidths[1],modifiersHeaderHeight); ctx2.fillStyle=headerText; ctx2.fillText(modifiersRowLabel, modX+colWidths[1]/2, modY+modifiersHeaderHeight/2); modX += colWidths[1];
    let spanWidth = 0; for (let i=2;i<=22;i++) spanWidth += colWidths[i]; ctx2.fillStyle=headerBg; ctx2.fillRect(modX,modY,spanWidth,modifiersHeaderHeight); ctx2.strokeRect(modX,modY,spanWidth,modifiersHeaderHeight); ctx2.fillStyle=headerText; ctx2.fillText('Modifiers (Rounded):', modX + spanWidth/2, modY + modifiersHeaderHeight/2);
    modX = colWidths[0]; modY += modifiersHeaderHeight; ctx2.font = cellFont; ctx2.fillStyle = evenRowBg; ctx2.fillRect(modX, modY, colWidths[1], modifiersRowHeight); ctx2.strokeRect(modX, modY, colWidths[1], modifiersRowHeight); ctx2.fillStyle = textColor; ctx2.fillText(modifiersRow[0], modX + colWidths[1]/2, modY + modifiersRowHeight/2); modX += colWidths[1];
    for (let i=1;i<modifiersRow.length;i++){ ctx2.fillStyle = evenRowBg; ctx2.fillRect(modX, modY, colWidths[i+1], modifiersRowHeight); ctx2.strokeRect(modX,modY,colWidths[i+1],modifiersRowHeight); ctx2.fillStyle = textColor; ctx2.fillText(modifiersRow[i], modX + colWidths[i+1]/2, modY + modifiersRowHeight/2); modX += colWidths[i+1]; }

    // footer
    y = modY + modifiersRowHeight; ctx2.font = footerFont; ctx2.fillStyle = footerBg; ctx2.fillRect(0,y,width,footerHeight); ctx2.fillStyle = footerColor; ctx2.textAlign='left'; ctx2.textBaseline='top'; let footerY = y + 5; let footerX = 10; for (const line of footerLines) { if (line === '') footerY += footerPadding; else { ctx2.fillText(line, footerX, footerY); footerY += 18 + footerLineSpacing; } }

    return canvas.toBuffer('image/png');
}

module.exports = { generateEliteSpawnChanceChart, DATA };
