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

        // Event listeners
        this.fileInput.addEventListener('change', this.handleFileUpload.bind(this));
        this.playPauseBtn.addEventListener('click', this.togglePlayPause.bind(this));
        this.speedSlider.addEventListener('input', this.updateSpeed.bind(this));
        this.audioToggle.addEventListener('click', this.handleAudioToggle.bind(this));
        this.darkModeToggle.addEventListener('click', this.toggleDarkMode.bind(this));
        this.startPosition.addEventListener('change', this.handleStartPositionChange.bind(this));
        this.textContent.addEventListener('click', this.handleTextContentClick.bind(this));

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
            const fileData = JSON.parse(lastFile);
            this.restoreFileState(fileData);
        }
    }

    saveSettings() {
        const settings = {
            speed: this.speedSlider.value,
            isAudioEnabled: this.isAudioEnabled,
            darkMode: document.body.classList.contains('dark-mode')
        };
        localStorage.setItem('fastReaderSettings', JSON.stringify(settings));
    }

    saveFileState() {
        if (!this.fullText) return;

        const fileState = {
            name: this.currentFileName,
            text: this.fullText,
            currentIndex: this.currentIndex,
            timestamp: Date.now()
        };
        localStorage.setItem('fastReaderLastFile', JSON.stringify(fileState));
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
            this.fullText = await file.text();
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
        } catch (error) {
            console.error('Error reading file:', error);
            this.currentWordDisplay.textContent = 'Error reading file';
        }
    }

    handleStartPositionChange() {
        if (this.startPosition.value === 'cursor') {
            const selection = this.textContent.selectionStart;
            if (selection > 0) {
                const textUpToSelection = this.fullText.substring(0, selection);
                this.currentIndex = textUpToSelection.split(/\s+/).filter(word => word.length > 0).length;
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
    }

    startReading() {
        const wordsPerMinute = parseInt(this.speedSlider.value);
        const msPerWord = (60 * 1000) / wordsPerMinute;

        this.intervalId = setInterval(() => {
            this.displayNextWord();
        }, msPerWord);
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

        const progress = (this.currentIndex / this.words.length) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.wordCount.textContent = `${this.currentIndex}/${this.words.length} words`;

        // Calculate time remaining
        const wordsRemaining = this.words.length - this.currentIndex;
        const wordsPerMinute = parseInt(this.speedSlider.value);
        const minutesRemaining = wordsRemaining / wordsPerMinute;
        const minutes = Math.floor(minutesRemaining);
        const seconds = Math.floor((minutesRemaining - minutes) * 60);
        this.timeRemaining.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new FastReader();
}); 