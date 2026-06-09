// App State
const state = {
    file: null,
    fileType: null,
    textOriginal: "",
    textEntities: [], // { start, end, entity_type, score, text, ignored }
    pdfPages: [],     // base64 page images
    pdfBoxes: [],     // array of arrays of bounding boxes (per page)
    pdfCurrentPage: 0,
    pdfNaturalWidth: 0,
    pdfNaturalHeight: 0,
    systemStatus: {
        tesseract: { path: "", status: "unavailable" },
        poppler: { path: "", status: "unavailable" }
    }
};

// Elements
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const textPreviewContainer = document.getElementById("textPreviewContainer");
const textEditor = document.getElementById("textEditor");
const pdfPreviewContainer = document.getElementById("pdfPreviewContainer");
const pdfPageWrapper = document.getElementById("pdfPageWrapper");
const pdfPageImage = document.getElementById("pdfPageImage");
const pdfOverlay = document.getElementById("pdfOverlay");
const previewLoader = document.getElementById("previewLoader");
const loaderTitle = document.getElementById("loaderTitle");
const loaderSubtitle = document.getElementById("loaderSubtitle");

const pdfControls = document.getElementById("pdfControls");
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");
const spanCurrentPage = document.getElementById("spanCurrentPage");
const spanTotalPages = document.getElementById("spanTotalPages");

const previewTitle = document.getElementById("previewTitle");
const fileTypeBadge = document.getElementById("fileTypeBadge");

const fileInfoBlock = document.getElementById("fileInfoBlock");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const btnClearFile = document.getElementById("btnClearFile");

const btnFindPII = document.getElementById("btnFindPII");
const btnDownload = document.getElementById("btnDownload");
const entitiesList = document.getElementById("entitiesList");
const noEntitiesPlaceholder = document.getElementById("noEntitiesPlaceholder");
const badgeEntityCount = document.getElementById("badgeEntityCount");

// Settings Modal elements
const btnSettings = document.getElementById("btnSettings");
const settingsModal = document.getElementById("settingsModal");
const btnSettingsClose = document.getElementById("btnSettingsClose");
const btnSettingsCancel = document.getElementById("btnSettingsCancel");
const btnSettingsSave = document.getElementById("btnSettingsSave");
const inputTesseract = document.getElementById("inputTesseract");
const inputPoppler = document.getElementById("inputPoppler");

// Popover elements
const highlightPopover = document.getElementById("highlightPopover");
const popoverEntityText = document.getElementById("popoverEntityText");
const popoverBtnToggle = document.getElementById("popoverBtnToggle");
const popoverBtnType = document.getElementById("popoverBtnType");
const popoverIconCheck = document.getElementById("popoverIconCheck");
let currentPopoverEntityIndex = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    checkSystemStatus();
    initUploadEvents();
    initSettingsEvents();
    initPopoverEvents();
    initActionEvents();
    initTextSelectionEvents();
    initPdfDrawingEvents();
    
    // Resize handler to adjust overlay coordinates when PDF preview size changes
    window.addEventListener("resize", () => {
        if (state.fileType === "pdf" && state.pdfPages.length > 0) {
            renderPDFBoxes();
        }
    });
});

// Helper: Escape HTML
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Check System Status
async function checkSystemStatus() {
    try {
        const res = await fetch("/api/status");
        const data = await res.json();
        state.systemStatus = data;
        updateStatusUI();
    } catch (err) {
        console.error("Error checking system status:", err);
    }
}

function updateStatusUI() {
    const tes = state.systemStatus.tesseract;
    const pop = state.systemStatus.poppler;
    
    // Tesseract
    const dotTes = document.getElementById("dotTesseract");
    const dotTesPing = document.getElementById("dotTesseractPing");
    const textTes = document.getElementById("textTesseract");
    
    if (tes.status === "available") {
        dotTes.className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-500";
        dotTesPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400";
        textTes.innerText = "Активен";
        textTes.className = "text-emerald-400 font-semibold";
    } else {
        dotTes.className = "relative inline-flex rounded-full h-2 w-2 bg-rose-500";
        dotTesPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-400";
        textTes.innerText = "Недоступен";
        textTes.className = "text-rose-400 font-semibold";
    }
    
    // Poppler
    const dotPop = document.getElementById("dotPoppler");
    const dotPopPing = document.getElementById("dotPopplerPing");
    const textPop = document.getElementById("textPoppler");
    
    if (pop.status === "available") {
        dotPop.className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-500";
        dotPopPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400";
        textPop.innerText = "Активен";
        textPop.className = "text-emerald-400 font-semibold";
    } else {
        dotPop.className = "relative inline-flex rounded-full h-2 w-2 bg-rose-500";
        dotPopPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-400";
        textPop.innerText = "Недоступен";
        textPop.className = "text-rose-400 font-semibold";
    }
    
    // Fill forms in modal
    inputTesseract.value = tes.path || "";
    inputPoppler.value = pop.path || "";
}

