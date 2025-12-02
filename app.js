// ==========================================
//           APPLICATION SETTINGS
// ==========================================
const APP_SETTINGS = {
    // --- Camera & Capture Settings ---
    camera: {
        defaultFacingMode: 'user', // 'user' (front) or 'environment' (back)
        targetResolution: { width: 1920, height: 1080 }, // Request 1080p
        mirrorFrontCamera: true, // Flip the canvas horizontally for front cam
    },
    
    // --- Image Processing ---
    image: {
        format: 'image/png', // Main image format
        quality: 1.0,        // (Only applies if format is jpeg/webp)
        // Ratio Logic: isLandscapeScreen ? (16/9) : (9/16)
        aspectRatioLandscape: 16 / 9,
        aspectRatioPortrait: 9 / 16, 
    },

    // --- Thumbnail Generation ---
    thumbnail: {
        enabled: true,
        width: 320,          // Width in pixels
        format: 'image/jpeg',
        quality: 0.6,        // 60% quality for faster uploads
    },

    // --- Upload & Network ---
    upload: {
        endpoint: '/upload',
        retryDelayMs: 2000,  // Wait time before retrying failed upload
        successMessageDurationMs: 2000,
    },

    // --- UI / Interaction ---
    ui: {
        flashDurationMs: 300,
    },

    // --- API Endpoints ---
    endpoints: {
        overlays: '/overlays-list',
        gallery: '/gallery-data',
        ip: '/my-ip'
    }
};

// ==========================================
//           DOM ELEMENTS
// ==========================================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const context = canvas.getContext('2d');

const overlayPreview = document.getElementById('overlay-preview');
const overlayMenu = document.getElementById('overlay-menu');
const overlayGrid = document.getElementById('overlay-grid');

const galleryMenu = document.getElementById('gallery-menu');
const galleryGrid = document.getElementById('gallery-grid');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxClose = document.getElementById('lightbox-close');

const settingsMenu = document.getElementById('settings-menu');
const debugMenu = document.getElementById('debug-menu');
const debugList = document.getElementById('debug-list');

const languageMenu = document.getElementById('language-menu');
const languageList = document.getElementById('language-list');

const timerBtn = document.getElementById('timer-btn');
const countdownDisplay = document.getElementById('countdown-display');
const uploadStatusDiv = document.getElementById('upload-status');
const cameraFlash = document.getElementById('camera-flash');
const switchCamBtn = document.getElementById('switch-cam-btn');

// ==========================================
//           STATE VARIABLES
// ==========================================
let countdownValue = 0; 
let allOverlays = [];
let selectedOverlaySrc = ""; 

// --- Camera Switching Logic ---
let currentStream = null;
let videoDevices = [];
let currentDeviceIndex = 0;

// --- QUEUE SYSTEM ---
const uploadQueue = [];
let isUploading = false;


// ==========================================
//           UI & LOCALIZATION
// ==========================================

function updateUIText() {
    // Update Text Content
    document.querySelectorAll('[data-text-key]').forEach(el => {
        const key = el.getAttribute('data-text-key');
        el.innerText = getTranslation(key);
    });

    // Update Tooltips/Titles
    document.querySelectorAll('[data-title-key]').forEach(el => {
        const key = el.getAttribute('data-title-key');
        // Special handling for timer button which changes dynamically
        if (key === 'timerOff' && countdownValue !== 0) return; 
        el.title = getTranslation(key);
    });

    // Re-render upload status if exists
    updateUploadStatus();
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('cwbLang', lang);
        updateUIText();
        renderLanguageList();
        toggleLanguageMenu();
        if (settingsMenu && !settingsMenu.classList.contains('active')) {
            settingsMenu.classList.add('active');
        }
    }
}

