// YOLO Object Detection Frontend JavaScript for LineGuard

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const uploadedImage = document.getElementById('uploadedImage');
const detectionOverlay = document.getElementById('detectionOverlay');
const detectionsList = document.getElementById('detectionsList');
const toggleDamagedOnlyBtn = document.getElementById('toggleDamagedOnly');
const backButton = document.getElementById('backButton');
const closeImageBtn = document.getElementById('closeImageBtn');

// Views
const photosSection = document.getElementById('photosSection');
const imageViewSection = document.getElementById('imageViewSection');
const detectionResultsView = document.getElementById('detectionResultsView');
const photosList = document.getElementById('photosList');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyStateView = document.getElementById('emptyStateView');

// Application state
let selectedFiles = [];
let processedFiles = [];
let currentView = 'upload'; // 'upload', 'photos', or 'image'
let currentImageIndex = -1;

// Overlay toggle states
let damagedOnlyVisible = false;

// Color mapping for specific object types
const objectTypeColors = {
    'vibration_damper': '#180bd1ff',
    'festoon_insulators': '#004878ff',
    'polymer_insulators': '#9b59b6',
    'traverse': '#8ef312ff',
    'nest': '#8e44ad',
    'bad_insulator': '#c0392b',
    'damaged_insulator': '#e74c3c',
    'safety_sign+': '#27ae60' 
};

// Additional color palette for any unmapped types
const fallbackColors = [
    '#1abc9c', '#2ecc71', '#f1c40f', '#e67e22', '#34495e',
    '#16a085', '#2980b9', '#8e44ad', '#d35400', '#7f8c8d'
];

// Russian labels for power line inspection elements
const russianLabels = {
    'vibration_damper': 'Виброгаситель',
    'festoon_insulators': 'Гирлянда изоляторов',
    'polymer_insulators': 'Гирлянда полимерных изоляторов',
    'traverse': 'Траверса опоры',
    'nest': 'Гнездо',
    'bad_insulator': 'Изолятор отсутствует',
    'damaged_insulator': 'Поврежденный, сколотый изолятор',
    'safety_sign+': 'Знак безопасности, диспетчерская табличка, нумерация опор'
};

// Define damaged object types
const damagedObjectTypes = ['bad_insulator', 'damaged_insulator', 'nest'];

// Function to check if an object is damaged
function isDamagedObject(className) {
    return damagedObjectTypes.includes(className);
}

// Function to get Russian label or return original if not found
function getRussianLabel(className) {
    return russianLabels[className] || className;
}

// Function to get color for specific object type
function getObjectTypeColor(className, index = 0) {
    // Use specific color if available
    if (objectTypeColors[className]) {
        return objectTypeColors[className];
    }
    
    // Use fallback colors for unmapped types
    return fallbackColors[index % fallbackColors.length];
}

// Function to truncate filename if it's too long
function truncateFilename(filename, maxLength = 25) {
    if (filename.length <= maxLength) {
        return filename;
    }
    
    const extension = filename.split('.').pop();
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    const maxNameLength = maxLength - extension.length - 4; // 4 for "..." and "."
    
    if (maxNameLength <= 0) {
        return filename.substring(0, maxLength - 3) + '...';
    }
    
    const startLength = Math.floor(maxNameLength / 2);
    const endLength = maxNameLength - startLength;
    
    return nameWithoutExt.substring(0, startLength) + '...' + 
           nameWithoutExt.substring(nameWithoutExt.length - endLength) + '.' + extension;
}

// Event listeners for drag and drop
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

// Event listeners for new elements
backButton.addEventListener('click', goBackToList);
toggleDamagedOnlyBtn.addEventListener('click', toggleDamagedOnly);
closeImageBtn.addEventListener('click', goBackToList);
clearAllBtn.addEventListener('click', clearAllPhotos);

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        // Filter valid image files
        const validFiles = files.filter(file => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024);
        
        if (validFiles.length === 0) {
            showError('Пожалуйста, выберите корректные файлы изображений (не больше 10MB каждый).');
            return;
        }
        
        if (validFiles.length !== files.length) {
            showError('Некоторые файлы были пропущены (неверный формат или размер больше 10MB).');
        }
        
        hideError();
        
        // Auto-process the selected files
        selectedFiles = validFiles;
        processAllFiles();
    }
}

