// Global state
let sessionId = null;
let currentBucket = null;
let rootPrefix = '';
let currentPrefix = '';

const credentialsSection = document.getElementById('credentials-section');
const browserSection = document.getElementById('browser-section');
const credentialsForm = document.getElementById('credentials-form');
const errorMessage = document.getElementById('error-message');
const currentBucketEl = document.getElementById('current-bucket');
const breadcrumbPath = document.getElementById('breadcrumb-path');
const filesTbody = document.getElementById('files-tbody');
const loading = document.getElementById('loading');
const disconnectBtn = document.getElementById('disconnect-btn');
const refreshBtn = document.getElementById('refresh-btn');
const previewModal = document.getElementById('preview-modal');
const previewFilename = document.getElementById('preview-filename');
const previewContent = document.getElementById('preview-content');
const closePreview = document.getElementById('close-preview');

const TEXT_EXTENSIONS = [
  '.txt', '.json', '.csv', '.log', '.md', '.xml', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.java',
  '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bash', '.env',
  '.properties', '.ini', '.conf', '.config', '.sql', '.tsv'
];

// Initialize
credentialsForm.addEventListener('submit', handleCredentialsSubmit);
disconnectBtn.addEventListener('click', handleDisconnect);
refreshBtn.addEventListener('click', handleRefresh);
closePreview.addEventListener('click', closePreviewModal);

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    closePreviewModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.style.display === 'flex') {
    closePreviewModal();
  }
});

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.prefix !== undefined) {
    loadFiles(event.state.prefix, false);
  }
});

// Check if server is in CLI mode on page load
async function checkCliMode() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (config.cliMode && config.sessionId && config.bucket) {
      sessionId = config.sessionId;
      currentBucket = config.bucket;
      rootPrefix = config.rootPrefix || '';
      currentPrefix = rootPrefix;
      
      credentialsSection.style.display = 'none';
      browserSection.style.display = 'block';
      
      disconnectBtn.style.display = 'none';
      
      const urlParams = new URLSearchParams(window.location.search);
      const urlPrefix = urlParams.get('path');
      const initialPrefix = urlPrefix !== null ? urlPrefix : rootPrefix;
      
      await loadFiles(initialPrefix, false);
      
      if (!history.state) {
        history.replaceState({ prefix: initialPrefix }, '', `?path=${encodeURIComponent(initialPrefix)}`);
      }
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

    credentialsSection.style.display = 'none';
    browserSection.style.display = 'block';
    
    const displayUri = rootPrefix ? `s3://${currentBucket}/${rootPrefix}` : `s3://${currentBucket}`;
    currentBucketEl.textContent = displayUri;

    await loadFiles(rootPrefix, false);
    
    history.replaceState({ prefix: rootPrefix }, '', `?path=${encodeURIComponent(rootPrefix)}`);
  } catch (error) {
    showError(error.message);
  }
}

function handleFolderClick(e) {
  const path = e.currentTarget.dataset.path;
  
  // Check for middle-click (button 1) or Ctrl/Cmd+click
  const isMiddleClick = e.type === 'auxclick' && e.button === 1;
  const isModifiedClick = e.ctrlKey || e.metaKey;
  
  // If middle-click or modified click, let browser handle opening in new tab
  if (isMiddleClick || isModifiedClick) {
    return; // Browser will use the href attribute
  }
  
  // Otherwise, prevent default and load in same tab
  e.preventDefault();
  loadFiles(path);
}

async function loadFiles(prefix = '', pushState = true, refresh = false) {
  currentPrefix = prefix;
  updateBreadcrumb();

  if (pushState) {
    const url = `?path=${encodeURIComponent(prefix)}`;
    history.pushState({ prefix }, '', url);
  }

  // Show loading indicator during refresh
  if (refresh) {
    loading.style.display = 'block';
  }

  try {
    const refreshParam = refresh ? '&refresh=true' : '';
    const url = `/api/list?sessionId=${sessionId}&bucket=${currentBucket}&prefix=${encodeURIComponent(prefix)}${refreshParam}`;
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
    if (refresh) {
      loading.style.display = 'none';
    }
  }
}

function handleRefresh() {
  loadFiles(currentPrefix, false, true);
}

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

  folders.forEach((folder) => {
    const row = document.createElement('tr');
    row.className = 'folder-row';
    
    const folderUrl = `?path=${encodeURIComponent(folder.fullPath)}`;
    
    row.innerHTML = `
      <td><a href="${folderUrl}" class="folder-link" data-path="${escapeHtml(folder.fullPath)}"><span class="file-icon">📁</span>${folder.name}</a></td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;
    
    const link = row.querySelector('.folder-link');
    link.addEventListener('click', handleFolderClick);
    link.addEventListener('auxclick', handleFolderClick);
    
    filesTbody.appendChild(row);
  });

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

function updateBreadcrumb() {
  const displayUri = rootPrefix ? `s3://${currentBucket}/${rootPrefix}` : `s3://${currentBucket}`;
  
  const rootUrl = `?path=${encodeURIComponent(rootPrefix)}`;
  currentBucketEl.innerHTML = `<a href="${rootUrl}" class="breadcrumb-link" data-path="${escapeHtml(rootPrefix)}" style="font-weight: 700; cursor: pointer;">${displayUri}</a>`;
  
  const rootLink = currentBucketEl.querySelector('.breadcrumb-link');
  rootLink.addEventListener('click', handleFolderClick);
  rootLink.addEventListener('auxclick', handleFolderClick);
  
  if (currentPrefix === rootPrefix) {
    breadcrumbPath.innerHTML = ' / <span style="color: #999;">(root)</span>';
    return;
  }

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
      const partUrl = `?path=${encodeURIComponent(path)}`;
      breadcrumb += `<a href="${partUrl}" class="breadcrumb-link" data-path="${escapeHtml(path)}">${part}</a> / `;
    }
  });

  breadcrumbPath.innerHTML = breadcrumb;
  
  breadcrumbPath.querySelectorAll('.breadcrumb-link').forEach(link => {
    link.addEventListener('click', handleFolderClick);
    link.addEventListener('auxclick', handleFolderClick);
  });
}

async function previewFile(key, fileName) {
  try {
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
  }
}

function downloadFile(key, fileName) {
  const url = `/api/download?sessionId=${sessionId}&bucket=${currentBucket}&key=${encodeURIComponent(key)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function closePreviewModal() {
  previewModal.style.display = 'none';
  previewContent.textContent = '';
}

function handleDisconnect() {
  sessionId = null;
  currentBucket = null;
  rootPrefix = '';
  currentPrefix = '';
  
  browserSection.style.display = 'none';
  credentialsSection.style.display = 'block';
  
  credentialsForm.reset();
}

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