function renderLanguageList() {
    if (!languageList) return;
    languageList.innerHTML = '';
    supportedLanguages.forEach(lang => {
        const btn = document.createElement('div');
        btn.className = `lang-btn ${currentLang === lang.code ? 'active' : ''}`;
        btn.innerHTML = `<span class="lang-flag">${lang.flag}</span> <span class="lang-name">${lang.name}</span>`;
        btn.onclick = () => setLanguage(lang.code);
        languageList.appendChild(btn);
    });
}

function closeAllMenus() {
    if(galleryMenu) galleryMenu.classList.remove('active');
    if(overlayMenu) overlayMenu.classList.remove('active');
    if(languageMenu) languageMenu.classList.remove('active');
    if(settingsMenu) settingsMenu.classList.remove('active');
    if(debugMenu) debugMenu.classList.remove('active');
}

function toggleSettingsMenu() {
    if (!settingsMenu) return;
    const isActive = settingsMenu.classList.contains('active');
    closeAllMenus();
    if (!isActive) settingsMenu.classList.add('active');
}

function toggleLanguageMenu() {
    if (!languageMenu) return;
    languageMenu.classList.toggle('active');
}

function toggleDebugMenu() {
    if (!debugMenu) return;
    const isActive = debugMenu.classList.contains('active');
    if (!isActive) {
        populateDebugInfo();
        debugMenu.classList.add('active');
    } else {
        debugMenu.classList.remove('active');
    }
}

// ==========================================
//           DEBUG INFO
// ==========================================
async function populateDebugInfo() {
    if(!debugList) return;
    debugList.innerHTML = '<li class="list-group-item">Loading...</li>';

    // 1. Rotation
    let rotation = "Horizontal (Landscape)";
    if (window.matchMedia("(orientation: portrait)").matches) {
        rotation = "Vertical (Portrait)";
    }

    // 2. UA & Browser
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Internet";
    else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
    else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";
    else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";

    // 3. Resolutions
    const screenRes = `${window.screen.width} x ${window.screen.height}`;
    const camRes = video.videoWidth > 0 ? `${video.videoWidth} x ${video.videoHeight}` : "N/A";
    
    // 4. IP
    let ip = "Detecting...";
    try {
        const res = await fetch(APP_SETTINGS.endpoints.ip);
        const data = await res.json();
        ip = data.ip || "Unknown";
    } catch(e) { ip = "Error fetching IP"; }

    // Build List
    const debugData = [
        { labelKey: 'lblRotation', value: rotation },
        { labelKey: 'lblUserAgent', value: `<small>${ua}</small>` },
        { labelKey: 'lblBrowser', value: browser },
        { labelKey: 'lblScreenRes', value: screenRes },
        { labelKey: 'lblCamRes', value: camRes },
        { labelKey: 'lblCamCount', value: videoDevices.length },
        { labelKey: 'lblIp', value: ip },
    ];

    debugList.innerHTML = '';
    debugData.forEach(item => {
        const li = document.createElement('li');
        li.className = "list-group-item d-flex flex-column";
        li.innerHTML = `
            <span class="fw-bold" data-text-key="${item.labelKey}">${getTranslation(item.labelKey)}</span>
            <span class="text-break">${item.value}</span>
        `;
        debugList.appendChild(li);
    });
}

// ==========================================
//           UPLOAD QUEUE
// ==========================================
function updateUploadStatus() {
    if (isUploading) {
        uploadStatusDiv.innerText = `${getTranslation('uploading')} (${uploadQueue.length})`;
        uploadStatusDiv.className = "text-center text-warning small";
    } else if (uploadQueue.length > 0) {
        uploadStatusDiv.innerText = `${getTranslation('pending')} ${uploadQueue.length}`;
        uploadStatusDiv.className = "text-center text-info small";
    } else {
        uploadStatusDiv.innerText = getTranslation('synced');
        uploadStatusDiv.className = "text-center text-success small";
        setTimeout(() => { 
            if(uploadQueue.length === 0) uploadStatusDiv.innerText = ""; 
        }, APP_SETTINGS.upload.successMessageDurationMs);
    }
}