function removePhotoFromList(index) {
    // Remove from processed files
    processedFiles.splice(index, 1);
    
    // Update the photos list
    updatePhotosList();
    
    // If no more photos, go back to upload mode
    if (processedFiles.length === 0) {
        clearAllPhotos();
    }
}

function processAllFiles() {
    if (selectedFiles.length === 0) return;
    
    hideError();
    showLoading();
    
    // Add new files to processed files array
    const newFiles = selectedFiles.map(file => ({
        file: file,
        status: 'processing', // 'processing', 'completed', 'error'
        detections: [],
        damagedCount: 0,
        error: null
    }));
    
    processedFiles.push(...newFiles);
    
    // Show photos section
    if (currentView === 'upload') {
        switchToPhotosListView();
    } else {
        updatePhotosList();
    }
    
    hideLoading();
    
    // Process new files sequentially starting from the first new file
    const startIndex = processedFiles.length - newFiles.length;
    processNextFile(startIndex);
}

function processNextFile(index) {
    if (index >= processedFiles.length) {
        // All files processed
        updatePhotosList();
        return;
    }
    
    const fileData = processedFiles[index];
    fileData.status = 'processing';
    updatePhotosList();
    
    // Create form data for current file
    const formData = new FormData();
    formData.append('image', fileData.file);
    
    // Upload and process image
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            fileData.status = 'completed';
            fileData.detections = Array.isArray(data.detections) ? data.detections : [];
            fileData.damagedCount = fileData.detections.filter(detection => isDamagedObject(detection.class)).length;
        } else {
            fileData.status = 'error';
            fileData.error = data.error || 'Обработка не удалась';
        }
        
        updatePhotosList();
        
        // Process next file
        setTimeout(() => processNextFile(index + 1), 500);
    })
    .catch(error => {
        console.error('Error:', error);
        fileData.status = 'error';
        fileData.error = 'Ошибка сети';
        updatePhotosList();
        
        // Process next file
        setTimeout(() => processNextFile(index + 1), 500);
    });
}

function switchToPhotosListView() {
    currentView = 'photos';
    
    // Hide image view
    imageViewSection.style.display = 'none';
    
    // Show appropriate view on right side based on whether we have files
    if (processedFiles.length > 0) {
        photosSection.style.display = 'flex';
        emptyStateView.style.display = 'none';
        updatePhotosList();
    } else {
        photosSection.style.display = 'none';
        emptyStateView.style.display = 'flex';
    }
    
    // Hide back button and update toggle visibility
    backButton.style.display = 'none';
    updateOverlayToggleVisibility();
    
    // Remove image-loaded class to show upload section again
    document.querySelector('.left-panel').classList.remove('image-loaded');
}

function switchToImageView(imageIndex) {
    currentView = 'detectionResults';
    currentImageIndex = imageIndex;
    
    const fileData = processedFiles[imageIndex];
    
    // Load image
    uploadedImage.src = URL.createObjectURL(fileData.file);
    uploadedImage.style.display = 'block';
    
    // Show image view section on left, hide photos and show results on right
    imageViewSection.style.display = 'flex';
    photosSection.style.display = 'none';
    detectionResultsView.style.display = 'flex';
    emptyStateView.style.display = 'none';
    
    // Show back button and update toggle visibility
    backButton.style.display = 'flex';
    updateOverlayToggleVisibility();
    
    // Add image-loaded class to hide upload section
    document.querySelector('.left-panel').classList.add('image-loaded');
    
    // Display detections
    if (fileData.status === 'completed') {
        displayResultsForImage(fileData);
    }
    
    // Wait for image to load
    uploadedImage.onload = () => {
        updateOverlayToggleVisibility();
        
        setTimeout(() => {
            drawDetections(fileData.detections);
        }, 100);
    };
}

