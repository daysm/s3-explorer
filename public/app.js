// Global state
let sessionId = null;
let currentBucket = null;
let rootPrefix = '';
let currentPrefix = '';

// DOM Elements
const credentialsSection = document.getElementById('credentials-section');
const browserSection = document.getElementById('browser-section');
const credentialsForm = document.getElementById('credentials-form');
const errorMessage = document.getElementById('error-message');
const currentBucketEl = document.getElementById('current-bucket');
const breadcrumbPath = document.getElementById('breadcrumb-path');
const filesTbody = document.getElementById('files-tbody');
const loading = document.getElementById('loading');
const disconnectBtn = document.getElementById('disconnect-btn');
const previewModal = document.getElementById('preview-modal');
const previewFilename = document.getElementById('preview-filename');
const previewContent = document.getElementById('preview-content');
const closePreview = document.getElementById('close-preview');

// Text file extensions that can be previewed
const TEXT_EXTENSIONS = [
  '.txt', '.json', '.csv', '.log', '.md', '.xml', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.java',
  '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bash', '.env',
  '.properties', '.ini', '.conf', '.config', '.sql'
];

// Initialize
credentialsForm.addEventListener('submit', handleCredentialsSubmit);
disconnectBtn.addEventListener('click', handleDisconnect);
closePreview.addEventListener('click', closePreviewModal);

// Close modal when clicking outside
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    closePreviewModal();
  }
});

// Check if server is in CLI mode on page load
async function checkCliMode() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (config.cliMode && config.sessionId && config.bucket) {
      // Server is in CLI mode, skip credentials form
      sessionId = config.sessionId;
      currentBucket = config.bucket;
      rootPrefix = config.rootPrefix || '';
      currentPrefix = rootPrefix;
      
      // Hide credentials form and show browser
      credentialsSection.style.display = 'none';
      browserSection.style.display = 'block';
      
      // Hide disconnect button in CLI mode
      disconnectBtn.style.display = 'none';
      
      // Load initial files starting from root prefix
      await loadFiles(rootPrefix);
    }
  } catch (error) {
    console.error('Error checking CLI mode:', error);
  }
}

// Run CLI mode check on page load
checkCliMode();

// Handle credentials form submission
async function handleCredentialsSubmit(e) {
  e.preventDefault();
  
  const accessKey = document.getElementById('access-key').value;
  const secretKey = document.getElementById('secret-key').value;
  const region = document.getElementById('region').value;
  const s3Uri = document.getElementById('s3-uri').value;

  hideError();

  try {
    const response = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        region: region || 'us-east-1',
        s3Uri: s3Uri,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to initialize');
    }

    sessionId = data.sessionId;
    currentBucket = data.bucket;
    rootPrefix = data.rootPrefix || '';
    currentPrefix = rootPrefix;

    // Switch to browser view
    credentialsSection.style.display = 'none';
    browserSection.style.display = 'block';
    
    // Display S3 URI in bucket name
    const displayUri = rootPrefix ? `s3://${currentBucket}/${rootPrefix}` : `s3://${currentBucket}`;
    currentBucketEl.textContent = displayUri;

    // Load initial files starting from root prefix
    await loadFiles(rootPrefix);
  } catch (error) {
    showError(error.message);
  }
}

