class FastReader {
    constructor() {
        this.words = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.intervalId = null;
        this.speechSynthesis = window.speechSynthesis;
        this.utterance = null;
        this.isAudioEnabled = false;
        this.fullText = '';
        this.currentFileName = '';
        this.loadedLibs = {};

        // DOM elements
        this.fileInput = document.getElementById('fileInput');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.currentWordDisplay = document.getElementById('currentWord');
        this.audioToggle = document.getElementById('audioToggle');
        this.darkModeToggle = document.getElementById('darkModeToggle');
        this.textContent = document.getElementById('textContent');
        this.startPosition = document.getElementById('startPosition');
        this.progressBar = document.getElementById('readingProgress');
        this.wordCount = document.getElementById('wordCount');
        this.timeRemaining = document.getElementById('timeRemaining');
        this.startReadingBtn = document.getElementById('startReadingBtn');

        // Event listeners
        this.fileInput.addEventListener('change', this.handleFileUpload.bind(this));
        this.playPauseBtn.addEventListener('click', this.togglePlayPause.bind(this));
        this.speedSlider.addEventListener('input', this.updateSpeed.bind(this));
        this.audioToggle.addEventListener('click', this.handleAudioToggle.bind(this));
        this.darkModeToggle.addEventListener('click', this.toggleDarkMode.bind(this));
        this.startPosition.addEventListener('change', this.handleStartPositionChange.bind(this));
        this.textContent.addEventListener('click', this.handleTextContentClick.bind(this));
        this.textContent.addEventListener('input', this.handleTextInput.bind(this));
        this.startReadingBtn.addEventListener('click', this.handleStartReading.bind(this));

        // Disable controls initially
        this.playPauseBtn.disabled = true;
        this.audioToggle.disabled = true;
        this.startPosition.disabled = true;

        // Initialize states
        this.loadSavedStates();
    }

    loadSavedStates() {
        // Load general settings
        const savedSettings = JSON.parse(localStorage.getItem('fastReaderSettings') || '{}');

        // Restore speed
        if (savedSettings.speed) {
            this.speedSlider.value = savedSettings.speed;
            this.speedValue.textContent = savedSettings.speed;
        }

        // Restore audio state
        if (savedSettings.isAudioEnabled !== undefined) {
            this.isAudioEnabled = savedSettings.isAudioEnabled;
            this.audioToggle.querySelector('.material-icons').textContent =
                this.isAudioEnabled ? 'volume_up' : 'volume_off';
        }

        // Initialize dark mode
        this.initializeDarkMode();

        // Try to restore last opened file
        const lastFile = localStorage.getItem('fastReaderLastFile');
        if (lastFile) {
            this.restoreFileState(JSON.parse(lastFile));
        }
    }

    saveSettings() {
        localStorage.setItem('fastReaderSettings', JSON.stringify({
            speed: this.speedSlider.value,
            isAudioEnabled: this.isAudioEnabled,
            darkMode: document.body.classList.contains('dark-mode')
        }));
    }

    saveFileState() {
        if (!this.fullText) return;

        localStorage.setItem('fastReaderLastFile', JSON.stringify({
            name: this.currentFileName,
            text: this.fullText,
            currentIndex: this.currentIndex,
            timestamp: Date.now()
        }));
    }

    restoreFileState(fileData) {
        this.fullText = fileData.text;
        this.currentFileName = fileData.name;
        this.textContent.value = this.fullText;
        this.words = this.fullText.split(/\s+/).filter(word => word.length > 0);
        this.currentIndex = fileData.currentIndex || 0;
        this.updateDisplay();
        this.updateProgress();
        this.playPauseBtn.disabled = false;
        this.audioToggle.disabled = false;
        this.startPosition.disabled = false;

        // Update the start reading button to show it's ready
        this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
        this.startReadingBtn.textContent = 'Ready to Read';
        this.startReadingBtn.disabled = true;

        // Ensure textarea is editable after restoring file state
        this.updateTextareaReadonlyState();
    }

    initializeDarkMode() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedMode = localStorage.getItem('darkMode');