// Upload & Drag-and-Drop Events
function initUploadEvents() {
    // Click to select
    uploadZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
    
    // Drag events
    ["dragenter", "dragover"].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add("border-brand-500", "bg-brand-500/[0.03]");
        }, false);
    });
    
    ["dragleave", "drop"].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove("border-brand-500", "bg-brand-500/[0.03]");
        }, false);
    });
    
    uploadZone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
    
    btnClearFile.addEventListener("click", clearWorkspace);
}

function handleFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "txt" && ext !== "pdf") {
        alert("Пожалуйста, загрузите файл TXT или PDF.");
        return;
    }
    
    state.file = file;
    state.fileType = ext;
    
    // Display File Info
    fileName.innerText = file.name;
    fileSize.innerText = formatBytes(file.size);
    fileInfoBlock.classList.remove("hidden");
    
    // Show badges & enable Analyze button
    previewTitle.innerText = file.name;
    fileTypeBadge.innerText = ext;
    fileTypeBadge.classList.remove("hidden");
    uploadZone.classList.add("hidden");
    
    btnFindPII.removeAttribute("disabled");
    btnDownload.setAttribute("disabled", "true");
    
    // Load Preview
    if (ext === "txt") {
        textPreviewContainer.classList.remove("hidden");
        pdfPreviewContainer.classList.add("hidden");
        pdfControls.classList.add("hidden");
        
        const reader = new FileReader();
        reader.onload = (e) => {
            state.textOriginal = e.target.result;
            state.textEntities = [];
            textEditor.innerText = state.textOriginal;
            document.getElementById("textCharCount").innerText = `Символов: ${state.textOriginal.length}`;
            renderEntitiesList();
        };
        reader.readAsText(file);
    } else if (ext === "pdf") {
        textPreviewContainer.classList.add("hidden");
        pdfPreviewContainer.classList.remove("hidden");
        pdfControls.classList.remove("hidden");
        
        state.pdfPages = [];
        state.pdfBoxes = [];
        state.pdfCurrentPage = 0;
        
        pdfPageImage.src = "";
        pdfOverlay.innerHTML = "";
        spanCurrentPage.innerText = "1";
        spanTotalPages.innerText = "1";
        
        // Show loading state for rendering PDF
        showLoader("Загрузка PDF...", "Растеризация страниц для предпросмотра");
        
        // Upload immediately to analyze or just show the PDF first?
        // Let's call the analyze endpoint which returns pages and boxes in one go!
        analyzePDF(file);
    }
}