function addToQueue(payload) {
    uploadQueue.push(payload);
    updateUploadStatus();
    processQueue();
}

async function processQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    isUploading = true;
    updateUploadStatus();
    const payload = uploadQueue[0]; 

    try {
        const response = await fetch(APP_SETTINGS.upload.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            console.log("Upload Success");
            uploadQueue.shift(); 
        } else {
            console.error("Server error, retrying later...");
            await new Promise(r => setTimeout(r, APP_SETTINGS.upload.retryDelayMs)); 
        }
    } catch (e) {
        console.error("Network error, retrying...", e);
        await new Promise(r => setTimeout(r, APP_SETTINGS.upload.retryDelayMs + 1000)); 
    } finally {
        isUploading = false;
        updateUploadStatus();
        if (uploadQueue.length > 0) processQueue();
    }
}

// ==========================================
//           TIMER & LOGIC
// ==========================================
function toggleTimer() {
    if (countdownValue === 0) {
        countdownValue = 3;
        timerBtn.innerHTML = '<b style="font-family: sans-serif;">3s</b>';
        timerBtn.classList.add('active');
        timerBtn.title = getTranslation('timer3s');
    } else if (countdownValue === 3) {
        countdownValue = 5;
        timerBtn.innerHTML = '<b style="font-family: sans-serif;">5s</b>';
        timerBtn.classList.add('active');
        timerBtn.title = getTranslation('timer5s');
    } else {
        countdownValue = 0;
        timerBtn.innerHTML = '<i class="fa-solid fa-stopwatch"></i>';
        timerBtn.classList.remove('active');
        timerBtn.title = getTranslation('timerOff');
    }
}

function startCountdown(callback) {
    if (countdownValue === 0) { callback(); return; }
    let count = countdownValue;
    countdownDisplay.innerText = count;
    countdownDisplay.style.display = 'block';
    snapBtn.disabled = true; 
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownDisplay.style.animation = 'none';
            countdownDisplay.offsetHeight; // Trigger reflow
            countdownDisplay.style.animation = null; 
            countdownDisplay.innerText = count;
        } else {
            clearInterval(interval);
            countdownDisplay.style.display = 'none';
            snapBtn.disabled = false;
            callback();
        }
    }, 1000);
}

// ==========================================
//           OVERLAYS
// ==========================================
function toggleOverlayMenu() {
    if(overlayMenu) {
        const isActive = overlayMenu.classList.contains('active');
        closeAllMenus();
        if (!isActive) {
            overlayMenu.classList.add('active');
            renderOverlayGrid();
        }
    }
}

async function loadOverlays() {
    try {
        const response = await fetch(APP_SETTINGS.endpoints.overlays);
        allOverlays = await response.json();
    } catch (err) { console.error("Failed to load overlays", err); }
}

function selectOverlay(filename) {
    if (!filename) {
        selectedOverlaySrc = "";
        overlayPreview.src = "";
        overlayPreview.style.display = 'none';
    } else {
        selectedOverlaySrc = `/overlays/${filename}`;
        overlayPreview.src = selectedOverlaySrc;
        overlayPreview.style.display = 'block';
    }
    toggleOverlayMenu(); 
}

function renderOverlayGrid() {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    overlayGrid.innerHTML = '';
    const noneItem = document.createElement('div');
    noneItem.className = 'overlay-item';
    noneItem.innerHTML = `<div style="font-size: 2rem;">🚫</div>`;
    noneItem.onclick = () => selectOverlay(null);
    overlayGrid.appendChild(noneItem);

    allOverlays.forEach(fileName => {
        const nameLower = fileName.toLowerCase();
        const isVerticalFile = nameLower.includes('vertical');
        const isHorizontalFile = nameLower.includes('horizontal');
        let shouldShow = true;
        if (isLandscape && isVerticalFile) shouldShow = false;
        if (!isLandscape && isHorizontalFile) shouldShow = false;

        if (shouldShow) {
            const item = document.createElement('div');
            item.className = 'overlay-item';
            if (selectedOverlaySrc.includes(fileName)) item.classList.add('selected');
            item.innerHTML = `<img src="/overlays/${fileName}" alt="${fileName}">`;
            item.onclick = () => selectOverlay(fileName);
            overlayGrid.appendChild(item);
        }
    });
}