        if (savedMode === 'true' || (savedMode === null && prefersDark)) {
            document.body.classList.add('dark-mode');
            this.darkModeToggle.querySelector('.material-icons').textContent = 'dark_mode';
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (localStorage.getItem('darkMode') === null) {
                this.toggleDarkMode(null, e.matches);
            }
        });
    }

    toggleDarkMode(event, forcedState) {
        const isDark = forcedState !== undefined ? forcedState : !document.body.classList.contains('dark-mode');

        if (isDark) {
            document.body.classList.add('dark-mode');
            this.darkModeToggle.querySelector('.material-icons').textContent = 'dark_mode';
        } else {
            document.body.classList.remove('dark-mode');
            this.darkModeToggle.querySelector('.material-icons').textContent = 'light_mode';
        }

        localStorage.setItem('darkMode', isDark);
        this.saveSettings();
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.currentWordDisplay.textContent = 'Converting file...';
            this.fullText = await this.extractText(file);
            if (!this.fullText) throw new Error('No text found in file');
            this.currentFileName = file.name;
            this.textContent.value = this.fullText;
            this.words = this.fullText.split(/\s+/).filter(word => word.length > 0);
            this.currentIndex = 0;
            this.updateDisplay();
            this.updateProgress();
            this.playPauseBtn.disabled = false;
            this.audioToggle.disabled = false;
            this.startPosition.disabled = false;
            this.saveFileState();

            // Update the start reading button to show it's ready
            this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
            this.startReadingBtn.textContent = 'Ready to Read';
            this.startReadingBtn.disabled = true;

            // Ensure textarea is editable after file upload
            this.updateTextareaReadonlyState();
        } catch (error) {
            console.error('Error reading file:', error);
            this.currentWordDisplay.textContent = 'Error reading file: ' + (error.message || 'unknown error');
        }
    }

    handleStartPositionChange() {
        if (this.startPosition.value === 'cursor') {
            if (this.textContent.selectionStart > 0) {
                this.currentIndex = this.fullText.substring(0, this.textContent.selectionStart).split(/\s+/).filter(word => word.length > 0).length;
                this.updateDisplay();
                this.updateProgress();
                this.saveFileState();
            }
        } else {
            this.currentIndex = 0;
            this.updateDisplay();
            this.updateProgress();
            this.saveFileState();
        }
    }

    handleTextContentClick() {
        if (this.startPosition.value === 'cursor') {
            this.handleStartPositionChange();
        }
    }

    handleTextInput() {
        // Enable/disable the start reading button based on text content
        const hasText = this.textContent.value.trim().length > 0;
        this.startReadingBtn.disabled = !hasText;

        // Update button text based on whether we have text
        if (hasText) {
            this.startReadingBtn.querySelector('.material-icons').textContent = 'play_arrow';
        }

        // Ensure textarea is editable when user is typing
        this.updateTextareaReadonlyState();
    }

    handleStartReading() {
        const text = this.textContent.value.trim();
        if (!text) return;

        // Process the text similar to file upload
        this.fullText = text;
        this.currentFileName = 'Manual Input';
        this.words = this.fullText.split(/\s+/).filter(word => word.length > 0);
        this.currentIndex = 0;
        this.updateDisplay();
        this.updateProgress();
        this.playPauseBtn.disabled = false;
        this.audioToggle.disabled = false;
        this.startPosition.disabled = false;
        this.saveFileState();

        // Update the start reading button to show it's ready
        this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
        this.startReadingBtn.textContent = 'Ready to Read';
        this.startReadingBtn.disabled = true;

        // Ensure textarea is editable after processing text
        this.updateTextareaReadonlyState();
    }

    togglePlayPause() {
        if (this.words.length === 0) return;

        this.isPlaying = !this.isPlaying;
        this.playPauseBtn.querySelector('.material-icons').textContent =
            this.isPlaying ? 'pause' : 'play_arrow';

        if (this.isPlaying) {
            this.startReading();
        } else {
            this.stopReading();
        }

        // Update textarea readonly state
        this.updateTextareaReadonlyState();
    }

    startReading() {
        this.intervalId = setInterval(() => {
            this.displayNextWord();
        }, (60 * 1000) / parseInt(this.speedSlider.value));
    }

    stopReading() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.utterance) {
            this.speechSynthesis.cancel();
        }
    }

    displayNextWord() {
        if (this.currentIndex >= this.words.length) {
            this.currentIndex = 0;
        }

        this.updateDisplay();
        this.updateProgress();

        if (this.isAudioEnabled) {
            this.speakWord(this.words[this.currentIndex]);
        }

        this.currentIndex++;
        this.saveFileState();

        if (this.currentIndex >= this.words.length) {
            this.stopReading();
            this.isPlaying = false;
            this.playPauseBtn.querySelector('.material-icons').textContent = 'play_arrow';
            this.updateTextareaReadonlyState();
        }
    }

    updateDisplay() {
        this.currentWordDisplay.textContent = this.words[this.currentIndex] || 'Upload a text file to begin';

        // Highlight current word in textarea if possible
        if (this.words[this.currentIndex]) {
            const wordStart = this.fullText.indexOf(this.words[this.currentIndex]);
            if (wordStart >= 0) {
                this.textContent.setSelectionRange(wordStart, wordStart + this.words[this.currentIndex].length);
            }
        }
    }

    updateSpeed() {
        this.speedValue.textContent = this.speedSlider.value;
        if (this.isPlaying) {
            this.stopReading();
            this.startReading();
        }
        this.saveSettings();
    }

    speakWord(word) {
        if (this.utterance) {
            this.speechSynthesis.cancel();
        }
        this.utterance = new SpeechSynthesisUtterance(word);
        this.speechSynthesis.speak(this.utterance);
    }

    handleAudioToggle() {
        this.isAudioEnabled = !this.isAudioEnabled;
        this.audioToggle.querySelector('.material-icons').textContent =
            this.isAudioEnabled ? 'volume_up' : 'volume_off';

        if (!this.isAudioEnabled && this.utterance) {
            this.speechSynthesis.cancel();
        }
        this.saveSettings();
    }

    updateProgress() {
        if (this.words.length === 0) {
            this.progressBar.style.width = '0%';
            this.wordCount.textContent = '0/0 words';
            this.timeRemaining.textContent = '0:00';
            return;
        }

        this.progressBar.style.width = `${(this.currentIndex / this.words.length) * 100}%`;
        this.wordCount.textContent = `${this.currentIndex}/${this.words.length} words`;

        // Calculate time remaining
        const minutesRemaining = (this.words.length - this.currentIndex) / parseInt(this.speedSlider.value);
        const minutes = Math.floor(minutesRemaining);
        this.timeRemaining.textContent = `${minutes}:${Math.floor((minutesRemaining - minutes) * 60).toString().padStart(2, '0')}`;
    }

    updateTextareaReadonlyState() {
        // Make textarea readonly when reading, editable when paused/stopped
        this.textContent.readOnly = this.isPlaying;

        // Add visual feedback for readonly state
        if (this.isPlaying) {
            this.textContent.style.backgroundColor = 'var(--word-display-bg)';
            this.textContent.style.cursor = 'not-allowed';
        } else {
            this.textContent.style.backgroundColor = 'var(--textarea-bg)';
            this.textContent.style.cursor = 'text';
        }
    }

    loadLib(name) {
        if (!this.loadedLibs[name]) {
            this.loadedLibs[name] = new Promise(function (resolve, reject) {
                const script = document.createElement('script');
                script.src = {
                    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
                    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
                    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
                    cfb: 'https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js'
                }[name];
                script.onload = resolve;
                script.onerror = function () {
                    reject(new Error('Could not load converter library: ' + name));
                };
                document.head.appendChild(script);
            });
        }
        return this.loadedLibs[name];
    }

    decodeBytes(bytes, label) {
        try {
            return new TextDecoder(label || 'utf-8').decode(bytes);
        } catch (error) {
            return new TextDecoder('windows-1252').decode(bytes);
        }
    }

    collectXmlText(node, parts, blockTags) {
        if (node.nodeType === 3) {
            parts.push(node.nodeValue);
            return;
        }
        if (node.nodeType !== 1) return;
        const name = node.localName;
        if (name === 'tab') parts.push('\t');
        else if (name === 'line-break' || name === 'br') parts.push('\n');
        else if (name === 's') parts.push(' '.repeat(parseInt(node.getAttribute('text:c') || '1', 10)));
        for (const child of node.childNodes) {
            this.collectXmlText(child, parts, blockTags);
        }
        if (blockTags.has(name)) parts.push('\n');
    }

    async extractText(file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const head = this.decodeBytes(bytes.subarray(0, 8), 'windows-1252');
        let text;

        if (head.startsWith('%PDF')) {
            await this.loadLib('pdfjs');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
            const pages = [];
            for (let p = 1; p <= pdf.numPages; p++) {
                let line = '';
                for (const item of (await (await pdf.getPage(p)).getTextContent()).items) {
                    line += item.str + (item.hasEOL ? '\n' : ' ');
                }
                pages.push(line);
            }
            text = pages.join('\n\n');
        } else if (head.startsWith('{\\rtf')) {
            const src = this.decodeBytes(bytes, 'windows-1252');
            const out = [];
            const stack = [];
            let skip = false;
            let uc = 1;
            let skipChars = 0;
            let i = 0;

            while (i < src.length) {
                const c = src[i];
                if (c === '{') {
                    stack.push({ skip: skip, uc: uc });
                    i++;
                    if (src[i] === '\\' && src[i + 1] === '*') {
                        skip = true;
                    } else if (src[i] === '\\') {
                        const m = /^\\([a-zA-Z]+)/.exec(src.substr(i, 32));
                        if (m && new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object',
                            'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf',
                            'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl',
                            'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'private',
                            'revtbl', 'pgptbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend']).has(m[1])) skip = true;
                    }
                } else if (c === '}') {
                    const state = stack.pop();
                    if (state) {
                        skip = state.skip;
                        uc = state.uc;
                    }
                    i++;
                } else if (c === '\\') {
                    const next = src[i + 1];
                    if (next === undefined) break;
                    if (next === '\\' || next === '{' || next === '}') {
                        if (!skip) {
                            if (skipChars > 0) skipChars--;
                            else out.push(next);
                        }
                        i += 2;
                    } else if (next === "'") {
                        if (!skip) {
                            if (skipChars > 0) skipChars--;
                            else out.push(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(src.substr(i + 2, 2), 16) || 63])));
                        }
                        i += 4;
                    } else if (next === '~') {
                        if (!skip) out.push(' ');
                        i += 2;
                    } else if (next === '_') {
                        if (!skip) out.push('-');
                        i += 2;
                    } else if (next === '-' || next === '*' || next === ':' || next === '|') {
                        i += 2;
                    } else if (next === '\n' || next === '\r') {
                        if (!skip) out.push('\n');
                        i += 2;
                    } else {
                        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.substr(i, 40));
                        if (!m) {
                            i += 2;
                            continue;
                        }
                        i += m[0].length;
                        const param = m[2] !== undefined ? parseInt(m[2], 10) : undefined;
                        if (skip) continue;
                        switch (m[1]) {
                            case 'par': case 'line': case 'sect': case 'page': case 'row': out.push('\n'); break;
                            case 'tab': case 'cell': out.push('\t'); break;
                            case 'emdash': out.push('—'); break;
                            case 'endash': out.push('–'); break;
                            case 'lquote': out.push('‘'); break;
                            case 'rquote': out.push('’'); break;
                            case 'ldblquote': out.push('“'); break;
                            case 'rdblquote': out.push('”'); break;
                            case 'bullet': out.push('•'); break;
                            case 'uc': if (param !== undefined) uc = param; break;
                            case 'u':
                                if (param !== undefined) {
                                    out.push(String.fromCharCode(param < 0 ? param + 65536 : param));
                                    skipChars = uc;
                                }
                                break;
                        }
                    }
                } else if (c === '\n' || c === '\r') {
                    i++;
                } else {
                    if (!skip) {
                        if (skipChars > 0) skipChars--;
                        else out.push(c);
                    }
                    i++;
                }
            }
            text = out.join('');
        } else if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            await this.loadLib('jszip');
            const zip = await window.JSZip.loadAsync(buf);
            if (zip.file('content.xml') && zip.file('mimetype')) {
                const parts = [];
                this.collectXmlText(new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml').documentElement, parts, new Set(['p', 'h', 'list-item', 'table-row']));
                text = parts.join('');
            } else if (zip.file('word/document.xml')) {
                await this.loadLib('mammoth');
                text = (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
            } else {
                throw new Error('Unsupported file format: ' + file.name);
            }
        } else if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
            await this.loadLib('cfb');
            const container = window.CFB.read(bytes, { type: 'array' });
            const wordEntry = window.CFB.find(container, 'WordDocument');
            if (!wordEntry) throw new Error('Not a valid Word .doc file');
            const wd = new Uint8Array(wordEntry.content);
            const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
            const tableEntry = window.CFB.find(container, (dv.getUint16(0x0A, true) & 0x0200) ? '1Table' : '0Table');
            if (!tableEntry) throw new Error('Word table stream missing');
            const tbl = new Uint8Array(tableEntry.content);
            const tdv = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
            const ccpText = dv.getInt32(0x4C, true);
            const fcClx = dv.getUint32(0x01A2, true);

            text = '';
            try {
                let p = fcClx;
                while (p < fcClx + dv.getUint32(0x01A6, true) &&tbl[p] === 0x01) p += 3 + tdv.getUint16(p + 1, true);
                if (tbl[p] !== 0x02) throw new Error('No piece table');
                const pieces = (tdv.getUint32(p + 1, true) - 4) / 12;
                p += 5;
                const cps = [];
                for (let k = 0; k <= pieces; k++) cps.push(tdv.getUint32(p + k * 4, true));
                for (let k = 0; k < pieces; k++) {
                    const fcRaw = tdv.getUint32(p + (pieces + 1) * 4 + k * 8 + 2, true);
                    const fc = fcRaw & 0x3FFFFFFF;
                    let len = cps[k + 1] - cps[k];
                    if (cps[k] >= ccpText) break;
                    if (cps[k] + len > ccpText) len = ccpText - cps[k];
                    if (fcRaw & 0x40000000) {
                        const offset = fc >> 1;
                        text += this.decodeBytes(wd.subarray(offset, offset + len), 'windows-1252');
                    } else {
                        text += this.decodeBytes(wd.subarray(fc, fc + len * 2), 'utf-16le');
                    }
                }
            } catch (error) {
                text = this.decodeBytes(wd.subarray(0x200), 'windows-1252');
            }
            text = text
                .replace(/\u0013[^\u0014\u0015]*\u0014/g, '')
                .replace(/[\u0013\u0014\u0015]/g, '')
                .replace(/\u0007/g, '\t')
                .replace(/[\u000B\u000C]/g, '\n')
                .replace(/\u0001|\u0008/g, '');
        } else if (ext === 'wri') {
            const end = Math.min(new DataView(buf).getUint32(0x0E, true) || buf.byteLength, buf.byteLength);
            text = this.decodeBytes(bytes.subarray(0x80, Math.max(0x80, end)), 'windows-1252')
                .replace(/\u000C/g, '\n');
        } else if (ext === 'rtfd') {
            throw new Error('RTFD is a folder bundle. Choose the TXT.rtf file inside it.');
        } else if (['pdf', 'doc', 'docx', 'odt'].includes(ext)) {
            throw new Error('Could not read this ' + ext.toUpperCase() + ' file.');
        } else {
            text = this.decodeBytes(bytes);
        }

        return text
            .replace(/\r\n?/g, '\n')
            .replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, '')
            .replace(/[ \t ]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => new FastReader()); 