function clearWorkspace() {
    state.file = null;
    state.fileType = null;
    state.textOriginal = "";
    state.textEntities = [];
    state.pdfPages = [];
    state.pdfBoxes = [];
    state.pdfCurrentPage = 0;
    
    fileInput.value = "";
    uploadZone.classList.remove("hidden");
    textPreviewContainer.classList.add("hidden");
    pdfPreviewContainer.classList.add("hidden");
    pdfControls.classList.add("hidden");
    fileInfoBlock.classList.add("hidden");
    fileTypeBadge.classList.add("hidden");
    
    btnFindPII.setAttribute("disabled", "true");
    btnDownload.setAttribute("disabled", "true");
    entitiesList.innerHTML = `
        <div id="noEntitiesPlaceholder" class="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/10">
            <i class="fa-solid fa-circle-info text-slate-500 text-lg mb-2"></i>
            <p class="text-xs text-slate-400">Загрузите файл и нажмите кнопку "Найти личные данные"</p>
        </div>
    `;
    badgeEntityCount.innerText = "0";
    previewTitle.innerText = "Область просмотра";
    
    hideLoader();
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Loader Utilities
function showLoader(title, subtitle) {
    loaderTitle.innerText = title;
    loaderSubtitle.innerText = subtitle;
    previewLoader.classList.remove("hidden");
    setTimeout(() => {
        previewLoader.classList.remove("opacity-0");
    }, 10);
}

function hideLoader() {
    previewLoader.classList.add("opacity-0");
    setTimeout(() => {
        previewLoader.classList.add("hidden");
    }, 300);
}

// Settings Modal Actions
function initSettingsEvents() {
    btnSettings.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
        setTimeout(() => {
            settingsModal.classList.remove("opacity-0");
            settingsModal.querySelector("div").classList.remove("scale-95");
        }, 10);
    });
    
    const closeModal = () => {
        settingsModal.classList.add("opacity-0");
        settingsModal.querySelector("div").classList.add("scale-95");
        setTimeout(() => {
            settingsModal.classList.add("hidden");
        }, 300);
    };
    
    btnSettingsClose.addEventListener("click", closeModal);
    btnSettingsCancel.addEventListener("click", closeModal);
    
    btnSettingsSave.addEventListener("click", async (e) => {
        e.preventDefault();
        const payload = {
            tesseract_cmd: inputTesseract.value.trim(),
            poppler_path: inputPoppler.value.trim()
        };
        
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === "success") {
                state.systemStatus = data.details;
                updateStatusUI();
                closeModal();
            } else {
                alert("Ошибка сохранения: " + data.message);
            }
        } catch (err) {
            alert("Не удалось сохранить настройки: " + err);
        }
    });
}

// Action Buttons
function initActionEvents() {
    btnFindPII.addEventListener("click", () => {
        if (state.fileType === "txt") {
            analyzeText();
        } else if (state.fileType === "pdf") {
            // Already analyzed during upload, but if re-requested:
            analyzePDF(state.file);
        }
    });
    
    btnDownload.addEventListener("click", () => {
        if (state.fileType === "txt") {
            downloadText();
        } else if (state.fileType === "pdf") {
            downloadPDF();
        }
    });
    
    // PDF Navigation
    btnPrevPage.addEventListener("click", () => {
        if (state.pdfCurrentPage > 0) {
            state.pdfCurrentPage--;
            renderPDFPage();
        }
    });
    
    btnNextPage.addEventListener("click", () => {
        if (state.pdfCurrentPage < state.pdfPages.length - 1) {
            state.pdfCurrentPage++;
            renderPDFPage();
        }
    });
}

// Popover Logic (For Text highlights)
function initPopoverEvents() {
    popoverBtnToggle.addEventListener("click", () => {
        if (currentPopoverEntityIndex === null) return;
        
        const ent = state.textEntities[currentPopoverEntityIndex];
        ent.ignored = !ent.ignored;
        
        highlightPopover.classList.add("hidden");
        renderTextEditor();
        renderEntitiesList();
    });
    
    const popoverBtnDelete = document.getElementById("popoverBtnDelete");
    popoverBtnDelete.addEventListener("click", () => {
        if (currentPopoverEntityIndex === null) return;
        
        state.textEntities.splice(currentPopoverEntityIndex, 1);
        highlightPopover.classList.add("hidden");
        renderTextEditor();
        renderEntitiesList();
    });
    
    // Click outside popover to close
    document.addEventListener("click", (e) => {
        if (!highlightPopover.contains(e.target) && !e.target.classList.contains("pii-highlight")) {
            highlightPopover.classList.add("hidden");
        }
    });
}

function showPopover(el, index) {
    currentPopoverEntityIndex = index;
    const ent = state.textEntities[index];
    
    popoverEntityText.innerText = `"${ent.text}"`;
    popoverTypeBadge.innerText = ent.entity_type;
    
    // Icon state
    if (ent.ignored) {
        popoverIconCheck.className = "fa-solid fa-xmark text-rose-400 text-[10px]";
        popoverBtnToggle.querySelector("span").innerText = "Включить в удаление";
    } else {
        popoverIconCheck.className = "fa-solid fa-check text-emerald-400 text-[9px]";
        popoverBtnToggle.querySelector("span").innerText = "Исключить из удаления";
    }
    
    // Position
    const rect = el.getBoundingClientRect();
    highlightPopover.style.left = `${rect.left + window.scrollX}px`;
    highlightPopover.style.top = `${rect.bottom + window.scrollY + 5}px`;
    highlightPopover.classList.remove("hidden");
}

