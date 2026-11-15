let isPlaying = false;
let intervalId = null;
const audio = new Audio();
let prefetch = null;
const frequencyCache = {};
let isAudioEnabled = false;
let currentFileName = '';
let speechToken = 0;

const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const currentWordDisplay = document.getElementById('currentWord');
const audioToggle = document.getElementById('audioToggle');
const darkModeToggle = document.getElementById('darkModeToggle');
const textContent = document.getElementById('textContent');
const progressBar = document.getElementById('readingProgress');
const wordCount = document.getElementById('wordCount');
const timeRemaining = document.getElementById('timeRemaining');
const startReadingBtn = document.getElementById('startReadingBtn');
const voice1 = document.getElementById('voice1');
const voice2 = document.getElementById('voice2');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const generationContainer = document.getElementById('generationContainer');
const generationProgress = document.getElementById('generationProgress');
const generationStatus = document.getElementById('generationStatus');

fileInput.addEventListener('change', handleFileUpload);
playPauseBtn.addEventListener('click', togglePlayPause);
speedSlider.addEventListener('input', updateSpeed);
audioToggle.addEventListener('click', handleAudioToggle);
darkModeToggle.addEventListener('click', () => toggleDarkMode());
textContent.addEventListener('click', handleTextContentClick);
textContent.addEventListener('input', handleTextInput);
startReadingBtn.addEventListener('click', handleStartReading);
voice1.addEventListener('change', saveSettings);
voice2.addEventListener('change', saveSettings);
downloadAudioBtn.addEventListener('click', downloadAudio);

playPauseBtn.disabled = true;
audioToggle.disabled = true;
downloadAudioBtn.disabled = true;

const savedSettings = JSON.parse(localStorage.getItem('fastReaderSettings') || '{}');

if (savedSettings.speed) {
    speedSlider.value = savedSettings.speed;
    speedValue.textContent = savedSettings.speed;
}

if (savedSettings.isAudioEnabled !== undefined) {
    isAudioEnabled = savedSettings.isAudioEnabled;
    audioToggle.querySelector('.material-icons').textContent = isAudioEnabled ? 'volume_up' : 'volume_off';
}

function saveSettings() {
    localStorage.setItem('fastReaderSettings', JSON.stringify({
        speed: speedSlider.value,
        isAudioEnabled: isAudioEnabled,
        darkMode: document.body.classList.contains('dark-mode'),
        voice1: voice1.value,
        voice2: voice2.value
    }));
}

function saveFileState() {
    if (!textContent.value) return;

    localStorage.setItem('fastReaderLastFile', JSON.stringify({
        name: currentFileName,
        text: textContent.value,
        selectionStart: textContent.selectionStart,
        timestamp: Date.now()
    }));
}

const lastFile = JSON.parse(localStorage.getItem('fastReaderLastFile') || 'null');

if (lastFile) {
    currentFileName = lastFile.name;
    textContent.value = lastFile.text;
    textContent.setSelectionRange(lastFile.selectionStart || 0, lastFile.selectionStart || 0);
    updateDisplay();
    updateProgress();
    playPauseBtn.disabled = false;
    audioToggle.disabled = false;
    downloadAudioBtn.disabled = false;

    startReadingBtn.querySelector('.material-icons').textContent = 'check';
    startReadingBtn.textContent = 'Ready to Read';
    startReadingBtn.disabled = true;

    updateTextareaReadonlyState();
}

const savedMode = localStorage.getItem('darkMode');

if (savedMode === 'true' || savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark-mode');
    darkModeToggle.querySelector('.material-icons').textContent = 'dark_mode';
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => localStorage.getItem('darkMode') === null && toggleDarkMode(e.matches));

function toggleDarkMode(forcedState) {
    document.body.classList.toggle('dark-mode', forcedState);
    darkModeToggle.querySelector('.material-icons').textContent = document.body.classList.contains('dark-mode') ? 'dark_mode' : 'light_mode';

    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    saveSettings();
}