window.addEventListener('resize', () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    if (selectedOverlaySrc) {
        const lowerSrc = selectedOverlaySrc.toLowerCase();
        const isVertical = lowerSrc.includes('vertical');
        const isHorizontal = lowerSrc.includes('horizontal');
        if (isLandscape && isVertical) selectOverlay(null); 
        else if (!isLandscape && isHorizontal) selectOverlay(null);
    }
    if (overlayMenu && overlayMenu.classList.contains('active')) renderOverlayGrid();
});

// ==========================================
//           GALLERY
// ==========================================
function toggleGallery() {
    if(galleryMenu) {
        const isActive = galleryMenu.classList.contains('active');
        closeAllMenus();
        if (!isActive) {
            galleryMenu.classList.add('active');
            loadGalleryImages();
        }
    }
}

async function loadGalleryImages() {
    galleryGrid.innerHTML = `<p class="text-center text-muted w-100 mt-3" data-text-key="loading">${getTranslation('loading')}</p>`;
    try {
        const response = await fetch(APP_SETTINGS.endpoints.gallery);
        const imageList = await response.json();
        if (!imageList || imageList.length === 0) {
            galleryGrid.innerHTML = `<p class="text-center text-muted w-100 mt-3" data-text-key="emptyGallery">${getTranslation('emptyGallery')}</p>`;
            return;
        }
        galleryGrid.innerHTML = '';
        imageList.reverse().forEach(fileName => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            
            const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
            const thumbName = `${baseName}_thumb.jpg`;
            const thumbUrl = `/uploads/thumbnails/${thumbName}`;
            
            item.innerHTML = `
                <img src="${thumbUrl}" 
                        loading="lazy" 
                        onerror="this.onerror=null; this.src='/uploads/${fileName}';">`;
                        
            item.onclick = () => openLightbox(`/uploads/${fileName}`);
            galleryGrid.appendChild(item);
        });
    } catch (err) {
        galleryGrid.innerHTML = `<p class="text-danger text-center w-100 mt-3" data-text-key="errorGallery">${getTranslation('errorGallery')}</p>`;
    }
}

function openLightbox(src) {
    lightboxImage.src = src;
    lightbox.style.display = 'flex';
}
function closeLightbox() { lightbox.style.display = 'none'; }
lightbox.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox' || e.target.id === 'lightbox-close') closeLightbox();
});

// ==========================================
//           CAMERA ENGINE
// ==========================================

async function getCameraDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        // Show switch button if more than 1 camera
        if (videoDevices.length > 1) {
            switchCamBtn.style.display = 'flex';
        } else {
            switchCamBtn.style.display = 'none';
        }
    } catch (err) {
        console.error("Error enumerating devices:", err);
    }
}

async function startCamera(deviceId = null) {
    // Stop current track if exists
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: { 
            width: { ideal: APP_SETTINGS.camera.targetResolution.width }, 
            height: { ideal: APP_SETTINGS.camera.targetResolution.height }
        }
    };

    if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
    } else {
        constraints.video.facingMode = APP_SETTINGS.camera.defaultFacingMode; 
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
        loadOverlays();

        const track = currentStream.getVideoTracks()[0];
        const settings = track.getSettings();

        // --- Fix Mirroring for Back Camera ---
        const isBackCamera = settings.facingMode === 'environment' || 
                           (track.label && (track.label.toLowerCase().includes('back') || track.label.toLowerCase().includes('environment')));

        if (isBackCamera) {
            video.style.transform = 'scaleX(1)'; // Normal view for back camera
        } else {
            // Apply setting for front camera mirroring
            video.style.transform = APP_SETTINGS.camera.mirrorFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
        }

        if (settings.deviceId) {
            const foundIndex = videoDevices.findIndex(d => d.deviceId === settings.deviceId);
            if (foundIndex !== -1) currentDeviceIndex = foundIndex;
        }

    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}