function goBackToList() {
    currentView = 'photos';
    currentImageIndex = -1;
    
    // Hide image view
    imageViewSection.style.display = 'none';
    detectionResultsView.style.display = 'none';
    
    // Hide back button and update toggle visibility
    backButton.style.display = 'none';
    updateOverlayToggleVisibility();
    
    // Remove image-loaded class to show upload section again
    document.querySelector('.left-panel').classList.remove('image-loaded');
    
    // Show appropriate view on right side based on whether we have files
    if (processedFiles.length > 0) {
        photosSection.style.display = 'flex';
        emptyStateView.style.display = 'none';
        updatePhotosList();
    } else {
        photosSection.style.display = 'none';
        emptyStateView.style.display = 'flex';
    }
}

function clearAllPhotos() {
    processedFiles = [];
    currentView = 'upload';
    currentImageIndex = -1;
    
    // Show upload section on left and empty state on right, hide photos and image views
    imageViewSection.style.display = 'none';
    photosSection.style.display = 'none';
    detectionResultsView.style.display = 'none';
    emptyStateView.style.display = 'flex';
    
    // Remove image-loaded class to show upload section again
    document.querySelector('.left-panel').classList.remove('image-loaded');
    
    // Clear the photos list
    photosList.innerHTML = '';
}

function displayResultsForImage(fileData) {
    // Store detections globally for damaged-only toggle
    window.currentDetections = fileData.detections;
    
    // Display detections list
    displayDetectionsList(fileData.detections);
}

function updatePhotosList() {
    photosList.innerHTML = '';
    
    processedFiles.forEach((fileData, index) => {
        const photoItem = document.createElement('div');
        photoItem.className = `photo-item ${fileData.status}`;
        
        // Create thumbnail
        const thumbnail = document.createElement('img');
        thumbnail.src = URL.createObjectURL(fileData.file);
        thumbnail.className = 'photo-thumbnail';
        thumbnail.alt = fileData.file.name;
        
        // Create photo info
        const photoInfo = document.createElement('div');
        photoInfo.className = 'photo-info';
        
        // Create photo name
        const photoName = document.createElement('div');
        photoName.className = 'photo-name';
        photoName.textContent = truncateFilename(fileData.file.name);
        photoName.title = fileData.file.name; // Show full filename on hover
        
        // Create photo status
        const photoStatus = document.createElement('div');
        photoStatus.className = 'photo-status';
        
        if (fileData.status === 'processing') {
            photoStatus.innerHTML = `
                <span class="processing-spinner"></span>
                Обработка...
            `;
        } else if (fileData.status === 'completed') {
            const damagedCount = fileData.damagedCount;
            photoStatus.innerHTML = `
                <span>✓ Обработано</span>
                ${damagedCount > 0 ? `<span class="photo-damaged-count">${damagedCount} ⚠️</span>` : ''}
            `;
        } else if (fileData.status === 'error') {
            photoStatus.innerHTML = `
                <span>✗ Ошибка: ${fileData.error}</span>
            `;
        }
        
        photoInfo.appendChild(photoName);
        photoInfo.appendChild(photoStatus);
        
        // Add remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-photo-btn';
        removeBtn.innerHTML = '✕';
        removeBtn.title = 'Удалить из списка';
        
        // Prevent remove button from triggering photo view
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removePhotoFromList(index);
        });
        
        photoItem.appendChild(thumbnail);
        photoItem.appendChild(photoInfo);
        photoItem.appendChild(removeBtn);
        
        // Add click handler for completed files
        if (fileData.status === 'completed') {
            photoItem.addEventListener('click', () => switchToImageView(index));
        }
        
        photosList.appendChild(photoItem);
    });
    
    // Handle empty state view only if we're in photos list view
    // Don't interfere with image view or other views
    if (currentView === 'photos') {
        if (processedFiles.length === 0) {
            photosSection.style.display = 'none';
            emptyStateView.style.display = 'flex';
        } else {
            photosSection.style.display = 'flex';
            emptyStateView.style.display = 'none';
        }
    }
}

// Keep the old displayResults function for backward compatibility
function displayResults(data) {
    // Create object URL for the uploaded image file from the original file input
    const file = fileInput.files[0];
    uploadedImage.src = URL.createObjectURL(file);
    uploadedImage.style.display = 'block'; // Show the uploaded image
    
    // Wait for image to load and also wait for the browser to render it
    uploadedImage.onload = () => {
        // Add image-loaded class to hide drop zone and show image
        document.querySelector('.left-panel').classList.add('image-loaded');
        
        // Show the overlay toggle button
        updateOverlayToggleVisibility();
        
        // Small delay to ensure the image has been rendered with its final size
        setTimeout(() => {
            const detections = Array.isArray(data.detections) ? data.detections : [];
            drawDetections(detections);
        }, 100);
    };

    // Display detections list - ensure it's always an array
    const detections = Array.isArray(data.detections) ? data.detections : [];
    displayDetectionsList(detections);
}