// Text Selection for Manual Highlight
function initTextSelectionEvents() {
    textEditor.addEventListener("mouseup", () => {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();
        
        if (selectedText.length > 0) {
            // Get caret offsets relative to textEditor
            const offsets = getSelectionCharacterOffsets(textEditor);
            
            // Check if this selection overlaps with any existing entity
            const overlap = state.textEntities.some(ent => {
                return (offsets.start < ent.end && offsets.end > ent.start);
            });
            
            if (overlap) {
                // Ignore manual highlight if it overlaps
                return;
            }
            
            // Propose adding custom highlight
            setTimeout(() => {
                if (confirm(`Замаскировать выделенный текст "${selectedText}"?`)) {
                    state.textEntities.push({
                        entity_type: "MANUAL",
                        start: offsets.start,
                        end: offsets.end,
                        score: 1.0,
                        text: selectedText,
                        ignored: false
                    });
                    // Sort entities
                    state.textEntities.sort((a, b) => a.start - b.start);
                    
                    // Clear window selection
                    window.getSelection().removeAllRanges();
                    
                    renderTextEditor();
                    renderEntitiesList();
                    btnDownload.removeAttribute("disabled");
                }
            }, 100);
        }
    });
}

function getSelectionCharacterOffsets(element) {
    let start = 0;
    let end = 0;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        start = preCaretRange.toString().length;
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        end = preCaretRange.toString().length;
    }
    return { start, end };
}

// PDF Drawing (Drag-to-Redact) Events
function initPdfDrawingEvents() {
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let drawingBox = null;
    
    pdfOverlay.addEventListener("mousedown", (e) => {
        // Only left click
        if (e.button !== 0) return;
        
        isDrawing = true;
        const rect = pdfOverlay.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        
        // Create temporary drawing representation
        drawingBox = document.createElement("div");
        drawingBox.className = "pdf-drawing-rect";
        drawingBox.style.left = `${startX}px`;
        drawingBox.style.top = `${startY}px`;
        pdfOverlay.appendChild(drawingBox);
    });
    
    pdfOverlay.addEventListener("mousemove", (e) => {
        if (!isDrawing || !drawingBox) return;
        
        const rect = pdfOverlay.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(startX - currentX);
        const height = Math.abs(startY - currentY);
        
        drawingBox.style.left = `${left}px`;
        drawingBox.style.top = `${top}px`;
        drawingBox.style.width = `${width}px`;
        drawingBox.style.height = `${height}px`;
    });
    
    pdfOverlay.addEventListener("mouseup", (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (!drawingBox) return;
        
        const rect = pdfOverlay.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        
        const pixelLeft = Math.min(startX, endX);
        const pixelTop = Math.min(startY, endY);
        const pixelWidth = Math.abs(startX - endX);
        const pixelHeight = Math.abs(startY - endY);
        
        // Remove drawing representation
        drawingBox.remove();
        drawingBox = null;
        
        // Don't create tiny boxes
        if (pixelWidth < 5 || pixelHeight < 5) return;
        
        // Convert pixel coordinates on screen to original image scale
        const scaleX = state.pdfNaturalWidth / rect.width;
        const scaleY = state.pdfNaturalHeight / rect.height;
        
        const originalBox = {
            entity_type: "MANUAL",
            score: 1.0,
            left: Math.round(pixelLeft * scaleX),
            top: Math.round(pixelTop * scaleY),
            width: Math.round(pixelWidth * scaleX),
            height: Math.round(pixelHeight * scaleY),
            ignored: false,
            manual: true
        };
        
        // Add to state
        if (!state.pdfBoxes[state.pdfCurrentPage]) {
            state.pdfBoxes[state.pdfCurrentPage] = [];
        }
        state.pdfBoxes[state.pdfCurrentPage].push(originalBox);
        
        renderPDFBoxes();
        renderEntitiesList();
        btnDownload.removeAttribute("disabled");
    });
}