function switchCamera() {
    if (videoDevices.length < 2) return;
    
    currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[currentDeviceIndex];
    startCamera(nextDevice.deviceId);
}

// Initial Launch
navigator.mediaDevices.getUserMedia({ video: true }) 
    .then(stream => {
        stream.getTracks().forEach(track => track.stop()); 
        
        getCameraDevices().then(() => {
            if (videoDevices.length > 0) {
                startCamera();
            }
        });
    })
    .catch(err => {
        console.error("Camera permission denied or error:", err);
    });

// ==========================================
//           CAPTURE HELPERS
// ==========================================

function drawOverlayOnCanvas(ctx, src, width, height) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height);
            resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
    });
}

function triggerFlash() {
    cameraFlash.classList.add('flash-active');
    setTimeout(() => { cameraFlash.classList.remove('flash-active'); }, APP_SETTINGS.ui.flashDurationMs);
}

// --- THUMBNAIL GENERATOR (Client-Side) ---
function generateThumbnail(mainCanvas) {
    if (!APP_SETTINGS.thumbnail.enabled) return null;

    const thumbCanvas = document.createElement('canvas');
    const thumbW = APP_SETTINGS.thumbnail.width; 
    const scale = thumbW / mainCanvas.width;
    const thumbH = mainCanvas.height * scale;
    
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(mainCanvas, 0, 0, thumbW, thumbH);
    
    // Compress heavily to JPEG
    return thumbCanvas.toDataURL(APP_SETTINGS.thumbnail.format, APP_SETTINGS.thumbnail.quality); 
}

function takePhoto() {
    if (video.videoWidth === 0) return;
    
    triggerFlash(); 

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    const isLandscapeScreen = window.matchMedia("(orientation: landscape)").matches;
    const isLandscapeStream = vW > vH;
    const needsRotation = isMobile && !isLandscapeScreen && isLandscapeStream;

    const effW = needsRotation ? vH : vW;
    const effH = needsRotation ? vW : vH;
    
    // --- UPDATED ASPECT RATIO LOGIC HERE ---
    let targetRatio = isLandscapeScreen 
        ? APP_SETTINGS.image.aspectRatioLandscape // 16/9
        : APP_SETTINGS.image.aspectRatioPortrait; // 9/16
    
    let canvasW, canvasH;
    if ((effW / effH) > targetRatio) {
        canvasH = effH;
        canvasW = effH * targetRatio;
    } else {
        canvasW = effW;
        canvasH = effW / targetRatio;
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    if (needsRotation) context.rotate(-90 * Math.PI / 180);

    const scale = Math.max(canvasW / effW, canvasH / effH);
    const drawW = vW * scale;
    const drawH = vH * scale;

    context.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
    context.restore();

    const finalize = async () => {
        if (selectedOverlaySrc) {
            await drawOverlayOnCanvas(context, selectedOverlaySrc, canvas.width, canvas.height);
        }
        
        const dataURL = canvas.toDataURL(APP_SETTINGS.image.format, APP_SETTINGS.image.quality);
        const thumbDataURL = generateThumbnail(canvas);

        console.log("Queuing image for upload...");
        addToQueue({
            image: dataURL,
            thumbnail: thumbDataURL, 
            width: canvas.width,
            height: canvas.height
        });
    };
    finalize();
}

snapBtn.addEventListener('click', () => {
    startCountdown(takePhoto);
});

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

// Initialize UI Text
updateUIText();
renderLanguageList();