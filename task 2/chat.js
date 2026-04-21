// Chat Application JavaScript

class ChatApp {
    constructor() {
        // DOM Elements
        this.loginSection = document.getElementById('loginSection');
        this.usernameInput = document.getElementById('usernameInput');
        this.joinBtn = document.getElementById('joinBtn');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.imageInput = document.getElementById('imageInput');
        this.sendImageBtn = document.getElementById('sendImageBtn');
        this.audioInput = document.getElementById('audioInput');
        this.sendAudioBtn = document.getElementById('sendAudioBtn');
        this.connectionStatus = document.getElementById('connectionStatus');

        // Chatbot elements
        this.botToggleBtn = document.getElementById('botToggleBtn');
        this.botPanel = document.getElementById('botPanel');
        this.botCloseBtn = document.getElementById('botCloseBtn');
        this.botMessagesContainer = document.getElementById('botMessagesContainer');
        this.botInput = document.getElementById('botInput');
        this.botSendBtn = document.getElementById('botSendBtn');

        // State
        this.username = null;
        this.messages = [];
        this.socket = null;
        this.isConnected = false;
        this.botConversation = [];
        this.dataset = [];
        this.datasetUrl = 'chatbot_dataset.json';

        // Initialize
        this.init();
    }

    init() {
        // Event Listeners
        this.joinBtn.addEventListener('click', () => this.joinChat());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinChat();
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        this.imageInput.addEventListener('change', () => this.handleImageSelection());
        this.sendImageBtn.addEventListener('click', () => this.sendImage());

        this.audioInput.addEventListener('change', () => this.handleAudioSelection());
        this.sendAudioBtn.addEventListener('click', () => this.sendAudio());

        this.botToggleBtn.addEventListener('click', () => this.openBotPanel());
        this.botCloseBtn.addEventListener('click', () => this.closeBotPanel());
        this.botSendBtn.addEventListener('click', () => this.askBot());
        this.botInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.askBot();
        });

        // Load chatbot dataset and messages from localStorage
        this.loadDataset();
        this.loadMessages();

        // Track how many messages have been rendered so far
        this.renderedCount = 0;

        // Listen for localStorage changes (fires in OTHER tabs when storage changes)
        window.addEventListener('storage', (e) => {
            if (e.key === 'chatMessages' && this.username) {
                this.messages = JSON.parse(e.newValue || '[]');
                this.appendNewMessages();
            }
        });

        // Poll every 800ms — safely appends only new messages, never wipes the screen
        this._syncInterval = setInterval(() => {
            if (!this.username) return;
            const stored = localStorage.getItem('chatMessages');
            if (!stored) return;
            const updated = JSON.parse(stored);
            if (updated.length > this.messages.length) {
                this.messages = updated;
                this.appendNewMessages();
            }
        }, 800);
    }

    joinChat() {
        const username = this.usernameInput.value.trim();
        
        if (!username) {
            alert('Please enter a name');
            return;
        }

        this.username = username;
        this.loginSection.classList.add('hidden');
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        this.messageInput.focus();

        // Load and display full chat history for this new user
        this.loadMessages();
        this.renderedCount = 0;
        this.appendNewMessages();

        // Add join message
        this.addSystemMessage(`${username} joined the chat`);

        // Try to connect to server (optional - falls back to local mode)
        this.connectToServer();
    }

    connectToServer() {
        // Try to connect to WebSocket server
        try {
            // Uncomment this if you upgrade your Python server to support WebSocket
            // this.socket = new WebSocket('ws://127.0.0.1:5000/socket.io/');
            
            // For now, working in local/offline mode
            this.setConnectionStatus(true);
        } catch (error) {
            console.log('Server not available - working in offline mode');
            this.setConnectionStatus(false);
        }
    }

    sendMessage() {
        const messageText = this.messageInput.value.trim();
        
        if (!messageText) return;

        // Create message object
        const message = {
            username: this.username,
            text: messageText,
            timestamp: new Date().toLocaleTimeString(),
            own: true
        };

        // Display message immediately for sender
        this.displayMessage(message);

        // Save to localStorage and update renderedCount so polling doesn't re-render it
        this.messages.push(message);
        this.renderedCount = this.messages.length;
        this.saveMessages();

        // Send to server if connected
        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(message));
        }

        // Clear input
        this.messageInput.value = '';
        this.messageInput.focus();
    }

    async sendImage() {
        const file = this.imageInput.files && this.imageInput.files[0];
        if (!file || !file.type.startsWith('image/')) {
            alert('Please choose a valid image file first.');
            return;
        }

        const imageMessage = await this.compressAndPrepareImage(file);
        if (!imageMessage) return;

        // Display image immediately for sender
        this.displayMessage(imageMessage);
        this.messages.push(imageMessage);
        this.renderedCount = this.messages.length;
        this.saveMessages();

        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(imageMessage));
        }

        this.imageInput.value = '';
        this.sendImageBtn.disabled = true;
        this.imageInput.blur();
    }

    handleImageSelection() {
        const file = this.imageInput.files && this.imageInput.files[0];
        const validImage = file && file.type.startsWith('image/');
        this.sendImageBtn.disabled = !validImage || !this.username;
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    /**
     * Encode pixel data to a JPEG data-URL at the given quality (0–1).
     * Returns the data-URL string.
     */
    async _encodeToJpeg(imageData, quality) {
        const canvas = document.createElement('canvas');
        canvas.width  = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/jpeg', quality);
    }

    /**
     * Decode a data-URL back to an ImageData object.
     */
    async _decodeToImageData(dataUrl) {
        const img = await this.loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
    }

    async compressAndPrepareImage(file) {
        try {
            // ── 1. Read original into pixels ──────────────────────────────
            const originalDataUrl   = await this.readFileAsDataURL(file);
            const originalImageData = await this._decodeToImageData(originalDataUrl);
            const { width, height } = originalImageData;
            const originalSize      = file.size;

            // ── 2. Compress: JPEG lossy encode ────────────────────────────
            // Start at quality 0.68 and step down until compressed ≤ original size.
            // Floor at 0.20 to avoid extreme blocking artefacts.
            let compressQuality   = 0.68;
            let compressedDataUrl = await this._encodeToJpeg(originalImageData, compressQuality);
            let compressedSize    = this.dataURLSize(compressedDataUrl);

            while (compressedSize > originalSize && compressQuality > 0.20) {
                compressQuality   = parseFloat((compressQuality - 0.05).toFixed(2));
                compressedDataUrl = await this._encodeToJpeg(originalImageData, compressQuality);
                compressedSize    = this.dataURLSize(compressedDataUrl);
            }

            // Hard safety cap — never inflate beyond original
            if (compressedSize > originalSize) {
                compressedDataUrl = originalDataUrl;
                compressedSize    = originalSize;
            }

            // ── 3. Decode compressed pixels ───────────────────────────────
            const compressedImageData = await this._decodeToImageData(compressedDataUrl);

            // ── 4. Decompress: re-encode decoded pixels at the highest quality
            //      that still fits within the original file size.
            //
            //      WHY no pixel manipulation:
            //      Any filter (sharpen, denoise, etc.) shifts pixel values away from
            //      what the original contained, directly increasing MSE and lowering
            //      PSNR. The closest we can mathematically get to the original is to
            //      take the JPEG-decoded pixels (already the best estimate of the
            //      original given only the compressed data) and re-encode them at the
            //      highest quality the size budget allows. This minimises the second
            //      quantisation round-trip and gives the best possible PSNR.
            //
            //      We binary-search quality from 0.97 downward to find the highest
            //      quality level whose output fits within originalSize.
            let decompressQuality = 0.97;
            let decompressedDataUrl = await this._encodeToJpeg(compressedImageData, decompressQuality);
            let decompressedSize    = this.dataURLSize(decompressedDataUrl);

            // Step down in finer increments (0.03) to maximise quality within budget
            while (decompressedSize > originalSize && decompressQuality > 0.50) {
                decompressQuality   = parseFloat((decompressQuality - 0.03).toFixed(2));
                decompressedDataUrl = await this._encodeToJpeg(compressedImageData, decompressQuality);
                decompressedSize    = this.dataURLSize(decompressedDataUrl);
            }

            // Absolute fallback: stay at compressed version rather than inflate
            if (decompressedSize > originalSize) {
                decompressedDataUrl = compressedDataUrl;
                decompressedSize    = compressedSize;
            }

            const decompressedImageData = await this._decodeToImageData(decompressedDataUrl);

            // ── 5. Loss metrics ───────────────────────────────────────────
            // compressionLoss  : original → JPEG-decoded pixels        (JPEG quantisation damage)
            // decompressionLoss: JPEG-decoded → re-encoded at high-q   (second pass cost; small)
            // overallLoss      : original → final decompressed pixels   (true round-trip cost)
            const compressionLoss   = this.calculateLoss(originalImageData, compressedImageData);
            const decompressionLoss = this.calculateLoss(compressedImageData, decompressedImageData);
            const overallLoss       = this.calculateLoss(originalImageData, decompressedImageData);

            const features = this.extractImageFeatures(decompressedImageData);

            return {
                username: this.username,
                text: file.name,
                timestamp: new Date().toLocaleTimeString(),
                own: true,
                imageUrl: compressedDataUrl,          // transmitted (small JPEG)
                decompressedUrl: decompressedDataUrl, // high-quality re-encode for download
                imageName: file.name,
                imageMime: 'image/jpeg',
                originalSize,
                compressedSize,
                decompressedSize,
                compressionLoss,
                decompressionLoss,
                overallLoss,
                loss: compressionLoss,                // legacy key
                features,
                imageWidth: width,
                imageHeight: height
            };
        } catch (error) {
            console.error('Image compression failed:', error);
            alert('Unable to compress and send this image.');
            return null;
        }
    }

    calculateLoss(originalImageData, compressedImageData) {
        const length = Math.min(originalImageData.data.length, compressedImageData.data.length);
        let sumSquareError = 0;
        let count = 0;

        for (let index = 0; index < length; index += 4) {
            for (let channel = 0; channel < 3; channel += 1) {
                const diff = originalImageData.data[index + channel] - compressedImageData.data[index + channel];
                sumSquareError += diff * diff;
                count += 1;
            }
        }

        const mse = count ? sumSquareError / count : 0;
        const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);

        return {
            mse: parseFloat(mse.toFixed(2)),
            psnr: Number.isFinite(psnr) ? parseFloat(psnr.toFixed(1)) : '∞'
        };
    }

    extractImageFeatures(imageData) {
        const totalPixels = imageData.width * imageData.height;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        for (let i = 0; i < imageData.data.length; i += 4) {
            sumR += imageData.data[i];
            sumG += imageData.data[i + 1];
            sumB += imageData.data[i + 2];
        }

        const averageColor = {
            r: Math.round(sumR / totalPixels),
            g: Math.round(sumG / totalPixels),
            b: Math.round(sumB / totalPixels)
        };

        return {
            width: imageData.width,
            height: imageData.height,
            averageColor,
            channels: 3
        };
    }

    dataURLSize(dataUrl) {
        const base64 = dataUrl.split(',')[1] || '';
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        return Math.max(0, Math.round((base64.length * 3) / 4 - padding));
    }

    formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async decompressReceivedImage(message, metaEl, downloadEl) {
        try {
            let decompressedUrl  = message.decompressedUrl;
            let decompressedSize = message.decompressedSize;

            if (!decompressedUrl) {
                // Legacy path: re-derive using the same clean pipeline.
                const compressedImageData = await this._decodeToImageData(message.imageUrl);
                let   q                   = 0.97;
                decompressedUrl           = await this._encodeToJpeg(compressedImageData, q);
                decompressedSize          = this.dataURLSize(decompressedUrl);

                while (message.originalSize && decompressedSize > message.originalSize && q > 0.50) {
                    q                = parseFloat((q - 0.03).toFixed(2));
                    decompressedUrl  = await this._encodeToJpeg(compressedImageData, q);
                    decompressedSize = this.dataURLSize(decompressedUrl);
                }

                if (message.originalSize && decompressedSize > message.originalSize) {
                    decompressedUrl  = message.imageUrl;
                    decompressedSize = message.compressedSize;
                }

                message.decompressedUrl  = decompressedUrl;
                message.decompressedSize = decompressedSize;
            }

            const decompressedImageData = await this._decodeToImageData(decompressedUrl);
            const features = this.extractImageFeatures(decompressedImageData);

            // ── Sizes ─────────────────────────────────────────────────────
            const originalSizeText     = message.originalSize   ? this.formatBytes(message.originalSize)   : 'N/A';
            const compressedSizeText   = message.compressedSize ? this.formatBytes(message.compressedSize) : 'N/A';
            const decompressedSizeText = decompressedSize       ? this.formatBytes(decompressedSize)       : 'N/A';

            const compReductionPct = (message.originalSize && message.compressedSize)
                ? Math.round((1 - message.compressedSize / message.originalSize) * 100)
                : null;
            const decompVsOrigPct = (message.originalSize && decompressedSize)
                ? Math.round((1 - decompressedSize / message.originalSize) * 100)
                : null;

            // ── Loss metrics ──────────────────────────────────────────────
            const compLoss   = message.compressionLoss   || message.loss || {};
            const decompLoss = message.decompressionLoss || {};
            const totalLoss  = message.overallLoss       || {};

            const fmtLoss = (obj) => {
                const mse  = obj.mse  != null ? obj.mse  : 'N/A';
                const psnr = obj.psnr != null ? obj.psnr : 'N/A';
                return `MSE&nbsp;=&nbsp;${mse},&nbsp;PSNR&nbsp;=&nbsp;${psnr}&nbsp;dB`;
            };

            const avg = features.averageColor;
            const avgColorText = avg ? `rgb(${avg.r}, ${avg.g}, ${avg.b})` : 'N/A';
            const width  = message.imageWidth  || features.width;
            const height = message.imageHeight || features.height;

            metaEl.innerHTML = `
                <strong>${message.imageName || 'Image'}</strong> &nbsp;·&nbsp; ${width}×${height}&nbsp;px &nbsp;·&nbsp;
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${avgColorText};vertical-align:middle;border:1px solid #aaa;"></span>&nbsp;${avgColorText}<br/>
                <span style="display:grid;grid-template-columns:auto auto auto;gap:2px 12px;margin-top:4px;">
                    <span>📦 Original</span><span>→</span><span>${originalSizeText}</span>
                    <span>🗜️ Compressed</span><span>→</span><span>${compressedSizeText}${compReductionPct != null ? `&nbsp;<em style="color:#e07b00">(−${compReductionPct}%)</em>` : ''}</span>
                    <span>♻️ Decompressed</span><span>→</span><span>${decompressedSizeText}${decompVsOrigPct != null ? `&nbsp;<em style="color:${decompVsOrigPct >= 0 ? '#2a9d5c' : '#c0392b'}">(${decompVsOrigPct >= 0 ? '−' : '+'}${Math.abs(decompVsOrigPct)}% vs original)</em>` : ''}</span>
                </span>
                <span style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:6px;">
                    <span>📉 Compression loss</span><span>${fmtLoss(compLoss)}</span>
                    <span>📈 Decompression recovery</span><span>${fmtLoss(decompLoss)}</span>
                    <span>🔁 Overall round-trip loss</span><span>${fmtLoss(totalLoss)}</span>
                </span>
            `;

            if (downloadEl) {
                downloadEl.href     = decompressedUrl;
                downloadEl.download = message.imageName;
            }

            message.features = features;
        } catch (error) {
            console.warn('Failed to decompress received image:', error);
        }
    }

    handleAudioSelection() {
        const file = this.audioInput.files && this.audioInput.files[0];
        const validAudio = file && (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|opus|weba)$/i.test(file.name));
        this.sendAudioBtn.disabled = !validAudio || !this.username;
    }

    async sendAudio() {
        const file = this.audioInput.files && this.audioInput.files[0];
        if (!file) {
            alert('Please choose a valid audio file first.');
            return;
        }

        const audioMessage = await this.compressAndPrepareAudio(file);
        if (!audioMessage) return;

        this.displayMessage(audioMessage);
        this.messages.push(audioMessage);
        this.renderedCount = this.messages.length;
        this.saveMessages();

        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(audioMessage));
        }

        this.audioInput.value = '';
        this.sendAudioBtn.disabled = true;
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Determine the max uploadable audio size based on localStorage quota.
     * We binary-search for the largest base64 blob that fits in localStorage.
     * Returns size in bytes.
     */
    probeMaxAudioSize() {
        // localStorage is typically 5–10 MB total; each char is ~2 bytes in V8.
        // We use a fixed conservative limit based on typical browser localStorage (5 MB)
        // minus overhead from other stored data.
        const LOCALSTORAGE_TOTAL = 5 * 1024 * 1024; // 5 MB typical quota
        // base64 inflates by 4/3; JSON serialisation adds ~20% overhead for message fields.
        const overhead = 1024 * 100; // 100 KB for message metadata
        const base64Overhead = 4 / 3;
        const jsonOverhead = 1.22;
        const maxBytes = Math.floor((LOCALSTORAGE_TOTAL - overhead) / (base64Overhead * jsonOverhead));
        // Cap at 3 MB for practical UX (large audio is heavy to encode/decode in-browser)
        return Math.min(maxBytes, 3 * 1024 * 1024);
    }

    /**
     * Full audio compression + decompression pipeline.
     *
     * ┌─────────────────────────────────────────────────────────────────┐
     * │ COMPRESSION                                                     │
     * │  Original file → decode PCM → mono + downsample → Opus @ low   │
     * │  bitrate  →  compressedBlob  (genuinely smaller, lossy codec)   │
     * ├─────────────────────────────────────────────────────────────────┤
     * │ DECOMPRESSION                                                   │
     * │  compressedBlob → decode PCM → upsample to original SR →       │
     * │  re-encode Opus at TARGET bitrate ≈ original bitrate            │
     * │  → decompressedBlob  (≈ same size as original, same codec)      │
     * ├─────────────────────────────────────────────────────────────────┤
     * │ METRICS  (PCM domain, original mono vs decompressed mono)       │
     * │  SNR · RMS error % · Dynamic range preserved · Centroid shift   │
     * └─────────────────────────────────────────────────────────────────┘
     *
     * KEY INSIGHT: "Decompression" does NOT mean raw PCM/WAV.
     * It means recovering a compressed audio file whose size is close to
     * the original. We achieve this by re-encoding at the ORIGINAL BITRATE
     * using the same Opus codec, so the decompressed file is playable and
     * approximately the same byte count as what the user uploaded.
     */
    async compressAndPrepareAudio(file) {
        try {
            const originalSize = file.size;
            const maxSize = this.probeMaxAudioSize();

            if (originalSize > maxSize) {
                alert(`Audio file is too large. Maximum supported size is ${this.formatBytes(maxSize)}. Your file is ${this.formatBytes(originalSize)}.`);
                return null;
            }

            const originalMime = file.type || 'audio/mpeg';
            const originalArrayBuffer = await this.readFileAsArrayBuffer(file);
            const AudioCtx = window.AudioContext || window.webkitAudioContext;

            // ── 1. Decode original → PCM ──────────────────────────────────
            const decodeCtx = new AudioCtx();
            let originalBuffer;
            try {
                originalBuffer = await decodeCtx.decodeAudioData(originalArrayBuffer.slice(0));
            } catch (e) {
                decodeCtx.close();
                alert('Could not decode audio file. Please try MP3, WAV, OGG, or FLAC.');
                return null;
            }
            decodeCtx.close();

            const originalSampleRate = originalBuffer.sampleRate;
            const originalChannels   = originalBuffer.numberOfChannels;
            const originalSamples    = originalBuffer.length;
            const durationSec        = originalBuffer.duration;

            // Estimate original bitrate from file size and duration.
            // bits = bytes × 8; bitrate = bits / seconds
            const originalBitrate = Math.round((originalSize * 8) / durationSec);

            // ── 2. Build mono PCM at original SR (for loss metrics later) ─
            const monoOriginal = new Float32Array(originalSamples);
            for (let ch = 0; ch < originalChannels; ch++) {
                const chData = originalBuffer.getChannelData(ch);
                for (let i = 0; i < originalSamples; i++) {
                    monoOriginal[i] += chData[i] / originalChannels;
                }
            }

            // ── 3. Downsample to 22 050 Hz for compression ────────────────
            const compressSR    = 22050;
            const downRatio     = compressSR / originalSampleRate;
            const compressLen   = Math.floor(originalSamples * downRatio);
            const compressedPCM = new Float32Array(compressLen);
            for (let i = 0; i < compressLen; i++) {
                const s  = i / downRatio;
                const lo = Math.floor(s);
                const hi = Math.min(lo + 1, originalSamples - 1);
                compressedPCM[i] = monoOriginal[lo] * (1 - (s - lo)) + monoOriginal[hi] * (s - lo);
            }

            // ── 4. Compress → Opus at LOW bitrate (e.g. 24 kbps) ─────────
            // Compression bitrate is well below original so the file is smaller.
            const compressBitrate = Math.min(24000, Math.round(originalBitrate * 0.25));
            const compressedBlob  = await this._pcmToOpusBlob(compressedPCM, compressSR, compressBitrate);
            const compressedSize  = compressedBlob.size;
            const compressedDataUrl = await this._blobToDataUrl(compressedBlob);

            // ── 5. DECOMPRESS ─────────────────────────────────────────────
            // Step A: decode compressed Opus blob back to PCM
            const compAB      = await compressedBlob.arrayBuffer();
            const decompCtx   = new AudioCtx();
            let   decompBuf;
            try {
                decompBuf = await decompCtx.decodeAudioData(compAB);
            } catch (_) {
                decompBuf = null;   // browser couldn't re-decode — use PCM fallback
            }
            decompCtx.close();

            // Step B: get mono PCM from decoded-back Opus, upsample to original SR
            let restoredMono;
            if (decompBuf) {
                const srcMono  = decompBuf.getChannelData(0);
                const upRatio  = originalSampleRate / decompBuf.sampleRate;
                restoredMono   = new Float32Array(originalSamples);
                for (let i = 0; i < originalSamples; i++) {
                    const s  = i / upRatio;
                    const lo = Math.floor(s);
                    const hi = Math.min(lo + 1, srcMono.length - 1);
                    restoredMono[i] = srcMono[lo] * (1 - (s - lo)) + srcMono[hi] * (s - lo);
                }
            } else {
                // Fallback: upsample compressedPCM without codec round-trip
                restoredMono = new Float32Array(originalSamples);
                const upRatio = originalSampleRate / compressSR;
                for (let i = 0; i < originalSamples; i++) {
                    const s  = i / upRatio;
                    const lo = Math.floor(s);
                    const hi = Math.min(lo + 1, compressLen - 1);
                    restoredMono[i] = compressedPCM[lo] * (1 - (s - lo)) + compressedPCM[hi] * (s - lo);
                }
            }

            // Step C: re-encode the restored PCM at the ORIGINAL bitrate using Opus.
            // This is what "decompression" means: recover a compressed audio file
            // whose size and quality approximate the original, not raw PCM.
            // We target the original bitrate but cap at 128 kbps (Opus quality ceiling).
            const decompBitrate    = Math.min(originalBitrate, 128000);
            const decompressedBlob = await this._pcmToOpusBlob(restoredMono, originalSampleRate, decompBitrate);
            const decompressedSize = decompressedBlob.size;
            const decompressedDataUrl = await this._blobToDataUrl(decompressedBlob);

            // ── 6. Loss metrics (PCM domain: original mono vs restored mono) ──
            const lossMetrics = this.calculateAudioLoss(monoOriginal, restoredMono);

            return {
                username: this.username,
                text: file.name,
                timestamp: new Date().toLocaleTimeString(),
                own: true,
                audioUrl:             compressedDataUrl,    // small Opus — compressed
                decompressedAudioUrl: decompressedDataUrl,  // Opus @ orig bitrate — decompressed
                audioName: file.name,
                audioMime: originalMime,
                compressedMime:   compressedBlob.type   || 'audio/webm',
                decompressedMime: decompressedBlob.type || 'audio/webm',
                originalSize,
                compressedSize,
                decompressedSize,
                originalSampleRate,
                compressSR,
                originalChannels,
                originalBitrate,
                compressBitrate,
                decompBitrate,
                durationSec: parseFloat(durationSec.toFixed(2)),
                maxUploadSize: maxSize,
                lossMetrics
            };
        } catch (error) {
            console.error('Audio compression failed:', error);
            alert('Unable to process this audio file. Your browser may not support MediaRecorder/Opus.');
            return null;
        }
    }

    /**
     * Encode a Float32Array of mono PCM into a WebM/Opus or OGG/Opus blob
     * via MediaRecorder at the specified bitrate.
     *
     * @param {Float32Array} pcmData   - mono PCM samples in [-1, 1]
     * @param {number}       sampleRate - sample rate in Hz
     * @param {number}       bitrate    - target bits per second (e.g. 24000, 96000)
     */
    _pcmToOpusBlob(pcmData, sampleRate, bitrate) {
        return new Promise((resolve, reject) => {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx({ sampleRate });

            const audioBuffer = ctx.createBuffer(1, pcmData.length, sampleRate);
            audioBuffer.copyToChannel(pcmData, 0);

            const dest   = ctx.createMediaStreamDestination();
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(dest);

            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/webm',
                'audio/ogg'
            ];
            const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

            const recorder = new MediaRecorder(dest.stream, {
                mimeType: mimeType || undefined,
                audioBitsPerSecond: bitrate
            });

            const chunks = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                ctx.close();
                resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
            };
            recorder.onerror = e => { ctx.close(); reject(e); };

            recorder.start(100); // collect in 100ms chunks for reliability
            source.start(0);

            source.onended = () => setTimeout(() => {
                if (recorder.state !== 'inactive') recorder.stop();
            }, 200);

            // Hard timeout: duration + 3 s buffer
            setTimeout(() => {
                if (recorder.state !== 'inactive') recorder.stop();
            }, (pcmData.length / sampleRate) * 1000 + 3000);
        });
    }

    /**
     * Convert a Blob to a base64 data URL.
     */
    _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Calculate audio-specific loss metrics between original and reconstructed PCM.
     * All metrics are meaningful for audio (unlike MSE/PSNR which are for images).
     *
     * Metrics:
     *  - SNR (Signal-to-Noise Ratio, dB): higher is better; measures noise introduced
     *  - RMS error (%): relative root-mean-square difference
     *  - Dynamic range preserved (%): how much of the original amplitude envelope survives
     *  - Spectral centroid shift (Hz): shift in brightness/frequency centre of mass
     *  - Compression ratio: original / compressed sample count proxy
     */
    calculateAudioLoss(original, reconstructed) {
        const len = Math.min(original.length, reconstructed.length);

        // RMS of original signal
        let sumSig = 0;
        let sumNoise = 0;
        let sumOrigSq = 0;
        let maxOrig = 0;
        let maxRecon = 0;

        for (let i = 0; i < len; i++) {
            const diff = original[i] - reconstructed[i];
            sumSig   += original[i] * original[i];
            sumNoise += diff * diff;
            sumOrigSq += original[i] * original[i];
            if (Math.abs(original[i])      > maxOrig)  maxOrig  = Math.abs(original[i]);
            if (Math.abs(reconstructed[i]) > maxRecon) maxRecon = Math.abs(reconstructed[i]);
        }

        const rmsOrig  = Math.sqrt(sumSig   / len);
        const rmsNoise = Math.sqrt(sumNoise / len);

        // SNR in dB
        const snrDb = rmsNoise === 0 ? Infinity : 20 * Math.log10(rmsOrig / rmsNoise);

        // RMS error as % of original signal RMS
        const rmsErrorPct = rmsOrig === 0 ? 0 : (rmsNoise / rmsOrig) * 100;

        // Dynamic range preserved: ratio of peaks
        const dynRangePreservedPct = maxOrig === 0 ? 100 : (maxRecon / maxOrig) * 100;

        // Spectral centroid (brightness) — use DFT on a 2048-sample window for speed
        const windowSize = Math.min(2048, len);
        const origCentroid  = this._spectralCentroid(original,      windowSize);
        const reconCentroid = this._spectralCentroid(reconstructed, windowSize);
        const centroidShiftHz = Math.abs(origCentroid - reconCentroid);

        return {
            snrDb:                Number.isFinite(snrDb) ? parseFloat(snrDb.toFixed(1)) : '∞',
            rmsErrorPct:          parseFloat(rmsErrorPct.toFixed(2)),
            dynRangePreservedPct: parseFloat(Math.min(100, dynRangePreservedPct).toFixed(1)),
            spectralCentroidOrigHz:  parseFloat(origCentroid.toFixed(1)),
            spectralCentroidReconHz: parseFloat(reconCentroid.toFixed(1)),
            centroidShiftHz:      parseFloat(centroidShiftHz.toFixed(1))
        };
    }

    /**
     * Estimate spectral centroid of a PCM array over windowSize samples.
     * Returns the weighted mean frequency in Hz (assumes 1-normalised bin width;
     * caller multiplies by sampleRate/windowSize if needed — here we return raw bin
     * index as a relative brightness proxy, which is sufficient for comparing shifts).
     */
    _spectralCentroid(pcm, windowSize) {
        // Simple DFT magnitude spectrum
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let k = 0; k < windowSize / 2; k++) {
            let re = 0;
            let im = 0;
            for (let n = 0; n < windowSize; n++) {
                const angle = (2 * Math.PI * k * n) / windowSize;
                re += pcm[n] * Math.cos(angle);
                im -= pcm[n] * Math.sin(angle);
            }
            const mag = Math.sqrt(re * re + im * im);
            weightedSum  += k * mag;
            magnitudeSum += mag;
        }
        return magnitudeSum === 0 ? 0 : weightedSum / magnitudeSum;
    }

    /**
     * Encode a Float32Array of mono PCM samples into a WAV ArrayBuffer.
     */
    _pcmToWav(samples, sampleRate) {
        const numSamples = samples.length;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = numSamples * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeString(view, 8, 'WAVE');
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);           // chunk size
        view.setUint16(20, 1, true);            // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // PCM data: Float32 → Int16
        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
        return buffer;
    }

    _writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    _arrayBufferToDataUrl(buffer, mimeType) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return `data:${mimeType};base64,${btoa(binary)}`;
    }

    displayAudioMessage(message, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'audio-message-wrapper';

        // Compressed audio player
        const compLabel = document.createElement('div');
        compLabel.style.cssText = 'font-size:11px;color:#888;margin-bottom:2px;font-weight:600;';
        compLabel.textContent = '🗜️ Compressed audio';
        wrapper.appendChild(compLabel);

        const compPlayer = document.createElement('audio');
        compPlayer.className = 'audio-player';
        compPlayer.controls = true;
        compPlayer.src = message.audioUrl;
        wrapper.appendChild(compPlayer);

        // Decompressed audio player
        const decompLabel = document.createElement('div');
        decompLabel.style.cssText = 'font-size:11px;color:#888;margin: 8px 0 2px;font-weight:600;';
        decompLabel.textContent = '♻️ Decompressed audio';
        wrapper.appendChild(decompLabel);

        const decompPlayer = document.createElement('audio');
        decompPlayer.className = 'audio-player';
        decompPlayer.controls = true;
        decompPlayer.src = message.decompressedAudioUrl;
        wrapper.appendChild(decompPlayer);

        // Metrics
        const metaEl = document.createElement('div');
        metaEl.className = 'audio-meta';
        metaEl.innerHTML = this._buildAudioMetaHtml(message);
        wrapper.appendChild(metaEl);

        // Download decompressed
        const downloadEl = document.createElement('a');
        downloadEl.className = 'audio-download-link';
        downloadEl.textContent = '⬇ Download decompressed audio';
        downloadEl.href = message.decompressedAudioUrl;
        downloadEl.download = message.audioName.replace(/\.[^.]+$/, '') + '_decompressed.wav';
        downloadEl.target = '_blank';
        downloadEl.rel = 'noopener noreferrer';
        wrapper.appendChild(downloadEl);

        container.appendChild(wrapper);
    }

    _buildAudioMetaHtml(message) {
        const m = message;
        const metrics = m.lossMetrics || {};

        const compPct = m.originalSize && m.compressedSize
            ? Math.round((1 - m.compressedSize / m.originalSize) * 100) : null;
        const decompVsOrigPct = m.originalSize && m.decompressedSize
            ? Math.round((1 - m.decompressedSize / m.originalSize) * 100) : null;

        const fmt = (n, unit) => n != null ? `${n} ${unit}` : 'N/A';
        const snr      = metrics.snrDb != null ? (Number.isFinite(metrics.snrDb) ? `${metrics.snrDb} dB` : '∞ dB') : 'N/A';
        const rmsErr   = metrics.rmsErrorPct   != null ? `${metrics.rmsErrorPct}%` : 'N/A';
        const dynRange = metrics.dynRangePreservedPct != null ? `${metrics.dynRangePreservedPct}%` : 'N/A';
        const centShift = metrics.centroidShiftHz != null ? `${metrics.centroidShiftHz} bins` : 'N/A';
        const maxUp    = m.maxUploadSize ? this.formatBytes(m.maxUploadSize) : 'N/A';

        const fmtBitrate = bps => bps ? `${Math.round(bps / 1000)} kbps` : 'N/A';
        const origBR  = fmtBitrate(m.originalBitrate);
        const compBR  = fmtBitrate(m.compressBitrate);
        const decompBR = fmtBitrate(m.decompBitrate);

        const decompColor = decompVsOrigPct != null
            ? (Math.abs(decompVsOrigPct) <= 15 ? '#2a9d5c' : '#e07b00') : '#888';

        return `
            <strong>${m.audioName || 'Audio'}</strong> &nbsp;·&nbsp; ${m.durationSec}s &nbsp;·&nbsp;
            ${m.originalSampleRate} Hz ${m.originalChannels > 1 ? `${m.originalChannels}ch` : 'mono'} &nbsp;·&nbsp;
            orig: <em style="color:#6c63ff">${origBR}</em><br/>
            <div style="display:grid;grid-template-columns:auto auto auto;gap:2px 12px;margin-top:5px;font-size:11.5px;">
                <span>📦 Original</span><span>→</span>
                <span>${this.formatBytes(m.originalSize)} @ ${origBR}</span>

                <span>🗜️ Compressed</span><span>→</span>
                <span>${this.formatBytes(m.compressedSize)} @ ${compBR}
                    ${compPct != null ? `<em style="color:#e07b00"> (−${compPct}%)</em>` : ''}
                    <span style="font-size:10px;color:#888"> · ${m.compressedMime || 'Opus'} · 22 050 Hz mono</span>
                </span>

                <span>♻️ Decompressed</span><span>→</span>
                <span>${this.formatBytes(m.decompressedSize)} @ ${decompBR}
                    ${decompVsOrigPct != null
                        ? `<em style="color:${decompColor}"> (${decompVsOrigPct >= 0 ? '−' : '+'}${Math.abs(decompVsOrigPct)}% vs orig)</em>`
                        : ''}
                    <span style="font-size:10px;color:#888"> · ${m.decompressedMime || 'Opus'} · ${m.originalSampleRate} Hz</span>
                </span>
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-top:7px;font-size:11.5px;">
                <span>📶 SNR</span>
                <span>${snr} <em style="color:#888;font-size:10.5px">(higher = cleaner; &gt;20 dB is good)</em></span>

                <span>📉 RMS error</span>
                <span>${rmsErr} <em style="color:#888;font-size:10.5px">(lower = more faithful)</em></span>

                <span>🔊 Dynamic range</span>
                <span>${dynRange} preserved</span>

                <span>🎵 Spectral shift</span>
                <span>${centShift} <em style="color:#888;font-size:10.5px">(brightness change)</em></span>

                <span>📁 Max upload</span>
                <span>${maxUp}</span>
            </div>
        `;
    }

    displayMessage(message) {
        // Always recalculate ownership from current username, not the stored 'own' flag
        // This ensures messages display correctly for every user, not just the sender
        const isOwnMessage = message.username === this.username;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwnMessage ? 'own' : 'other'}`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content';

        const usernameDiv = document.createElement('div');
        usernameDiv.className = 'message-username';
        usernameDiv.textContent = message.username;

        contentWrapper.appendChild(usernameDiv);

        if (message.audioUrl) {
            this.displayAudioMessage(message, contentWrapper);
        } else if (message.imageUrl) {
            const imageEl = document.createElement('img');
            imageEl.className = 'message-image';
            // Show decompressed image if available, otherwise compressed
            imageEl.src = message.decompressedUrl || message.imageUrl;
            imageEl.alt = message.imageName || message.text || 'Uploaded image';
            contentWrapper.appendChild(imageEl);

            const metaEl = document.createElement('div');
            metaEl.className = 'image-meta';

            const downloadEl = document.createElement('a');
            downloadEl.className = 'image-download-link';
            downloadEl.textContent = '⬇ Download decompressed image';
            downloadEl.href = message.decompressedUrl || message.imageUrl;
            downloadEl.download = message.imageName;
            downloadEl.target = '_blank';
            downloadEl.rel = 'noopener noreferrer';
            downloadEl.style.cssText = 'display:inline-block;margin-top:8px;color:#007bff;text-decoration:none;font-weight:600;';

            // Placeholder stats (async decompress will overwrite)
            const originalSizeText   = message.originalSize   ? this.formatBytes(message.originalSize)   : 'unknown';
            const compressedSizeText = message.compressedSize ? this.formatBytes(message.compressedSize) : 'unknown';
            const width  = message.imageWidth  || message.features?.width  || 'N/A';
            const height = message.imageHeight || message.features?.height || 'N/A';

            const compLoss  = message.compressionLoss  || message.loss || {};
            const decompLoss = message.decompressionLoss || {};
            const totalLoss  = message.overallLoss      || {};
            const fmtLoss = (obj) => {
                const mse  = obj.mse  != null ? obj.mse  : '…';
                const psnr = obj.psnr != null ? obj.psnr : '…';
                return `MSE = ${mse}, PSNR = ${psnr} dB`;
            };
            const sizeReductionPct = message.originalSize && message.compressedSize
                ? Math.round((1 - message.compressedSize / message.originalSize) * 100)
                : null;

            metaEl.innerHTML = `
                <strong>${message.imageName || 'Image'}</strong> &nbsp;·&nbsp; ${width}×${height}&nbsp;px<br/>
                <span style="display:grid;grid-template-columns:auto auto auto;gap:2px 12px;margin-top:4px;">
                    <span>📦 Original</span><span>→</span><span>${originalSizeText}</span>
                    <span>🗜️ Compressed</span><span>→</span><span>${compressedSizeText}${sizeReductionPct != null ? `&nbsp;<em style="color:#e07b00">(−${sizeReductionPct}%)</em>` : ''}</span>
                    <span>♻️ Decompressed</span><span>→</span><span>processing…</span>
                </span>
                <span style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:6px;">
                    <span>📉 Compression loss</span><span>${fmtLoss(compLoss)}</span>
                    <span>📈 Decompression recovery</span><span>${fmtLoss(decompLoss)}</span>
                    <span>🔁 Overall round-trip loss</span><span>${fmtLoss(totalLoss)}</span>
                </span>
            `;
            contentWrapper.appendChild(metaEl);
            contentWrapper.appendChild(downloadEl);

            // Run async decompression which will update metaEl and downloadEl
            this.decompressReceivedImage(message, metaEl, downloadEl).then(() => {
                // Update image src to decompressed version once ready
                if (message.decompressedUrl) {
                    imageEl.src = message.decompressedUrl;
                }
            });

            const captionDiv = document.createElement('div');
            captionDiv.textContent = message.text || message.imageName;
            captionDiv.style.marginTop = '8px';
            contentWrapper.appendChild(captionDiv);
        } else {
            const textDiv = document.createElement('div');
            textDiv.textContent = message.text;
            contentWrapper.appendChild(textDiv);
        }

        messageDiv.appendChild(contentWrapper);
        this.messagesContainer.appendChild(messageDiv);

        // Auto scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    addSystemMessage(text, skipSave = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.textContent = text;
        this.messagesContainer.appendChild(messageDiv);

        // Persist system messages so other tabs show join/leave events
        if (!skipSave) {
            this.messages.push({ isSystem: true, text, timestamp: new Date().toLocaleTimeString() });
            this.renderedCount = this.messages.length;
            this.saveMessages();
        }

        // Auto scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // Appends only messages that haven't been rendered yet.
    // Never clears the screen — so existing messages/images are never disrupted.
    appendNewMessages() {
        const toRender = this.messages.slice(this.renderedCount);
        toRender.forEach(msg => {
            if (!msg.isSystem) {
                this.displayMessage(msg);
            } else {
                this.addSystemMessage(msg.text, true);
            }
        });
        this.renderedCount = this.messages.length;
    }

    displayMessagesFromStorage() {
        this.messagesContainer.innerHTML = '';
        this.renderedCount = 0;
        this.appendNewMessages();
    }

    saveMessages() {
        localStorage.setItem('chatMessages', JSON.stringify(this.messages));
    }

    loadMessages() {
        const stored = localStorage.getItem('chatMessages');
        this.messages = stored ? JSON.parse(stored) : [];
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;
        if (connected) {
            this.connectionStatus.classList.add('connected');
            this.connectionStatus.title = 'Connected to server';
        } else {
            this.connectionStatus.classList.remove('connected');
            this.connectionStatus.title = 'Offline mode';
        }
    }

    async loadDataset() {
        try {
            const response = await fetch(this.datasetUrl);
            if (!response.ok) {
                throw new Error(`Failed to load dataset: ${response.status}`);
            }
            this.dataset = await response.json();
        } catch (error) {
            console.warn('Could not load local chatbot dataset, using fallback dataset.', error);
            this.dataset = [
                {
                    title: 'Fallback Product Plans',
                    keywords: ['pricing', 'plans', 'cost', 'price', 'subscription'],
                    answer: 'Fallback data: Basic ($10/mo), Pro ($25/mo), Enterprise ($60/mo).'
                },
                {
                    title: 'Fallback Support Hours',
                    keywords: ['support', 'help', 'hours', 'availability', 'service hours'],
                    answer: 'Fallback support is available Monday to Friday, 9 AM to 6 PM.'
                }
            ];
        }
    }

    openBotPanel() {
        this.botPanel.classList.remove('hidden');
        this.botInput.focus();

        if (this.botMessagesContainer.children.length === 0) {
            this.appendBotMessage('Hi! I\'m here to help with pricing, support, features, and account questions.', false);
        }
    }

    closeBotPanel() {
        this.botPanel.classList.add('hidden');
    }

    askBot() {
        const query = this.botInput.value.trim();
        if (!query) return;

        this.appendBotMessage(query, true);
        this.botInput.value = '';
        this.botInput.focus();

        const response = this.getBotResponse(query);
        setTimeout(() => {
            this.appendBotMessage(response, false);
        }, 250);
    }

    appendBotMessage(text, own) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `bot-message ${own ? 'user' : 'bot'}`;
        messageDiv.textContent = text;
        this.botMessagesContainer.appendChild(messageDiv);
        this.botMessagesContainer.scrollTop = this.botMessagesContainer.scrollHeight;
    }

    getBotResponse(query) {
        const normalized = query.toLowerCase();

        if (normalized.includes('dataset') || normalized.includes('dummy')) {
            return 'I\'m here to help with information about our services, including pricing, support, features, and account management.';
        }

        if (normalized.includes('topics') || normalized.includes('what can i ask') || normalized.includes('help')) {
            return 'Try asking about pricing, support hours, feature summary, account reset, or privacy details.';
        }

        const matches = this.dataset.filter(item =>
            item.keywords.some(keyword => normalized.includes(keyword))
        );

        if (matches.length === 1) {
            return matches[0].answer;
        }

        if (matches.length > 1) {
            return matches.map(item => `${item.title}: ${item.answer}`).join('\n\n');
        }

        return 'I\'m sorry, I couldn\'t find information on that topic. Please try asking about our pricing plans, support hours, features, account reset, or privacy policy.';
    }

    // Receive message from server (if implemented)
    receiveMessage(message) {
        if (!message.own) {
            this.messages.push(message);
            this.saveMessages();
            this.displayMessage(message);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new ChatApp();
});