function drawDetections(detections) {
    // Ensure detections is a valid array
    if (!Array.isArray(detections)) {
        console.warn('Detections is not an array:', detections);
        return;
    }
    
    // Store detections globally for damaged-only toggle
    window.currentDetections = detections;

    const img = uploadedImage;
    const canvas = detectionOverlay;
    const ctx = canvas.getContext('2d');
    
    // Wait for image to be fully loaded and rendered
    if (!img.complete || img.naturalWidth === 0) {
        // Retry after a short delay if image isn't ready
        setTimeout(() => drawDetections(detections), 50);
        return;
    }
    
    // Get the actual rendered bounding client rect
    const imgRect = img.getBoundingClientRect();
    const containerRect = img.parentElement.getBoundingClientRect();
    
    // Calculate the actual displayed image position and size within the container
    const renderedLeft = imgRect.left - containerRect.left;
    const renderedTop = imgRect.top - containerRect.top;
    const renderedWidth = imgRect.width;
    const renderedHeight = imgRect.height;
    
    // Set canvas size to match the container
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scaling ratios based on actual rendered dimensions
    const scaleX = renderedWidth / img.naturalWidth;
    const scaleY = renderedHeight / img.naturalHeight;
    
    // Sort detections: non-damaged first, damaged last (to draw on top)
    const sortedDetections = detections.sort((a, b) => {
        const aDamaged = isDamagedObject(a.class);
        const bDamaged = isDamagedObject(b.class);
        
        // Non-damaged objects first (drawn underneath)
        if (!aDamaged && bDamaged) return -1;
        if (aDamaged && !bDamaged) return 1;
        
        // Then by confidence (highest first)
        return b.confidence - a.confidence;
    });
    
    // Filter detections based on damaged-only mode
    const filteredDetections = damagedOnlyVisible 
        ? sortedDetections.filter(detection => isDamagedObject(detection.class))
        : sortedDetections;
    
    // Use filtered detections directly (no hover reordering needed)
    const finalDetections = filteredDetections;
    
    // Track numbering for damaged and normal objects separately (only for visible items)
    let damagedCount = 0;
    let normalCount = 0;
    
    console.log('Drawing detections:', {
        naturalSize: `${img.naturalWidth}x${img.naturalHeight}`,
        renderedSize: `${renderedWidth.toFixed(1)}x${renderedHeight.toFixed(1)}`,
        containerSize: `${containerWidth.toFixed(1)}x${containerHeight.toFixed(1)}`,
        position: `${renderedLeft.toFixed(1)},${renderedTop.toFixed(1)}`,
        scaleX: scaleX.toFixed(4),
        scaleY: scaleY.toFixed(4),
        detections: finalDetections.length,
        damagedOnlyVisible: damagedOnlyVisible
    });
    
    finalDetections.forEach((detection, finalIndex) => {
        const [x, y, width, height] = detection.bbox;
        
        // Scale coordinates and position relative to the actual rendered image position
        const scaledX = renderedLeft + (x * scaleX);
        const scaledY = renderedTop + (y * scaleY);
        const scaledWidth = width * scaleX;
        const scaledHeight = height * scaleY;
        
        const isDamaged = isDamagedObject(detection.class);
        const color = getObjectTypeColor(detection.class, finalIndex);
        
        // Generate appropriate numbering based on original detection order
        let number;
        if (isDamaged) {
            damagedCount++;
            number = damagedCount;
        } else {
            normalCount++;
            number = normalCount;
        }
        
        // Add damage indicator for damaged objects
        const damageIndicator = isDamaged ? ' ⚠️' : '';
        const prefix = isDamaged ? `${number}.` : `${number}.`;
        
        console.log(`Detection ${finalIndex}:`, {
            original: [x, y, width, height],
            scaled: [scaledX.toFixed(1), scaledY.toFixed(1), scaledWidth.toFixed(1), scaledHeight.toFixed(1)],
            isDamaged: isDamaged,
            number: number,
            color: color
        });
        
        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = isDamaged ? 3 : 2;
        ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
        
        // Draw label background 
        const label = `${prefix} ${getRussianLabel(detection.class)}${damageIndicator} ${(detection.confidence * 100).toFixed(1)}%`;
        ctx.font = `bold ${isDamaged ? '13px' : '12px'} Arial`;
        const labelWidth = ctx.measureText(label).width + 8;
        const labelHeight = isDamaged ? 22 : 20;
        
        ctx.fillStyle = color;
        ctx.fillRect(scaledX, scaledY - labelHeight, labelWidth, labelHeight);
        
        // Draw label text
        ctx.fillStyle = 'white';
        ctx.fillText(label, scaledX + 4, scaledY - (isDamaged ? 7 : 6));
    });
}

