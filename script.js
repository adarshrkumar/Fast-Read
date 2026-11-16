let isPlaying = false;
let intervalId = null;
const audio = new Audio();
let prefetch = null;
const frequencyCache = {};
let isAudioEnabled = false;
let currentFileName = null;
let speechToken = 0;

const speedValue = document.getElementById('speedValue');
const currentWordDisplay = document.getElementById('currentWord');
const progressBar = document.getElementById('readingProgress');
const wordCount = document.getElementById('wordCount');
const timeRemaining = document.getElementById('timeRemaining');
const generationContainer = document.getElementById('generationContainer');
const generationProgress = document.getElementById('generationProgress');
const generationStatus = document.getElementById('generationStatus');

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async event => {
    if (!event.target.files[0]) return;

    try {
        currentWordDisplay.textContent = 'Converting file...';
        const ext = (event.target.files[0].name.split('.').pop() || '').toLowerCase();
        const buf = await event.target.files[0].arrayBuffer();
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
            let unicodeSkipCount = 1;
            let skipChars = 0;
            let i = 0;

            while (i < src.length) {
                if (src[i] === '{') {
                    stack = [{ skip: skip, unicodeSkipCount: unicodeSkipCount }, ...stack];
                    i++;
                    if (src[i] === '\\' && src[i + 1] === '*') skip = true;
                    else if (src[i] === '\\') {
                        const destination = /^\\([a-zA-Z]+)/.exec(src.slice(i, i + 32));
                        if (destination && new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'private', 'revtbl', 'pgptbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend']).has(destination[1])) skip = true;
                    }
                }
                else if (src[i] === '}') {
                    if (stack[0]) {
                        skip = stack[0].skip;
                        unicodeSkipCount = stack[0].unicodeSkipCount;
                    }
                    stack = stack.slice(1);
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
                            case 'uc': if (param !== undefined) unicodeSkipCount = param; break;
                            case 'u':
                                if (param !== undefined) {
                                    out += String.fromCharCode(param < 0 ? param + 65536 : param);
                                    skipChars = unicodeSkipCount;
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
            else throw new Error(`Unsupported file format: ${event.target.files[0].name}`);
        }
        else if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
            const container = window.CFB.read(bytes, { type: 'array' });
            const wordEntry = window.CFB.find(container, 'WordDocument');
            if (!wordEntry) throw new Error('Not a valid Word .doc file');
            const wordDocument = new Uint8Array(wordEntry.content);
            const tableEntry = window.CFB.find(container, new DataView(wordDocument.buffer).getUint16(0x0A, true) & 0x0200 ? '1Table' : '0Table');
            if (!tableEntry) throw new Error('Word table stream missing');
            const tableStream = new Uint8Array(tableEntry.content);

            text = '';
            try {
                let pieceTableOffset = new DataView(wordDocument.buffer).getUint32(0x01A2, true);
                while (pieceTableOffset < new DataView(wordDocument.buffer).getUint32(0x01A2, true) + new DataView(wordDocument.buffer).getUint32(0x01A6, true) && tableStream[pieceTableOffset] === 0x01) pieceTableOffset += 3 + new DataView(tableStream.buffer).getUint16(pieceTableOffset + 1, true);
                if (tableStream[pieceTableOffset] !== 0x02) throw new Error('No piece table');
                const pieces = (new DataView(tableStream.buffer).getUint32(pieceTableOffset + 1, true) - 4) / 12;
                for (let k = 0; k < pieces; k++) {
                    const textPointer = new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + (pieces + 1) * 4 + k * 8 + 2, true);
                    if (new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + k * 4, true) >= new DataView(wordDocument.buffer).getInt32(0x4C, true)) break;
                    if (textPointer & 0x40000000) text += decodeBytes(wordDocument.subarray((textPointer & 0x3FFFFFFF) >> 1, ((textPointer & 0x3FFFFFFF) >> 1) + Math.min(new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + (k + 1) * 4, true), new DataView(wordDocument.buffer).getInt32(0x4C, true)) - new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + k * 4, true)), 'windows-1252');
                    else text += decodeBytes(wordDocument.subarray(textPointer & 0x3FFFFFFF, (textPointer & 0x3FFFFFFF) + (Math.min(new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + (k + 1) * 4, true), new DataView(wordDocument.buffer).getInt32(0x4C, true)) - new DataView(tableStream.buffer).getUint32(pieceTableOffset + 5 + k * 4, true)) * 2), 'utf-16le');
                }
            } catch {
                text = decodeBytes(wordDocument.subarray(0x200), 'windows-1252');
            }
            text = text
                .replace(/\u0013[^\u0014\u0015]*\u0014/g, '')
                .replace(/[\u0013\u0014\u0015]/g, '')
                .replace(/\u0007/g, '\t')
                .replace(/[\u000B\u000C]/g, '\n')
                .replace(/\u0001|\u0008/g, '');
        }
        else if (ext === 'wri') {
            text = decodeBytes(bytes.subarray(0x80, Math.max(0x80, Math.min(new DataView(buf).getUint32(0x0E, true) || buf.byteLength, buf.byteLength))), 'windows-1252').replace(/\u000C/g, '\n');
        }
        else if (ext === 'rtfd') throw new Error('RTFD is a folder bundle. Choose the TXT.rtf file inside it.');
        else if (['pdf', 'doc', 'docx', 'odt'].includes(ext)) throw new Error(`Could not read this ${ext.toUpperCase()} file.`);
        else text = decodeBytes(bytes);

        const lines = text
            .replace(/\r\n?/g, '\n')
            .replace(/\xAD[ \t]*\n?/g, '')
            .split('\n')
            .map(line => line
                .replace(/[ \t\xA0]+/g, ' ')
                .replace(/ ! /g, ' ')
                .replace(/ +([,.;:!?)\]])/g, '$1')
                .replace(/([(\[“]) +/g, '$1').trim()
                .replace(/[‘’‚‛]/g, "'")
                .replace(/[“”„‟]/g, '"')
            );
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
        for (let index = 0; index < forms.length; index += 10) await Promise.all(forms.slice(index, index + 10)
            .map(async form => {
                if (form in frequencyCache) return;

                try {
                    frequencyCache[form] = (await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${form.replace(/-/g, ' ')}"`)}&srlimit=1&srinfo=totalhits&format=json&origin=*`)).json()).query.searchinfo.totalhits;
                } catch {
                    frequencyCache[form] = 0;
                }
            }));
        text = text
            .replace(hyphenated, (_, first, dash, second) => frequencyCache[`${first}-${second}`] > frequencyCache[`${first}${second}`] || frequencyCache[`${first}-${second}`] === frequencyCache[`${first}${second}`] && (frequencyCache[first] >= 1000 || /^\p{Lu}+$/u.test(first)) && frequencyCache[second] >= 1000 ? `${first}${dash}${second}` : `${first}${second}`)
            .replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/([-‐-―])\n(?=[^\n])/g, '$1')
            .replace(/(?<![.!?…:]["')\]]*)\n\n(?=\p{Ll})/gu, ' ')
            .replace(/(?<!(?:[.!?…:]["')\]]*|\n))\n(?!\n)/g, ' ')
            .trim()
            .replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\](?=\s*[.!?…](?:\s|$|["')\]])|[ \t]*(?:\n\s*\n|$))/g, '[Citation $1]')
            .replace(/(?<=[.!?…]["')]?)\[(\d+(?:\s*[,–-]\s*\d+)*)\](?=\s|$)/g, '[Citation $1]');

        const bulletPattern = /^[•◦▪▫●○■□‣⁃∙·]\s*/;
        let bullet = 0;
        text = text
            .split(/\n{2,}/)
            .map(paragraph => {
                bullet = bulletPattern.test(paragraph) ? bullet + 1 : 0;
                return bullet ? paragraph.replace(bulletPattern, `Bullet ${bullet}: `) : paragraph;
            })
            .join('\n\n');

        if (!text) throw new Error('No text found in file');
        currentFileName = event.target.files[0].name;
        textContent.value = text;
        textContent.setSelectionRange(0, 0);
        updateDisplay();
        updateProgress();
        playPauseBtn.disabled = false;
        audioToggle.disabled = false;
        downloadAudioBtn.disabled = false;
        startReadingBtn.disabled = false;
        saveFileState();

        updateTextareaReadonlyState();
    } catch (error) {
        console.error('Error reading file:', error);
        currentWordDisplay.textContent = `Error reading file: ${error.message || 'unknown error'}`;
    }
});

const playPauseBtn = document.getElementById('playPauseBtn');
playPauseBtn.addEventListener('click', togglePlayPause);

const speedSlider = document.getElementById('speedSlider');
speedSlider.addEventListener('input', () => {
    speedValue.textContent = speedSlider.value;
    audio.playbackRate = parseInt(speedSlider.value) / 200;
    if (isPlaying && !isAudioEnabled) {
        stopReading();
        startReading();
    }
    saveSettings();
});

const audioToggle = document.getElementById('audioToggle');
audioToggle.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    audioToggle.querySelector('.material-icons').textContent = isAudioEnabled ? 'volume_up' : 'volume_off';

    if (isPlaying) {
        stopReading();
        startReading();
    }
    saveSettings();
});

const darkModeToggle = document.getElementById('darkModeToggle');
darkModeToggle.addEventListener('click', () => toggleDarkMode());

const textContent = document.getElementById('textContent');
textContent.addEventListener('click', () => {
    updateDisplay();
    updateProgress();
    saveFileState();
    if (isPlaying) {
        stopReading();
        startReading();
    }
});
textContent.addEventListener('input', () => {
    startReadingBtn.disabled = textContent.value.trim().length === 0;

    updateTextareaReadonlyState();
});

const startReadingBtn = document.getElementById('startReadingBtn');
startReadingBtn.addEventListener('click', () => {
    if (!textContent.value.trim()) return;

    textContent.value = textContent.value.trim();
    currentFileName ??= 'Manual Input';
    textContent.setSelectionRange(0, 0);
    updateDisplay();
    updateProgress();
    playPauseBtn.disabled = false;
    audioToggle.disabled = false;
    downloadAudioBtn.disabled = false;
    saveFileState();

    if (isPlaying) {
        stopReading();
        startReading();
    }
    else togglePlayPause();
});

const voice1 = document.getElementById('voice1');
voice1.addEventListener('change', saveSettings);

const voice2 = document.getElementById('voice2');
voice2.addEventListener('change', saveSettings);

const downloadAudioBtn = document.getElementById('downloadAudioBtn');
downloadAudioBtn.addEventListener('click', async () => {
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
        link.download = `${currentFileName?.replace(/\.[^.]+$/, '') || 'read-aloud'}.wav`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        generationStatus.textContent = 'Done. Download started.';
    } catch (error) {
        console.error('Error generating audio:', error);
        generationStatus.textContent = `Error generating audio: ${error.message || 'unknown error'}`;
    } finally {
        downloadAudioBtn.disabled = false;
    }
});

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
    startReadingBtn.disabled = false;

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

    intervalId = setInterval(() => {
        if (!/\S/.test(textContent.value.slice(textContent.selectionEnd))) return togglePlayPause();

        textContent.setSelectionRange(textContent.selectionEnd + 1, textContent.selectionEnd + 1);
        updateDisplay();
        updateProgress();
        saveFileState();
    }, 60 * 1000 / parseInt(speedSlider.value));
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

function updateDisplay() {
    const wordPattern = /\S+/g;
    wordPattern.lastIndex = textContent.selectionStart - textContent.value.slice(0, textContent.selectionStart).match(/\S*$/)[0].length;
    const match = wordPattern.exec(textContent.value);

    currentWordDisplay.textContent = match ? match[0] : 'Upload a text file to begin';

    if (match) textContent.setSelectionRange(match.index, match.index + match[0].length);
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
        audio.onended = () => {
            if (token !== speechToken) return;

            clearInterval(intervalId);
            if (paragraph.next === -1) return togglePlayPause();

            speakFrom(paragraph.next);
        };
        await audio.play();
        if (token !== speechToken) return;

        intervalId = setInterval(() => {
            if (!audio.duration) return;

            const position = Math.min(paragraph.end - 1, offset + Math.floor(audio.currentTime / audio.duration * (paragraph.end - offset)));
            textContent.setSelectionRange(position, position);
            updateDisplay();
            updateProgress();
        }, 100);
        prefetch = paragraph.next === -1 ? null : { offset: paragraph.next, promise: synthesize(getParagraph(paragraph.next)) };
    } catch (error) {
        if (token !== speechToken) return;
        console.error('Error generating audio:', error);
        currentWordDisplay.textContent = `Error generating audio: ${error.message || 'unknown error'}`;
        togglePlayPause();
    }
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