// API Call: Analyze Text
async function analyzeText() {
    const text = textEditor.innerText;
    if (!text.trim()) {
        alert("Введите текст для анализа.");
        return;
    }
    
    showLoader("Анализ текста...", "Поиск имен, адресов, телефонов и почты");
    
    try {
        const lang = document.getElementById("langSelect").value;
        const res = await fetch("/api/analyze/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language: lang })
        });
        
        const data = await res.json();
        if (res.ok) {
            state.textOriginal = text;
            state.textEntities = data.entities.map(ent => ({ ...ent, ignored: false }));
            renderTextEditor();
            renderEntitiesList();
            btnDownload.removeAttribute("disabled");
        } else {
            alert("Ошибка анализа: " + data.detail);
        }
    } catch (err) {
        alert("Не удалось связаться с сервером: " + err);
    } finally {
        hideLoader();
    }
}

// API Call: Analyze PDF
async function analyzePDF(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", document.getElementById("langSelect").value);
    
    showLoader("Оцифровка и OCR...", "Конвертация PDF и распознавание текста с помощью Tesseract");
    
    try {
        const res = await fetch("/api/analyze/pdf", {
            method: "POST",
            body: formData
        });
        
        const data = await res.json();
        if (res.ok) {
            state.pdfPages = data.pages;
            state.pdfBoxes = data.boxes.map(pageBoxes => pageBoxes.map(b => ({ ...b, ignored: false })));
            state.pdfCurrentPage = 0;
            
            // Update page count indicator
            spanTotalPages.innerText = state.pdfPages.length;
            
            // Set image source and wait for it to load to get dimensions
            pdfPageImage.src = state.pdfPages[0];
            pdfPageImage.onload = () => {
                state.pdfNaturalWidth = pdfPageImage.naturalWidth;
                state.pdfNaturalHeight = pdfPageImage.naturalHeight;
                renderPDFPage();
            };
            
            btnDownload.removeAttribute("disabled");
        } else {
            clearWorkspace();
            alert("Ошибка анализа PDF: " + data.detail);
        }
    } catch (err) {
        clearWorkspace();
        alert("Не удалось загрузить PDF: " + err);
    } finally {
        hideLoader();
    }
}

// API Call: Download Redacted Text
async function downloadText() {
    const activeEntities = state.textEntities.filter(ent => !ent.ignored);
    
    showLoader("Сборка файла...", "Применение заглушек к найденным личным данным");
    
    try {
        const res = await fetch("/api/anonymize/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: state.textOriginal,
                entities: activeEntities
            })
        });
        
        const data = await res.json();
        if (res.ok) {
            // Trigger browser download
            const blob = new Blob([data.anonymized_text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cleaned_${state.file.name}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert("Ошибка очистки: " + data.detail);
        }
    } catch (err) {
        alert("Ошибка скачивания: " + err);
    } finally {
        hideLoader();
    }
}

// API Call: Download Redacted PDF
async function downloadPDF() {
    // Collect coordinates from all pages (filtering out ignored ones)
    const processedBoxes = state.pdfBoxes.map(pageBoxes => {
        return (pageBoxes || []).filter(b => !b.ignored).map(b => ({
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            entity_type: b.entity_type
        }));
    });
    
    showLoader("Генерация PDF...", "Наложение черных плашек на очищенный документ");
    
    const formData = new FormData();
    formData.append("file", state.file);
    formData.append("pages_boxes_json", JSON.stringify(processedBoxes));
    
    try {
        const res = await fetch("/api/redact/pdf", {
            method: "POST",
            body: formData
        });
        
        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cleaned_${state.file.name}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            const data = await res.json();
            alert("Ошибка создания PDF: " + data.detail);
        }
    } catch (err) {
        alert("Ошибка скачивания PDF: " + err);
    } finally {
        hideLoader();
    }
}

