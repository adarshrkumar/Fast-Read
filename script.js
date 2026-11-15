class FastReader {
    constructor() {
        this.isPlaying = false;
        this.intervalId = null;
        this.audio = new Audio();
        this.ttsModule = null;
        this.prefetch = null;
        this.frequencyCache = {};
        this.isAudioEnabled = false;
        this.currentFileName = '';
        this.loadedLibs = {};
        this.speechToken = 0;

        this.fileInput = document.getElementById('fileInput');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.currentWordDisplay = document.getElementById('currentWord');
        this.audioToggle = document.getElementById('audioToggle');
        this.darkModeToggle = document.getElementById('darkModeToggle');
        this.textContent = document.getElementById('textContent');
        this.progressBar = document.getElementById('readingProgress');
        this.wordCount = document.getElementById('wordCount');
        this.timeRemaining = document.getElementById('timeRemaining');
        this.startReadingBtn = document.getElementById('startReadingBtn');
        this.voice1 = document.getElementById('voice1');
        this.voice2 = document.getElementById('voice2');
        this.downloadAudioBtn = document.getElementById('downloadAudioBtn');
        this.generationContainer = document.getElementById('generationContainer');
        this.generationProgress = document.getElementById('generationProgress');
        this.generationStatus = document.getElementById('generationStatus');

        this.fileInput.addEventListener('change', this.handleFileUpload.bind(this));
        this.playPauseBtn.addEventListener('click', this.togglePlayPause.bind(this));
        this.speedSlider.addEventListener('input', this.updateSpeed.bind(this));
        this.audioToggle.addEventListener('click', this.handleAudioToggle.bind(this));
        this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
        this.textContent.addEventListener('click', this.handleTextContentClick.bind(this));
        this.textContent.addEventListener('input', this.handleTextInput.bind(this));
        this.startReadingBtn.addEventListener('click', this.handleStartReading.bind(this));
        this.voice1.addEventListener('change', this.saveSettings.bind(this));
        this.voice2.addEventListener('change', this.saveSettings.bind(this));
        this.downloadAudioBtn.addEventListener('click', this.downloadAudio.bind(this));

        this.playPauseBtn.disabled = true;
        this.audioToggle.disabled = true;
        this.downloadAudioBtn.disabled = true;

        this.loadSavedStates();
    }

    loadSavedStates() {
        const savedSettings = JSON.parse(localStorage.getItem('fastReaderSettings') || '{}');

        if (savedSettings.speed) {
            this.speedSlider.value = savedSettings.speed;
            this.speedValue.textContent = savedSettings.speed;
        }

        if (savedSettings.isAudioEnabled !== undefined) {
            this.isAudioEnabled = savedSettings.isAudioEnabled;
            this.audioToggle.querySelector('.material-icons').textContent = this.isAudioEnabled ? 'volume_up' : 'volume_off';
        }

        this.initializeDarkMode();
        this.populateVoices();

        const lastFile = localStorage.getItem('fastReaderLastFile');
        if (lastFile) this.restoreFileState(JSON.parse(lastFile));
    }

    saveSettings() {
        localStorage.setItem('fastReaderSettings', JSON.stringify({
            speed: this.speedSlider.value,
            isAudioEnabled: this.isAudioEnabled,
            darkMode: document.body.classList.contains('dark-mode'),
            voice1: this.voice1.value,
            voice2: this.voice2.value
        }));
    }

    saveFileState() {
        if (!this.textContent.value) return;

        localStorage.setItem('fastReaderLastFile', JSON.stringify({
            name: this.currentFileName,
            text: this.textContent.value,
            selectionStart: this.textContent.selectionStart,
            timestamp: Date.now()
        }));
    }

    restoreFileState(fileData) {
        this.currentFileName = fileData.name;
        this.textContent.value = fileData.text;
        this.textContent.setSelectionRange(fileData.selectionStart || 0, fileData.selectionStart || 0);
        this.updateDisplay();
        this.updateProgress();
        this.playPauseBtn.disabled = false;
        this.audioToggle.disabled = false;
        this.downloadAudioBtn.disabled = false;

        this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
        this.startReadingBtn.textContent = 'Ready to Read';
        this.startReadingBtn.disabled = true;

        this.updateTextareaReadonlyState();
    }

    initializeDarkMode() {
        const savedMode = localStorage.getItem('darkMode');

        if (savedMode === 'true' || savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-mode');
            this.darkModeToggle.querySelector('.material-icons').textContent = 'dark_mode';
        }

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem('darkMode') === null) this.toggleDarkMode(e.matches);
        });
    }

    toggleDarkMode(forcedState) {
        document.body.classList.toggle('dark-mode', forcedState);
        this.darkModeToggle.querySelector('.material-icons').textContent = document.body.classList.contains('dark-mode') ? 'dark_mode' : 'light_mode';

        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        this.saveSettings();
    }

    async handleFileUpload(event) {
        if (!event.target.files[0]) return;

        try {
            this.currentWordDisplay.textContent = 'Converting file...';
            const text = await this.extractText(event.target.files[0]);
            if (!text) throw new Error('No text found in file');
            this.currentFileName = event.target.files[0].name;
            this.textContent.value = text;
            this.textContent.setSelectionRange(0, 0);
            this.updateDisplay();
            this.updateProgress();
            this.playPauseBtn.disabled = false;
            this.audioToggle.disabled = false;
            this.downloadAudioBtn.disabled = false;
            this.saveFileState();

            this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
            this.startReadingBtn.textContent = 'Ready to Read';
            this.startReadingBtn.disabled = true;

            this.updateTextareaReadonlyState();
        } catch (error) {
            console.error('Error reading file:', error);
            this.currentWordDisplay.textContent = 'Error reading file: ' + (error.message || 'unknown error');
        }
    }

    handleTextContentClick() {
        this.updateDisplay();
        this.updateProgress();
        this.saveFileState();
        if (this.isPlaying) {
            this.stopReading();
            this.startReading();
        }
    }

    handleTextInput() {
        this.startReadingBtn.disabled = this.textContent.value.trim().length === 0;

        if (this.textContent.value.trim().length > 0) this.startReadingBtn.querySelector('.material-icons').textContent = 'play_arrow';

        this.updateTextareaReadonlyState();
    }

    handleStartReading() {
        if (!this.textContent.value.trim()) return;

        this.textContent.value = this.textContent.value.trim();
        this.currentFileName = 'Manual Input';
        this.textContent.setSelectionRange(0, 0);
        this.updateDisplay();
        this.updateProgress();
        this.playPauseBtn.disabled = false;
        this.audioToggle.disabled = false;
        this.downloadAudioBtn.disabled = false;
        this.saveFileState();

        this.startReadingBtn.querySelector('.material-icons').textContent = 'check';
        this.startReadingBtn.textContent = 'Ready to Read';
        this.startReadingBtn.disabled = true;

        this.updateTextareaReadonlyState();
    }

    togglePlayPause() {
        if (!/\S/.test(this.textContent.value)) return;

        this.isPlaying = !this.isPlaying;
        this.playPauseBtn.querySelector('.material-icons').textContent = this.isPlaying ? 'pause' : 'play_arrow';

        if (this.isPlaying) {
            if (!/\S/.test(this.textContent.value.slice(this.textContent.selectionEnd))) {
                this.textContent.setSelectionRange(0, 0);
                this.updateDisplay();
            }
            this.startReading();
        }
        else {
            this.stopReading();
        }

        this.updateTextareaReadonlyState();
    }

    startReading() {
        if (this.isAudioEnabled) {
            this.speakFrom(this.textContent.selectionStart);
            return;
        }

        this.intervalId = setInterval(() => this.displayNextWord(), 60 * 1000 / parseInt(this.speedSlider.value));
    }

    stopReading() {
        this.speechToken++;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.audio.pause();
        this.prefetch = null;
        this.saveFileState();
    }

    displayNextWord() {
        if (!/\S/.test(this.textContent.value.slice(this.textContent.selectionEnd))) return this.togglePlayPause();

        this.textContent.setSelectionRange(this.textContent.selectionEnd + 1, this.textContent.selectionEnd + 1);
        this.updateDisplay();
        this.updateProgress();
        this.saveFileState();
    }

    updateDisplay() {
        const wordPattern = /\S+/g;
        wordPattern.lastIndex = this.textContent.selectionStart - this.textContent.value.slice(0, this.textContent.selectionStart).match(/\S*$/)[0].length;
        const match = wordPattern.exec(this.textContent.value);

        this.currentWordDisplay.textContent = match ? match[0] : 'Upload a text file to begin';

        if (match) this.textContent.setSelectionRange(match.index, match.index + match[0].length);
    }

    updateSpeed() {
        this.speedValue.textContent = this.speedSlider.value;
        this.audio.playbackRate = parseInt(this.speedSlider.value) / 200;
        if (this.isPlaying && !this.isAudioEnabled) {
            this.stopReading();
            this.startReading();
        }
        this.saveSettings();
    }

    loadTts() {
        return this.ttsModule ||= import('https://esm.sh/@diffusionstudio/vits-web@1.0.3').catch(error => {
            this.ttsModule = null;
            throw error;
        });
    }

    async lookupFrequency(word) {
        if (word in this.frequencyCache) return;

        try {
            const [entry] = await (await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`)).json();
            this.frequencyCache[word] = entry && entry.word.toLowerCase() === word.toLowerCase() ? parseFloat((entry.tags?.find(tag => tag.startsWith('f:')) || 'f:0').slice(2)) : 0;
        } catch {
            this.frequencyCache[word] = 0;
        }
    }

    getParagraph(offset) {
        const length = this.textContent.value.slice(offset).search(/\n\s*\n/);
        const end = length === -1 ? this.textContent.value.length : offset + length;
        const gap = this.textContent.value.slice(end).search(/\S/);

        return {
            end: end,
            next: gap === -1 ? -1 : end + gap,
            text: this.textContent.value.slice(offset, end).replace(/\s+/g, ' ').trim(),
            voice: (this.textContent.value.slice(0, offset).trimStart().split(/\n\s*\n/).length % 2 === 1 ? this.voice1 : this.voice2).value
        };
    }

    synthesize(paragraph, onProgress) {
        return this.loadTts().then(tts => tts.predict({ text: paragraph.text, voiceId: paragraph.voice }, onProgress));
    }

    async speakFrom(offset) {
        const token = ++this.speechToken;
        const paragraph = this.getParagraph(offset);

        try {
            this.currentWordDisplay.textContent = 'Generating audio...';
            await (this.prefetch && this.prefetch.offset === offset ? this.prefetch.promise : this.synthesize(paragraph, progress => this.currentWordDisplay.textContent = `Downloading voice ${Math.round(progress.loaded * 100 / progress.total)}%`)).then(blob => {
                if (token !== this.speechToken) return;
                URL.revokeObjectURL(this.audio.src);
                this.audio.src = URL.createObjectURL(blob);
            });
            if (token !== this.speechToken) return;

            this.audio.playbackRate = parseInt(this.speedSlider.value) / 200;
            this.audio.onended = () => this.handleSpeechEnd(token, paragraph);
            await this.audio.play();
            if (token !== this.speechToken) return;

            this.intervalId = setInterval(() => this.syncWord(offset, paragraph.end), 100);
            this.prefetch = paragraph.next === -1 ? null : { offset: paragraph.next, promise: this.synthesize(this.getParagraph(paragraph.next)) };
        } catch (error) {
            if (token !== this.speechToken) return;
            console.error('Error generating audio:', error);
            this.currentWordDisplay.textContent = 'Error generating audio: ' + (error.message || 'unknown error');
            this.togglePlayPause();
        }
    }

    syncWord(start, end) {
        if (!this.audio.duration) return;

        const position = Math.min(end - 1, start + Math.floor(this.audio.currentTime / this.audio.duration * (end - start)));
        this.textContent.setSelectionRange(position, position);
        this.updateDisplay();
        this.updateProgress();
    }

    handleSpeechEnd(token, paragraph) {
        if (token !== this.speechToken) return;

        clearInterval(this.intervalId);
        if (paragraph.next === -1) return this.togglePlayPause();

        this.speakFrom(paragraph.next);
    }

    async populateVoices() {
        try {
            const voices = await (await this.loadTts()).voices();

            for (const [index, select] of [this.voice1, this.voice2].entries()) {
                select.replaceChildren();
                for (const voice of voices) {
                    const option = document.createElement('option');
                    option.value = voice.key;
                    option.textContent = `${voice.language.name_english} (${voice.language.country_english}) - ${voice.name} (${voice.quality})`;
                    select.appendChild(option);
                }
                select.value = JSON.parse(localStorage.getItem('fastReaderSettings') || '{}')['voice' + (index + 1)] || ['en_US-hfc_female-medium', 'en_US-hfc_male-medium'][index];
                if (!select.value) select.value = voices[Math.min(index, voices.length - 1)].key;
            }
        } catch (error) {
            console.error('Error loading voices:', error);
        }
    }

    async downloadAudio() {
        if (!/\S/.test(this.textContent.value)) return;

        this.downloadAudioBtn.disabled = true;
        this.generationContainer.hidden = false;
        this.generationProgress.style.width = '0%';
        this.generationStatus.textContent = 'Generating audio... 0%';

        try {
            const sampleRate = 22050;
            const context = new AudioContext({ sampleRate: sampleRate });
            const chunks = [];
            let offset = this.textContent.value.search(/\S/);

            while (offset !== -1) {
                const paragraph = this.getParagraph(offset);
                chunks.push(Int16Array.from((await context.decodeAudioData(await (await this.synthesize(paragraph, progress => this.generationStatus.textContent = `Downloading voice ${Math.round(progress.loaded * 100 / progress.total)}%`)).arrayBuffer())).getChannelData(0), sample => Math.max(-1, Math.min(1, sample)) * 32767), new Int16Array(Math.round(sampleRate * 0.4)));
                const percent = Math.round(paragraph.end / this.textContent.value.length * 100);
                this.generationProgress.style.width = `${percent}%`;
                this.generationStatus.textContent = `Generating audio... ${percent}%`;
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
            link.download = (this.currentFileName.replace(/\.[^.]+$/, '') || 'read-aloud') + '.wav';
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 60000);
            this.generationStatus.textContent = 'Done. Download started.';
        } catch (error) {
            console.error('Error generating audio:', error);
            this.generationStatus.textContent = 'Error generating audio: ' + (error.message || 'unknown error');
        } finally {
            this.downloadAudioBtn.disabled = false;
        }
    }

    handleAudioToggle() {
        this.isAudioEnabled = !this.isAudioEnabled;
        this.audioToggle.querySelector('.material-icons').textContent = this.isAudioEnabled ? 'volume_up' : 'volume_off';

        if (this.isPlaying) {
            this.stopReading();
            this.startReading();
        }
        this.saveSettings();
    }

    updateProgress() {
        const total = (this.textContent.value.match(/\S+/g) || []).length;
        if (total === 0) {
            this.progressBar.style.width = '0%';
            this.wordCount.textContent = '0/0 words';
            this.timeRemaining.textContent = '0:00';
            return;
        }

        const read = (this.textContent.value.slice(0, this.textContent.selectionStart).match(/\S+/g) || []).length;
        this.progressBar.style.width = `${read / total * 100}%`;
        this.wordCount.textContent = `${read}/${total} words`;

        const minutesRemaining = (total - read) / parseInt(this.speedSlider.value);
        const minutes = Math.floor(minutesRemaining);
        this.timeRemaining.textContent = `${minutes}:${Math.floor((minutesRemaining - minutes) * 60).toString().padStart(2, '0')}`;
    }

    updateTextareaReadonlyState() {
        this.textContent.readOnly = this.isPlaying;

        if (this.isPlaying) {
            this.textContent.style.backgroundColor = 'var(--word-display-bg)';
            this.textContent.style.cursor = 'not-allowed';
        }
        else {
            this.textContent.style.backgroundColor = 'var(--textarea-bg)';
            this.textContent.style.cursor = 'text';
        }
    }

    loadLib(name) {
        if (!this.loadedLibs[name]) {
            this.loadedLibs[name] = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = {
                    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
                    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
                    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
                    cfb: 'https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js'
                }[name];
                script.onload = resolve;
                script.onerror = () => reject(new Error('Could not load converter library: ' + name));
                document.head.appendChild(script);
            });
        }
        return this.loadedLibs[name];
    }

    decodeBytes(bytes, label) {
        try {
            return new TextDecoder(label || 'utf-8').decode(bytes);
        } catch {
            return new TextDecoder('windows-1252').decode(bytes);
        }
    }

    collectXmlText(node, parts, blockTags) {
        if (node.nodeType === 3) {
            parts.push(node.nodeValue);
            return;
        }
        if (node.nodeType !== 1) return;
        if (node.localName === 'tab') parts.push('\t');
        else if (node.localName === 'line-break' || node.localName === 'br') parts.push('\n');
        else if (node.localName === 's') parts.push(' '.repeat(parseInt(node.getAttribute('text:c') || '1', 10)));
        for (const child of node.childNodes) {
            this.collectXmlText(child, parts, blockTags);
        }
        if (blockTags.has(node.localName)) parts.push('\n');
    }

    async extractText(file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const head = this.decodeBytes(bytes.subarray(0, 8), 'windows-1252');
        let text;

        if (head.startsWith('%PDF')) {
            await this.loadLib('pdfjs');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
            const pages = [];
            for (let p = 1; p <= pdf.numPages; p++) {
                let line = '';
                for (const item of (await (await pdf.getPage(p)).getTextContent()).items) line += item.str + (item.hasEOL ? '\n' : ' ');
                pages.push(line);
            }
            text = pages.join('\n\n');
        }
        else if (head.startsWith('{\\rtf')) {
            const src = this.decodeBytes(bytes, 'windows-1252');
            const out = [];
            const stack = [];
            let skip = false;
            let uc = 1;
            let skipChars = 0;
            let i = 0;

            while (i < src.length) {
                if (src[i] === '{') {
                    stack.push({ skip: skip, uc: uc });
                    i++;
                    if (src[i] === '\\' && src[i + 1] === '*') skip = true;
                    else if (src[i] === '\\') {
                        const m = /^\\([a-zA-Z]+)/.exec(src.slice(i, i + 32));
                        if (m && new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'private', 'revtbl', 'pgptbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend']).has(m[1])) skip = true;
                    }
                }
                else if (src[i] === '}') {
                    const state = stack.pop();
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
                            else out.push(src[i + 1]);
                        }
                        i += 2;
                    }
                    else if (src[i + 1] === "'") {
                        if (!skip) {
                            if (skipChars > 0) skipChars--;
                            else out.push(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(src.slice(i + 2, i + 4), 16) || 63])));
                        }
                        i += 4;
                    }
                    else if (src[i + 1] === '~') {
                        if (!skip) out.push(' ');
                        i += 2;
                    }
                    else if (src[i + 1] === '_') {
                        if (!skip) out.push('-');
                        i += 2;
                    }
                    else if (src[i + 1] === '-' || src[i + 1] === '*' || src[i + 1] === ':' || src[i + 1] === '|') {
                        i += 2;
                    }
                    else if (src[i + 1] === '\n' || src[i + 1] === '\r') {
                        if (!skip) out.push('\n');
                        i += 2;
                    }
                    else {
                        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
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
                }
                else if (src[i] === '\n' || src[i] === '\r') i++;
                else {
                    if (!skip) {
                        if (skipChars > 0) skipChars--;
                        else out.push(src[i]);
                    }
                    i++;
                }
            }
            text = out.join('');
        }
        else if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            await this.loadLib('jszip');
            const zip = await window.JSZip.loadAsync(buf);
            if (zip.file('content.xml') && zip.file('mimetype')) {
                const parts = [];
                this.collectXmlText(new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml').documentElement, parts, new Set(['p', 'h', 'list-item', 'table-row']));
                text = parts.join('');
            }
            else if (zip.file('word/document.xml')) {
                await this.loadLib('mammoth');
                text = (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
            }
            else throw new Error('Unsupported file format: ' + file.name);
        }
        else if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
            await this.loadLib('cfb');
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
                    }
                    else text += this.decodeBytes(wd.subarray(fc, fc + len * 2), 'utf-16le');
                }
            } catch {
                text = this.decodeBytes(wd.subarray(0x200), 'windows-1252');
            }
            text = text.replace(/\u0013[^\u0014\u0015]*\u0014/g, '').replace(/[\u0013\u0014\u0015]/g, '').replace(/\u0007/g, '\t').replace(/[\u000B\u000C]/g, '\n').replace(/\u0001|\u0008/g, '');
        }
        else if (ext === 'wri') {
            text = this.decodeBytes(bytes.subarray(0x80, Math.max(0x80, Math.min(new DataView(buf).getUint32(0x0E, true) || buf.byteLength, buf.byteLength))), 'windows-1252').replace(/\u000C/g, '\n');
        }
        else if (ext === 'rtfd') throw new Error('RTFD is a folder bundle. Choose the TXT.rtf file inside it.');
        else if (['pdf', 'doc', 'docx', 'odt'].includes(ext)) throw new Error('Could not read this ' + ext.toUpperCase() + ' file.');
        else text = this.decodeBytes(bytes);

        const hyphenated = /(\p{L}+)([-‐-–])[ \t]*\r?\n(\p{L}+)/gu;
        const forms = [...new Set(Array.from(text.matchAll(hyphenated), match => [match[1] + match[3], match[1] + '-' + match[3]]).flat())];
        for (let index = 0; index < forms.length; index += 10) await Promise.all(forms.slice(index, index + 10).map(form => this.lookupFrequency(form)));
        text = text.replace(hyphenated, (_, first, dash, second) => this.frequencyCache[first + second] > this.frequencyCache[first + '-' + second] ? first + second : first + dash + second);

        return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, '').replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\xAD[ \t]*\n?/g, '').replace(/([-‐-―])\n(?=[^\n])/g, '$1').replace(/(?<!(?:[.!?…]["'”’)\]]*|\n))\n(?!\n)/g, ' ').trim();
    }
}

document.addEventListener('DOMContentLoaded', () => new FastReader()); 