// Load files from S3
async function loadFiles(prefix = '') {
  showLoading();
  currentPrefix = prefix;
  updateBreadcrumb();

  try {
    const url = `/api/list?sessionId=${sessionId}&bucket=${currentBucket}&prefix=${encodeURIComponent(prefix)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load files');
    }

    renderFiles(data.folders, data.files);
  } catch (error) {
    showError(error.message);
    renderFiles([], []);
  } finally {
    hideLoading();
  }
}

// Render files and folders
function renderFiles(folders, files) {
  filesTbody.innerHTML = '';

  if (folders.length === 0 && files.length === 0) {
    filesTbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          <div class="icon">📁</div>
          <div>This folder is empty</div>
        </td>
      </tr>
    `;
    return;
  }

  // Render folders
  folders.forEach((folder) => {
    const row = document.createElement('tr');
    row.className = 'folder-row';
    row.onclick = () => loadFiles(folder.fullPath);
    
    row.innerHTML = `
      <td><span class="file-icon">📁</span>${folder.name}</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;
    
    filesTbody.appendChild(row);
  });

  // Render files
  files.forEach((file) => {
    const row = document.createElement('tr');
    row.className = 'file-row';
    
    const fileName = file.name;
    const fileSize = formatBytes(file.size);
    const lastModified = new Date(file.lastModified).toLocaleString();
    const isTextFile = isPreviewable(fileName);
    
    row.innerHTML = `
      <td><span class="file-icon">📄</span>${fileName}</td>
      <td>${fileSize}</td>
      <td>${lastModified}</td>
      <td>
        ${isTextFile ? `<button class="btn btn-small btn-primary" onclick="previewFile('${escapeHtml(file.fullPath)}', '${escapeHtml(fileName)}')">Preview</button>` : ''}
        <button class="btn btn-small btn-secondary" onclick="downloadFile('${escapeHtml(file.fullPath)}', '${escapeHtml(fileName)}')">Download</button>
      </td>
    `;
    
    filesTbody.appendChild(row);
  });
}

// Update breadcrumb navigation
function updateBreadcrumb() {
  // Display S3 URI as bucket name
  const displayUri = rootPrefix ? `s3://${currentBucket}/${rootPrefix}` : `s3://${currentBucket}`;
  
  // Make bucket name clickable to go back to root
  currentBucketEl.innerHTML = `<a class="breadcrumb-link" onclick="loadFiles('${rootPrefix}')" style="font-weight: 700; cursor: pointer;">${displayUri}</a>`;
  
  if (currentPrefix === rootPrefix) {
    breadcrumbPath.innerHTML = ' / <span style="color: #999;">(root)</span>';
    return;
  }

  // Get the path relative to root
  const relativePath = currentPrefix.slice(rootPrefix.length);
  const parts = relativePath.split('/').filter(p => p);
  let path = rootPrefix;
  let breadcrumb = ' / ';

  parts.forEach((part, index) => {
    path += part + '/';
    const isLast = index === parts.length - 1;
    
    if (isLast) {
      breadcrumb += `<span style="color: #999;">${part}</span>`;
    } else {
      breadcrumb += `<a class="breadcrumb-link" onclick="loadFiles('${path}')">${part}</a> / `;
    }
  });

  breadcrumbPath.innerHTML = breadcrumb;
}

// Preview file
async function previewFile(key, fileName) {
  try {
    showLoading();
    const url = `/api/file?sessionId=${sessionId}&bucket=${currentBucket}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load file');
    }

    previewFilename.textContent = fileName;
    previewContent.textContent = data.content;
    previewModal.style.display = 'flex';
  } catch (error) {
    showError(error.message);
  } finally {
    hideLoading();
  }
}

// Download file
function downloadFile(key, fileName) {
  const url = `/api/download?sessionId=${sessionId}&bucket=${currentBucket}&key=${encodeURIComponent(key)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Close preview modal
function closePreviewModal() {
  previewModal.style.display = 'none';
  previewContent.textContent = '';
}

// Disconnect and return to credentials
function handleDisconnect() {
  sessionId = null;
  currentBucket = null;
  rootPrefix = '';
  currentPrefix = '';
  
  browserSection.style.display = 'none';
  credentialsSection.style.display = 'block';
  
  // Clear form
  credentialsForm.reset();
}

// Utility functions
function isPreviewable(fileName) {
  return TEXT_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.remove('show');
}

function showLoading() {
  loading.style.display = 'block';
}

function hideLoading() {
  loading.style.display = 'none';
}