// UI Rendering: Text Highlights
function renderTextEditor() {
    // Filter overlapping entities
    const active = [];
    let lastEnd = 0;
    state.textEntities.forEach((ent, idx) => {
        if (ent.start >= lastEnd) {
            active.push({ ...ent, originalIndex: idx });
            lastEnd = ent.end;
        }
    });
    
    let html = "";
    let lastIndex = 0;
    active.forEach(ent => {
        // Add preceding text
        html += escapeHtml(state.textOriginal.substring(lastIndex, ent.start));
        
        // Add highlighted text span
        const colorClass = getEntityColorClass(ent.entity_type);
        const ignoredClass = ent.ignored ? "pii-ignored" : "";
        const titleText = `${ent.entity_type} (Счет: ${(ent.score * 100).toFixed(0)}%)`;
        
        html += `<span class="pii-highlight ${colorClass} ${ignoredClass}" data-index="${ent.originalIndex}" title="${titleText}">${escapeHtml(state.textOriginal.substring(ent.start, ent.end))}</span>`;
        lastIndex = ent.end;
    });
    
    html += escapeHtml(state.textOriginal.substring(lastIndex));
    textEditor.innerHTML = html;
    
    // Bind click listeners on highlight spans
    textEditor.querySelectorAll(".pii-highlight").forEach(span => {
        span.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(span.getAttribute("data-index"));
            showPopover(span, idx);
        });
    });
}

function getEntityColorClass(type) {
    switch(type) {
        case "PERSON": return "pii-person";
        case "PHONE_NUMBER": return "pii-phone";
        case "EMAIL_ADDRESS": return "pii-email";
        case "LOCATION": return "pii-location";
        default: return "pii-generic";
    }
}

// UI Rendering: PDF Page & Overlay Boxes
function renderPDFPage() {
    spanCurrentPage.innerText = state.pdfCurrentPage + 1;
    
    // Disable prev/next buttons
    btnPrevPage.disabled = state.pdfCurrentPage === 0;
    btnNextPage.disabled = state.pdfCurrentPage === state.pdfPages.length - 1;
    
    // Set source image
    pdfPageImage.src = state.pdfPages[state.pdfCurrentPage];
    
    // Render overlays
    renderPDFBoxes();
    renderEntitiesList();
}

function renderPDFBoxes() {
    pdfOverlay.innerHTML = "";
    const boxes = state.pdfBoxes[state.pdfCurrentPage] || [];
    
    const overlayWidth = pdfOverlay.clientWidth;
    const overlayHeight = pdfOverlay.clientHeight;
    
    if (overlayWidth === 0 || state.pdfNaturalWidth === 0) {
        // If layout is not ready yet, retry in 50ms
        setTimeout(renderPDFBoxes, 50);
        return;
    }
    
    boxes.forEach((box, index) => {
        // Calculate percentages
        const pctLeft = (box.left / state.pdfNaturalWidth) * 100;
        const pctTop = (box.top / state.pdfNaturalHeight) * 100;
        const pctWidth = (box.width / state.pdfNaturalWidth) * 100;
        const pctHeight = (box.height / state.pdfNaturalHeight) * 100;
        
        const el = document.createElement("div");
        const statusClass = box.ignored ? "pdf-box-keep" : "pdf-box-redact";
        
        el.className = `pdf-box ${statusClass}`;
        el.style.left = `${pctLeft}%`;
        el.style.top = `${pctTop}%`;
        el.style.width = `${pctWidth}%`;
        el.style.height = `${pctHeight}%`;
        el.title = `${box.entity_type} (${(box.score * 100).toFixed(0)}%) - ЛКМ: вкл/выкл, ПКМ: удалить`;
        
        // Click to toggle redact/keep status
        el.addEventListener("mousedown", (e) => {
            // Prevent drawing events when clicking on boxes
            e.stopPropagation();
        });
        
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            box.ignored = !box.ignored;
            renderPDFBoxes();
            renderEntitiesList();
        });
        
        // Right click to remove completely
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.pdfBoxes[state.pdfCurrentPage].splice(index, 1);
            renderPDFBoxes();
            renderEntitiesList();
        });
        
        pdfOverlay.appendChild(el);
    });
}