function displayDetectionsList(detections) {
    // Ensure detections is a valid array
    if (!Array.isArray(detections)) {
        console.warn('Detections is not an array:', detections);
        detectionsList.innerHTML = '<h3>Обнаруженные объекты:</h3><p>Обнаружения не найдены или некорректный формат данных.</p>';
        return;
    }
    
    detectionsList.innerHTML = '<h3>Обнаруженные объекты:</h3>';
    
    // Sort detections: damaged objects first, then by confidence
    const sortedDetections = detections.sort((a, b) => {
        const aDamaged = isDamagedObject(a.class);
        const bDamaged = isDamagedObject(b.class);
        
        // Damaged objects first
        if (aDamaged && !bDamaged) return -1;
        if (!aDamaged && bDamaged) return 1;
        
        // Then by confidence (highest first)
        return b.confidence - a.confidence;
    });
    
    // Track numbering for damaged and normal objects separately
    let damagedCount = 0;
    let normalCount = 0;
    
    sortedDetections.forEach((detection, sortedIndex) => {
        const item = document.createElement('div');
        item.className = 'detection-item';
        
        const isDamaged = isDamagedObject(detection.class);
        const color = getObjectTypeColor(detection.class, sortedIndex);
        
        // Generate appropriate numbering
        let number;
        if (isDamaged) {
            damagedCount++;
            number = damagedCount;
        } else {
            normalCount++;
            number = normalCount;
        }
        
        // Add damage indicator for damaged objects
        const damageIndicator = isDamaged ? ' ⚠️' : '';
        const prefix = isDamaged ? `${number}.` : `${number}.`;
        
        item.innerHTML = `
            <span class="detection-class" style="color: ${color}; font-weight: ${isDamaged ? 'bold' : 'normal'}">
                ${prefix} ${getRussianLabel(detection.class)}${damageIndicator}
            </span>
            <span class="detection-confidence" style="background: ${isDamaged ? 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)' : 'linear-gradient(135deg, ' + color + ' 0%, ' + color + 'cc 100%)'}">
                ${(detection.confidence * 100).toFixed(1)}%
            </span>
        `;
        
        detectionsList.appendChild(item);
    });
}

function showLoading() {
    loading.style.display = 'block';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Toggle damaged-only view
function toggleDamagedOnly() {
    damagedOnlyVisible = !damagedOnlyVisible;
    
    if (damagedOnlyVisible) {
        toggleDamagedOnlyBtn.classList.add('active');
        toggleDamagedOnlyBtn.querySelector('.toggle-text').textContent = 'Показать все';
    } else {
        toggleDamagedOnlyBtn.classList.remove('active');
        toggleDamagedOnlyBtn.querySelector('.toggle-text').textContent = 'Только поврежденные';
    }
    
    // Redraw detections with new filter
    const detections = Array.isArray(window.currentDetections) ? window.currentDetections : [];
    drawDetections(detections);
}



// Show/hide toggle button based on current view
function updateOverlayToggleVisibility() {
    const showButton = currentView === 'detectionResults' && detectionResultsView.style.display !== 'none';
    toggleDamagedOnlyBtn.style.display = showButton ? 'flex' : 'none';
}

// Add some interactive features
dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#4c51bf';
});