async function handleFileUpload(event) {
    if (!event.target.files[0]) return;

    try {
        currentWordDisplay.textContent = 'Converting file...';
        const text = await extractText(event.target.files[0]);
        if (!text) throw new Error('No text found in file');
        currentFileName = event.target.files[0].name;
        textContent.value = text;
        textContent.setSelectionRange(0, 0);
        updateDisplay();
        updateProgress();
        playPauseBtn.disabled = false;
        audioToggle.disabled = false;
        downloadAudioBtn.disabled = false;
        saveFileState();

        startReadingBtn.querySelector('.material-icons').textContent = 'check';
        startReadingBtn.textContent = 'Ready to Read';
        startReadingBtn.disabled = true;

        updateTextareaReadonlyState();
    } catch (error) {
        console.error('Error reading file:', error);
        currentWordDisplay.textContent = `Error reading file: ${error.message || 'unknown error'}`;
    }
}

function handleTextContentClick() {
    updateDisplay();
    updateProgress();
    saveFileState();
    if (isPlaying) {
        stopReading();
        startReading();
    }
}

function handleTextInput() {
    startReadingBtn.disabled = textContent.value.trim().length === 0;

    if (textContent.value.trim().length > 0) startReadingBtn.querySelector('.material-icons').textContent = 'play_arrow';

    updateTextareaReadonlyState();
}

function handleStartReading() {
    if (!textContent.value.trim()) return;

    textContent.value = textContent.value.trim();
    currentFileName = 'Manual Input';
    textContent.setSelectionRange(0, 0);
    updateDisplay();
    updateProgress();
    playPauseBtn.disabled = false;
    audioToggle.disabled = false;
    downloadAudioBtn.disabled = false;
    saveFileState();

    startReadingBtn.querySelector('.material-icons').textContent = 'check';
    startReadingBtn.textContent = 'Ready to Read';
    startReadingBtn.disabled = true;

    updateTextareaReadonlyState();
}

function togglePlayPause() {
    if (!/\S/.test(textContent.value)) return;

    isPlaying = !isPlaying;
    playPauseBtn.querySelector('.material-icons').textContent = isPlaying ? 'pause' : 'play_arrow';

    if (isPlaying) {
        if (!/\S/.test(textContent.value.slice(textContent.selectionEnd))) {
            textContent.setSelectionRange(0, 0);
            updateDisplay();
        }
        startReading();
    }
    else stopReading();

    updateTextareaReadonlyState();
}

function startReading() {
    if (isAudioEnabled) {
        speakFrom(textContent.selectionStart);
        return;
    }

    intervalId = setInterval(() => displayNextWord(), 60 * 1000 / parseInt(speedSlider.value));
}

function stopReading() {
    speechToken++;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    audio.pause();
    prefetch = null;
    saveFileState();
}

function displayNextWord() {
    if (!/\S/.test(textContent.value.slice(textContent.selectionEnd))) return togglePlayPause();

    textContent.setSelectionRange(textContent.selectionEnd + 1, textContent.selectionEnd + 1);
    updateDisplay();
    updateProgress();
    saveFileState();
}

function updateDisplay() {
    const wordPattern = /\S+/g;
    wordPattern.lastIndex = textContent.selectionStart - textContent.value.slice(0, textContent.selectionStart).match(/\S*$/)[0].length;
    const match = wordPattern.exec(textContent.value);

    currentWordDisplay.textContent = match ? match[0] : 'Upload a text file to begin';

    if (match) textContent.setSelectionRange(match.index, match.index + match[0].length);
}

function updateSpeed() {
    speedValue.textContent = speedSlider.value;
    audio.playbackRate = parseInt(speedSlider.value) / 200;
    if (isPlaying && !isAudioEnabled) {
        stopReading();
        startReading();
    }
    saveSettings();
}