// UI Rendering: Right Side List of entities
function renderEntitiesList() {
    entitiesList.innerHTML = "";
    
    let entities = [];
    if (state.fileType === "txt") {
        entities = state.textEntities.map((ent, idx) => ({
            ...ent,
            id: idx,
            page: null
        }));
    } else if (state.fileType === "pdf") {
        // List entities for CURRENT page
        const currentPageBoxes = state.pdfBoxes[state.pdfCurrentPage] || [];
        entities = currentPageBoxes.map((box, idx) => ({
            entity_type: box.entity_type,
            score: box.score,
            text: box.entity_type === "MANUAL" ? "Вручную маскируемая область" : `Координаты: X:${box.left} Y:${box.top}`,
            ignored: box.ignored,
            id: idx,
            page: state.pdfCurrentPage
        }));
    }
    
    badgeEntityCount.innerText = entities.length;
    
    if (entities.length === 0) {
        entitiesList.innerHTML = `
            <div id="noEntitiesPlaceholder" class="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/10">
                <i class="fa-solid fa-circle-info text-slate-500 text-lg mb-2"></i>
                <p class="text-xs text-slate-400">Личные данные не найдены на этой странице</p>
            </div>
        `;
        return;
    }
    
    entities.forEach(ent => {
        const item = document.createElement("div");
        const opacityClass = ent.ignored ? "opacity-45" : "opacity-100";
        
        // Entity tag labels in Russian
        let labelName = ent.entity_type;
        let icon = "fa-solid fa-asterisk";
        let colorClass = "bg-slate-800 text-slate-300 border-slate-700";
        
        if (ent.entity_type === "PERSON") {
            labelName = "ФИО";
            icon = "fa-solid fa-user";
            colorClass = "bg-orange-500/10 text-orange-400 border-orange-500/20";
        } else if (ent.entity_type === "PHONE_NUMBER") {
            labelName = "Телефон";
            icon = "fa-solid fa-phone";
            colorClass = "bg-pink-500/10 text-pink-400 border-pink-500/20";
        } else if (ent.entity_type === "EMAIL_ADDRESS") {
            labelName = "Email";
            icon = "fa-solid fa-envelope";
            colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
        } else if (ent.entity_type === "LOCATION") {
            labelName = "Адрес";
            icon = "fa-solid fa-map-location-dot";
            colorClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";
        } else if (ent.entity_type === "MANUAL") {
            labelName = "Ручное";
            icon = "fa-solid fa-crop-simple";
            colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
        }
        
        item.className = `flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800 hover:border-slate-700/80 rounded-xl transition duration-150 group ${opacityClass}`;
        
        // Left side text representation
        let textVal = ent.text;
        if (textVal.length > 25) textVal = textVal.substring(0, 22) + "...";
        
        item.innerHTML = `
            <div class="flex items-center space-x-2.5 min-w-0">
                <span class="h-6 px-2.5 border rounded-lg flex items-center justify-center space-x-1 ${colorClass} text-[10px] font-semibold tracking-wide uppercase">
                    <i class="${icon}"></i>
                    <span>${labelName}</span>
                </span>
                <span class="text-xs text-slate-200 truncate font-medium max-w-[150px]">${escapeHtml(textVal)}</span>
            </div>
            
            <div class="flex items-center space-x-2">
                <span class="text-[10px] text-slate-500 font-semibold">${(ent.score * 100).toFixed(0)}%</span>
                <button class="btn-toggle-entity p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition" title="${ent.ignored ? 'Включить в маскирование' : 'Исключить из маскирования'}">
                    <i class="fa-solid ${ent.ignored ? 'fa-eye-slash text-slate-500' : 'fa-eye text-emerald-400'} text-xs"></i>
                </button>
                <button class="btn-delete-entity p-1 text-slate-400 hover:text-red-400 rounded hover:bg-slate-800 transition" title="Удалить выделение">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        `;
        
        // Toggle handler
        item.querySelector(".btn-toggle-entity").addEventListener("click", (e) => {
            e.stopPropagation();
            if (state.fileType === "txt") {
                state.textEntities[ent.id].ignored = !state.textEntities[ent.id].ignored;
                renderTextEditor();
                renderEntitiesList();
            } else if (state.fileType === "pdf") {
                state.pdfBoxes[ent.page][ent.id].ignored = !state.pdfBoxes[ent.page][ent.id].ignored;
                renderPDFBoxes();
                renderEntitiesList();
            }
        });
        
        // Delete handler
        item.querySelector(".btn-delete-entity").addEventListener("click", (e) => {
            e.stopPropagation();
            if (state.fileType === "txt") {
                state.textEntities.splice(ent.id, 1);
                renderTextEditor();
                renderEntitiesList();
            } else if (state.fileType === "pdf") {
                state.pdfBoxes[ent.page].splice(ent.id, 1);
                renderPDFBoxes();
                renderEntitiesList();
            }
        });
        
        entitiesList.appendChild(item);
    });
}
