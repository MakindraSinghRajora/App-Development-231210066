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

        if (message.imageUrl) {
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