async function lookupFrequency(word) {
    if (word in frequencyCache) return;

    try {
        const [entry] = await (await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`)).json();
        frequencyCache[word] = entry && entry.word.toLowerCase() === word.toLowerCase() ? parseFloat((entry.tags?.find(tag => tag.startsWith('f:')) || 'f:0').slice(2)) : 0;
    } catch {
        frequencyCache[word] = 0;
    }
}

function getParagraph(offset) {
    const length = textContent.value.slice(offset).search(/\n\s*\n/);
    const end = length === -1 ? textContent.value.length : offset + length;
    const gap = textContent.value.slice(end).search(/\S/);

    return {
        end,
        next: gap === -1 ? -1 : end + gap,
        text: textContent.value.slice(offset, end).replace(/\s+/g, ' ').trim(),
        voice: (textContent.value.slice(0, offset).trimStart().split(/\n\s*\n/).length % 2 === 1 ? voice1 : voice2).value
    };
}

function synthesize(paragraph, onProgress) {
    return window.tts.predict({ text: paragraph.text, voiceId: paragraph.voice }, onProgress);
}

async function speakFrom(offset) {
    const token = ++speechToken;
    const paragraph = getParagraph(offset);

    try {
        currentWordDisplay.textContent = 'Generating audio...';
        await (prefetch && prefetch.offset === offset ? prefetch.promise : synthesize(paragraph, progress => currentWordDisplay.textContent = `Downloading voice ${Math.round(progress.loaded * 100 / progress.total)}%`)).then(blob => {
            if (token !== speechToken) return;
            URL.revokeObjectURL(audio.src);
            audio.src = URL.createObjectURL(blob);
        });
        if (token !== speechToken) return;

        audio.playbackRate = parseInt(speedSlider.value) / 200;
        audio.onended = () => handleSpeechEnd(token, paragraph);
        await audio.play();
        if (token !== speechToken) return;

        intervalId = setInterval(() => syncWord(offset, paragraph.end), 100);
        prefetch = paragraph.next === -1 ? null : { offset: paragraph.next, promise: synthesize(getParagraph(paragraph.next)) };
    } catch (error) {
        if (token !== speechToken) return;
        console.error('Error generating audio:', error);
        currentWordDisplay.textContent = `Error generating audio: ${error.message || 'unknown error'}`;
        togglePlayPause();
    }
}

function syncWord(start, end) {
    if (!audio.duration) return;

    const position = Math.min(end - 1, start + Math.floor(audio.currentTime / audio.duration * (end - start)));
    textContent.setSelectionRange(position, position);
    updateDisplay();
    updateProgress();
}

function handleSpeechEnd(token, paragraph) {
    if (token !== speechToken) return;

    clearInterval(intervalId);
    if (paragraph.next === -1) return togglePlayPause();

    speakFrom(paragraph.next);
}

(async () => {
    try {
        const voices = await window.tts.voices();

        for (const [index, select] of [voice1, voice2].entries()) {
            select.replaceChildren();
            for (const voice of voices) {
                const option = document.createElement('option');
                option.value = voice.key;
                option.textContent = `${voice.language.name_english} (${voice.language.country_english}) - ${voice.name} (${voice.quality})`;
                select.appendChild(option);
            }
            select.value = savedSettings[`voice${index + 1}`] || ['en_US-hfc_female-medium', 'en_US-hfc_male-medium'][index];
            if (!select.value) select.value = voices[Math.min(index, voices.length - 1)].key;
        }
    } catch (error) {
        console.error('Error loading voices:', error);
    }
})();

async function downloadAudio() {
    if (!/\S/.test(textContent.value)) return;

    downloadAudioBtn.disabled = true;
    generationContainer.hidden = false;
    generationProgress.style.width = '0%';
    generationStatus.textContent = 'Generating audio... 0%';

    try {
        const sampleRate = 22050;
        const context = new AudioContext({ sampleRate: sampleRate });
        const chunks = [];
        let offset = textContent.value.search(/\S/);

        while (offset !== -1) {
            const paragraph = getParagraph(offset);
            chunks.push(Int16Array.from((await context.decodeAudioData(await (await synthesize(paragraph, progress => generationStatus.textContent = `Downloading voice ${Math.round(progress.loaded * 100 / progress.total)}%`)).arrayBuffer())).getChannelData(0), sample => Math.max(-1, Math.min(1, sample)) * 32767), new Int16Array(Math.round(sampleRate * 0.4)));
            const percent = Math.round(paragraph.end / textContent.value.length * 100);
            generationProgress.style.width = `${percent}%`;
            generationStatus.textContent = `Generating audio... ${percent}%`;
            offset = paragraph.next;
        }
        context.close();

        const samples = chunks.reduce((total, chunk) => total + chunk.length, 0);
        const view = new DataView(new ArrayBuffer(44 + samples * 2));
        const writeText = (position, text) => [...text].forEach((character, index) => view.setUint8(position + index, character.charCodeAt(0)));
        writeText(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeText(8, 'WAVEfmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeText(36, 'data');
        view.setUint32(40, samples * 2, true);

        let position = 44;
        for (const chunk of chunks) {
            for (const sample of chunk) {
                view.setInt16(position, sample, true);
                position += 2;
            }
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
        link.download = `${currentFileName.replace(/\.[^.]+$/, '') || 'read-aloud'}.wav`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        generationStatus.textContent = 'Done. Download started.';
    } catch (error) {
        console.error('Error generating audio:', error);
        generationStatus.textContent = `Error generating audio: ${error.message || 'unknown error'}`;
    } finally {
        downloadAudioBtn.disabled = false;
    }
}

function handleAudioToggle() {
    isAudioEnabled = !isAudioEnabled;
    audioToggle.querySelector('.material-icons').textContent = isAudioEnabled ? 'volume_up' : 'volume_off';

    if (isPlaying) {
        stopReading();
        startReading();
    }
    saveSettings();
}

function updateProgress() {
    const total = (textContent.value.match(/\S+/g) || []).length;
    if (total === 0) {
        progressBar.style.width = '0%';
        wordCount.textContent = '0/0 words';
        timeRemaining.textContent = '0:00';
        return;
    }

    const read = (textContent.value.slice(0, textContent.selectionStart).match(/\S+/g) || []).length;
    progressBar.style.width = `${read / total * 100}%`;
    wordCount.textContent = `${read}/${total} words`;

    const minutesRemaining = (total - read) / parseInt(speedSlider.value);
    timeRemaining.textContent = `${Math.floor(minutesRemaining)}:${Math.floor((minutesRemaining - Math.floor(minutesRemaining)) * 60).toString().padStart(2, '0')}`;
}

function updateTextareaReadonlyState() {
    textContent.readOnly = isPlaying;

    if (isPlaying) {
        textContent.style.backgroundColor = 'var(--word-display-bg)';
        textContent.style.cursor = 'not-allowed';
    }
    else {
        textContent.style.backgroundColor = 'var(--textarea-bg)';
        textContent.style.cursor = 'text';
    }
}

function decodeBytes(bytes, label) {
    try {
        return new TextDecoder(label || 'utf-8').decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

function collectXmlText(node, blockTags) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';

    return `${node.localName === 's' ? ' '.repeat(parseInt(node.getAttribute('text:c') || '1', 10)) : { tab: '\t', 'line-break': '\n', br: '\n' }[node.localName] || ''}${[...node.childNodes].map(child => collectXmlText(child, blockTags)).join('')}${blockTags.has(node.localName) ? '\n' : ''}`;
}

async function extractText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const head = decodeBytes(bytes.subarray(0, 8), 'windows-1252');
    let text;

    if (head.startsWith('%PDF')) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        text = (await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => (await (await pdf.getPage(index + 1)).getTextContent()).items.map(item => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('')))).join('\n');
    }
    else if (head.startsWith('{\\rtf')) {
        const src = decodeBytes(bytes, 'windows-1252');
        let out = '';
        let stack = [];
        let skip = false;
        let uc = 1;
        let skipChars = 0;
        let i = 0;

        while (i < src.length) {
            if (src[i] === '{') {
                stack = [{ skip: skip, uc: uc }, ...stack];
                i++;
                if (src[i] === '\\' && src[i + 1] === '*') skip = true;
                else if (src[i] === '\\') {
                    const destination = /^\\([a-zA-Z]+)/.exec(src.slice(i, i + 32));
                    if (destination && new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'private', 'revtbl', 'pgptbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend']).has(destination[1])) skip = true;
                }
            }
            else if (src[i] === '}') {
                const [state, ...rest] = stack;
                stack = rest;
                if (state) {
                    skip = state.skip;
                    uc = state.uc;
                }
                i++;
            }
            else if (src[i] === '\\') {
                if (src[i + 1] === undefined) break;
                if (src[i + 1] === '\\' || src[i + 1] === '{' || src[i + 1] === '}') {
                    if (!skip) {
                        if (skipChars > 0) skipChars--;
                        else out += src[i + 1];
                    }
                    i += 2;
                }
                else if (src[i + 1] === "'") {
                    if (!skip) {
                        if (skipChars > 0) skipChars--;
                        else out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(src.slice(i + 2, i + 4), 16) || 63]));
                    }
                    i += 4;
                }
                else if (src[i + 1] === '~') {
                    if (!skip) out += '\xA0';
                    i += 2;
                }
                else if (src[i + 1] === '_') {
                    if (!skip) out += '-';
                    i += 2;
                }
                else if (src[i + 1] === '-' || src[i + 1] === '*' || src[i + 1] === ':' || src[i + 1] === '|') {
                    i += 2;
                }
                else if (src[i + 1] === '\n' || src[i + 1] === '\r') {
                    if (!skip) out += '\n';
                    i += 2;
                }
                else {
                    const controlWord = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
                    if (!controlWord) {
                        i += 2;
                        continue;
                    }
                    i += controlWord[0].length;
                    const param = controlWord[2] !== undefined ? parseInt(controlWord[2], 10) : undefined;
                    if (skip) continue;
                    switch (controlWord[1]) {
                        case 'par': case 'line': case 'sect': case 'page': case 'row': out += '\n'; break;
                        case 'tab': case 'cell': out += '\t'; break;
                        case 'emdash': out += '—'; break;
                        case 'endash': out += '–'; break;
                        case 'lquote': out += '‘'; break;
                        case 'rquote': out += '’'; break;
                        case 'ldblquote': out += '“'; break;
                        case 'rdblquote': out += '”'; break;
                        case 'bullet': out += '•'; break;
                        case 'uc': if (param !== undefined) uc = param; break;
                        case 'u':
                            if (param !== undefined) {
                                out += String.fromCharCode(param < 0 ? param + 65536 : param);
                                skipChars = uc;
                            }
                            break;
                    }
                }
            }
            else if (src[i] === '\n' || src[i] === '\r') i++;
            else {
                if (!skip) {
                    if (skipChars > 0) skipChars--;
                    else out += src[i];
                }
                i++;
            }
        }
        text = out;
    }
    else if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
        const zip = await window.JSZip.loadAsync(buf);
        if (zip.file('content.xml') && zip.file('mimetype')) {
            text = collectXmlText(new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml').documentElement, new Set(['p', 'h', 'list-item', 'table-row']));
        }
        else if (zip.file('word/document.xml')) {
            text = (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
        }
        else throw new Error(`Unsupported file format: ${file.name}`);
    }
    else if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
        const container = window.CFB.read(bytes, { type: 'array' });
        const wordEntry = window.CFB.find(container, 'WordDocument');
        if (!wordEntry) throw new Error('Not a valid Word .doc file');
        const wd = new Uint8Array(wordEntry.content);
        const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
        const tableEntry = window.CFB.find(container, dv.getUint16(0x0A, true) & 0x0200 ? '1Table' : '0Table');
        if (!tableEntry) throw new Error('Word table stream missing');
        const tbl = new Uint8Array(tableEntry.content);
        const tdv = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
        const ccpText = dv.getInt32(0x4C, true);
        const fcClx = dv.getUint32(0x01A2, true);

        text = '';
        try {
            let p = fcClx;
            while (p < fcClx + dv.getUint32(0x01A6, true) && tbl[p] === 0x01) p += 3 + tdv.getUint16(p + 1, true);
            if (tbl[p] !== 0x02) throw new Error('No piece table');
            const pieces = (tdv.getUint32(p + 1, true) - 4) / 12;
            p += 5;
            const cps = Array.from({ length: pieces + 1 }, (_, k) => tdv.getUint32(p + k * 4, true));
            for (let k = 0; k < pieces; k++) {
                const fcRaw = tdv.getUint32(p + (pieces + 1) * 4 + k * 8 + 2, true);
                const fc = fcRaw & 0x3FFFFFFF;
                let len = cps[k + 1] - cps[k];
                if (cps[k] >= ccpText) break;
                if (cps[k] + len > ccpText) len = ccpText - cps[k];
                if (fcRaw & 0x40000000) {
                    const offset = fc >> 1;
                    text += decodeBytes(wd.subarray(offset, offset + len), 'windows-1252');
                }
                else text += decodeBytes(wd.subarray(fc, fc + len * 2), 'utf-16le');
            }
        } catch {
            text = decodeBytes(wd.subarray(0x200), 'windows-1252');
        }
        text = text.replace(/\u0013[^\u0014\u0015]*\u0014/g, '').replace(/[\u0013\u0014\u0015]/g, '').replace(/\u0007/g, '\t').replace(/[\u000B\u000C]/g, '\n').replace(/\u0001|\u0008/g, '');
    }
    else if (ext === 'wri') {
        text = decodeBytes(bytes.subarray(0x80, Math.max(0x80, Math.min(new DataView(buf).getUint32(0x0E, true) || buf.byteLength, buf.byteLength))), 'windows-1252').replace(/\u000C/g, '\n');
    }
    else if (ext === 'rtfd') throw new Error('RTFD is a folder bundle. Choose the TXT.rtf file inside it.');
    else if (['pdf', 'doc', 'docx', 'odt'].includes(ext)) throw new Error(`Could not read this ${ext.toUpperCase()} file.`);
    else text = decodeBytes(bytes);

    const lines = text.replace(/\r\n?/g, '\n').replace(/\xAD[ \t]*\n?/g, '').split('\n').map(line => line.replace(/[ \t\xA0]+/g, ' ').replace(/ ! /g, ' ').replace(/ +([,.;:!?)\]])/g, '$1').replace(/([(\[“]) +/g, '$1').trim().replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"'));
    const keys = lines.map(line => line.replace(/\d+/g, '#'));
    const counts = new Map();
    for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
    const kept = lines.filter((line, index) => line.length > 100 || counts.get(keys[index]) < 3 || !/^#$|^# | #$/.test(keys[index]));
    const sorted = kept.filter(line => line).map(line => line.length).sort((a, b) => a - b);
    const terminal = /[.!?…:]["')\]]*$/;
    const flow = kept.reduce(([out, pending, open, previous], line) => open && line && line.length < sorted[Math.floor(sorted.length * 0.9)] * 0.5 && !terminal.test(line) ? [out, `${pending} ${line}`, true, previous] : /^(Figure|Table) \d/.test(line) && line.length < sorted[Math.floor(sorted.length * 0.9)] * 0.5 && !terminal.test(line) && previous && !terminal.test(previous) ? [out, `${pending}\n\n${line}`, true, previous] : [`${out}${line}\n${terminal.test(line) && pending ? `${pending}\n\n` : ''}`, terminal.test(line) ? '' : pending, false, line], ['', '', false, '']).slice(0, 2).join('').split('\n');
    text = flow.map((line, index) => line.length < sorted[Math.floor(sorted.length * 0.9)] * (terminal.test(line) ? 0.85 : 0.5) && (terminal.test(line) || terminal.test(flow[index + 1] || '') || (flow[index + 1] || '').length >= sorted[Math.floor(sorted.length * 0.9)] * 0.5) ? `${line}\n` : line).join('\n').replace(/\n(?=[•◦▪▫●○■□‣⁃∙·])/g, '\n\n');

    const hyphenated = /(\p{L}+)[ \t]*([-‐-–])[ \t]*\r?\n(\p{L}+)/gu;
    const forms = [...new Set(Array.from(text.matchAll(hyphenated), match => [`${match[1]}${match[3]}`, `${match[1]}-${match[3]}`, match[1], match[3]]).flat())];
    for (let index = 0; index < forms.length; index += 10) await Promise.all(forms.slice(index, index + 10).map(form => lookupFrequency(form)));
    text = text.replace(hyphenated, (_, first, dash, second) => frequencyCache[`${first}-${second}`] > frequencyCache[`${first}${second}`] || frequencyCache[`${first}-${second}`] === frequencyCache[`${first}${second}`] && (frequencyCache[first] >= 1 || /^\p{Lu}+$/u.test(first)) && frequencyCache[second] >= 1 ? `${first}${dash}${second}` : `${first}${second}`);

    text = text.replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').replace(/([-‐-―])\n(?=[^\n])/g, '$1').replace(/(?<![.!?…:]["')\]]*)\n\n(?=\p{Ll})/gu, ' ').replace(/(?<!(?:[.!?…:]["')\]]*|\n))\n(?!\n)/g, ' ').trim();

    const bulletPattern = /^[•◦▪▫●○■□‣⁃∙·]\s*/;
    let bullet = 0;
    return text.split(/\n{2,}/).map(paragraph => {
        bullet = bulletPattern.test(paragraph) ? bullet + 1 : 0;
        return bullet ? paragraph.replace(bulletPattern, `Bullet ${bullet}: `) : paragraph;
    }).join('\n\n');
}
