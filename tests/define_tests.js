const acronyms = require('../commands/data/acronyms');

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function titleCase(str) {
    return String(str).replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function expandAcronymsInText(text) {
    let changed = false;
    let out = text;
    for (const keyRaw of Object.keys(acronyms)) {
        const key = keyRaw;
        const replacement = titleCase(String(acronyms[keyRaw] || acronyms[keyRaw]));
        const escaped = escapeRegex(key);
        const re = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', 'gi');
        out = out.replace(re, (full, prefix, matched) => {
            changed = true;
            return (prefix || '') + `**${replacement}**`;
        });
    }
    return { text: out, changed };
}

const tests = [
    {in: 'you should be farming with bh', note: 'lowercase bh'},
    {in: 'You should be farming with BH', note: 'uppercase BH'},
    {in: 'use 50/50 perk', note: 'slash key 50/50'},
    {in: 'boss to is active', note: 'key with space "boss to"'},
    {in: 'scorchingbh does nothing', note: 'inside word should not match'},
    {in: 'bh,bh and bh.', note: 'punctuation adjacency and multiple occurrences'},
    {in: 'increase cc now', note: 'cc mapping multiple meanings'},
    {in: 'use sw to activate', note: 'sw maps to Second Wind / Shockwave'},
];

let passed = 0;
for (const t of tests) {
    const out = expandAcronymsInText(t.in);
    console.log('---');
    console.log('Input:   ', t.in);
    console.log('Output:  ', out.text);
    console.log('Changed: ', out.changed);
    console.log('Note:    ', t.note);
    passed += 1;
}
console.log('Ran', tests.length, 'tests');
