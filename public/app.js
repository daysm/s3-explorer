const TEXT_EXTENSIONS = [
  '.txt', '.json', '.csv', '.log', '.md', '.xml', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.java',
  '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bash', '.env',
  '.properties', '.ini', '.conf', '.config', '.sql', '.tsv'
];

class State {
  constructor() {
    this.sessionId = null;
    this.currentBucket = null;
    this.rootPrefix = '';
    this.currentPrefix = '';
  }

  reset() {
    this.sessionId = null;
    this.currentBucket = null;
    this.rootPrefix = '';
    this.currentPrefix = '';
  }

  setSession(sessionId, bucket, rootPrefix) {
    this.sessionId = sessionId;
    this.currentBucket = bucket;
    this.rootPrefix = rootPrefix || '';
    this.currentPrefix = this.rootPrefix;
  }

  setCurrentPrefix(prefix) {
    this.currentPrefix = prefix;
  }

  getDisplayUri() {
    return this.rootPrefix 
      ? `s3://${this.currentBucket}/${this.rootPrefix}` 
      : `s3://${this.currentBucket}`;
  }

  getRelativePath() {
    return this.currentPrefix.slice(this.rootPrefix.length);
  }
}

class DOMElements {
  constructor() {
    this.credentialsSection = document.getElementById('credentials-section');
    this.browserSection = document.getElementById('browser-section');
    this.credentialsForm = document.getElementById('credentials-form');
    this.errorMessage = document.getElementById('error-message');
    this.currentBucketEl = document.getElementById('current-bucket');
    this.breadcrumbPath = document.getElementById('breadcrumb-path');
    this.filesTbody = document.getElementById('files-tbody');
    this.disconnectBtn = document.getElementById('disconnect-btn');
    this.refreshBtn = document.getElementById('refresh-btn');
    this.previewModal = document.getElementById('preview-modal');
    this.previewFilename = document.getElementById('preview-filename');
    this.previewContent = document.getElementById('preview-content');
  }

  showBrowser() {
    this.credentialsSection.style.display = 'none';
    this.browserSection.style.display = 'block';
  }

  showCredentials() {
    this.browserSection.style.display = 'none';
    this.credentialsSection.style.display = 'block';
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.add('show');
  }

  hideError() {
    this.errorMessage.textContent = '';
    this.errorMessage.classList.remove('show');
  }

  showModal(filename, content) {
    this.previewFilename.textContent = filename;
    this.previewContent.textContent = content;
    this.previewModal.style.display = 'flex';
  }

  closeModal() {
    this.previewModal.style.display = 'none';
    this.previewContent.textContent = '';
  }

  setRefreshState(loading) {
    this.refreshBtn.disabled = loading;
    this.refreshBtn.textContent = loading ? 'Refreshing...' : 'Refresh';
  }
}

class API {
  static async getConfig() {
    const response = await fetch('/api/config');
    return response.json();
  }

  static async init(credentials) {
    const response = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to initialize');
    }
    return data;
  }

  static async listFiles(sessionId, bucket, prefix, refresh = false) {
    const refreshParam = refresh ? '&refresh=true' : '';
    const url = `/api/list?sessionId=${sessionId}&bucket=${bucket}&prefix=${encodeURIComponent(prefix)}${refreshParam}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load files');
    }
    return data;
  }

  static async getFileContent(sessionId, bucket, key) {
    const url = `/api/file?sessionId=${sessionId}&bucket=${bucket}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load file');
    }
    return data;
  }

  static getDownloadUrl(sessionId, bucket, key) {
    return `/api/download?sessionId=${sessionId}&bucket=${bucket}&key=${encodeURIComponent(key)}`;
  }
}

class Renderer {
  constructor(dom, state) {
    this.dom = dom;
    this.state = state;
  }

  renderFiles(folders, files) {
    this.dom.filesTbody.innerHTML = '';

    if (folders.length === 0 && files.length === 0) {
      this.renderEmptyState();
      return;
    }

    folders.forEach(folder => this.renderFolder(folder));
    files.forEach(file => this.renderFile(file));
  }

  renderEmptyState() {
    this.dom.filesTbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          <div class="icon">📁</div>
          <div>This folder is empty</div>
        </td>
      </tr>
    `;
  }

  renderFolder(folder) {
    const row = document.createElement('tr');
    row.className = 'folder-row';
    const s3Uri = `s3://${this.state.currentBucket}/${folder.fullPath}`;
    const folderUrl = buildPathUrl(s3Uri);
    
    row.innerHTML = `
      <td><a href="${folderUrl}" class="folder-link" data-path="${escapeHtml(folder.fullPath)}"><span class="file-icon">📁</span>${escapeHtml(folder.name)}</a></td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;
    
    const link = row.querySelector('.folder-link');
    link.addEventListener('click', (e) => this.handleFolderClick(e));
    this.dom.filesTbody.appendChild(row);
  }

  renderFile(file) {
    const row = document.createElement('tr');
    row.className = 'file-row';
    const isTextFile = isPreviewable(file.name);
    
    row.innerHTML = `
      <td><span class="file-icon">📄</span>${escapeHtml(file.name)}</td>
      <td>${formatBytes(file.size)}</td>
      <td>${new Date(file.lastModified).toLocaleString()}</td>
      <td>
        <div class="action-buttons">
          ${isTextFile ? `<button class="btn btn-small btn-primary" data-action="preview" data-path="${escapeHtml(file.fullPath)}" data-name="${escapeHtml(file.name)}">Preview</button>` : ''}
          <button class="btn btn-small btn-secondary" data-action="download" data-path="${escapeHtml(file.fullPath)}" data-name="${escapeHtml(file.name)}">Download</button>
        </div>
      </td>
    `;
    
    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleFileAction(e));
    });
    
    this.dom.filesTbody.appendChild(row);
  }

  updateBreadcrumb() {
    const displayUri = this.state.getDisplayUri();
    const rootS3Uri = `s3://${this.state.currentBucket}/${this.state.rootPrefix}`;
    const rootUrl = buildPathUrl(rootS3Uri);
    
    this.dom.currentBucketEl.innerHTML = `<a href="${rootUrl}" class="breadcrumb-link" data-path="${escapeHtml(this.state.rootPrefix)}" style="font-weight: 700; cursor: pointer;">${displayUri}</a>`;
    
    const rootLink = this.dom.currentBucketEl.querySelector('.breadcrumb-link');
    rootLink.addEventListener('click', (e) => this.handleFolderClick(e));
    
    if (this.state.currentPrefix === this.state.rootPrefix) {
      this.dom.breadcrumbPath.innerHTML = ' / <span style="color: #999;">(root)</span>';
      return;
    }

    const relativePath = this.state.getRelativePath();
    const parts = relativePath.split('/').filter(p => p);
    let path = this.state.rootPrefix;
    let breadcrumb = ' / ';

    parts.forEach((part, index) => {
      path += part + '/';
      const isLast = index === parts.length - 1;
      
      if (isLast) {
        breadcrumb += `<span style="color: #999;">${escapeHtml(part)}</span>`;
      } else {
        const s3Uri = `s3://${this.state.currentBucket}/${path}`;
        const partUrl = buildPathUrl(s3Uri);
        breadcrumb += `<a href="${partUrl}" class="breadcrumb-link" data-path="${escapeHtml(path)}">${escapeHtml(part)}</a> / `;
      }
    });

    this.dom.breadcrumbPath.innerHTML = breadcrumb;
    this.dom.breadcrumbPath.querySelectorAll('.breadcrumb-link').forEach(link => {
      link.addEventListener('click', (e) => this.handleFolderClick(e));
    });
  }

  handleFolderClick(e) {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const path = e.currentTarget.dataset.path;
    app.loadFiles(path);
  }

  handleFileAction(e) {
    const action = e.target.dataset.action;
    const path = e.target.dataset.path;
    const name = e.target.dataset.name;
    
    if (action === 'preview') {
      app.previewFile(path, name);
    } else if (action === 'download') {
      app.downloadFile(path, name);
    }
  }
}

class S3Explorer {
  constructor() {
    this.state = new State();
    this.dom = new DOMElements();
    this.renderer = new Renderer(this.dom, this.state);
    this.setupEventListeners();
    this.checkCliMode();
  }

  setupEventListeners() {
    this.dom.credentialsForm.addEventListener('submit', (e) => this.handleCredentialsSubmit(e));
    this.dom.disconnectBtn.addEventListener('click', () => this.handleDisconnect());
    this.dom.refreshBtn.addEventListener('click', () => this.handleRefresh());
    
    const closePreview = document.getElementById('close-preview');
    closePreview.addEventListener('click', () => this.dom.closeModal());

    this.dom.previewModal.addEventListener('click', (e) => {
      if (e.target === this.dom.previewModal) {
        this.dom.closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dom.previewModal.style.display === 'flex') {
        this.dom.closeModal();
      }
    });

    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.prefix !== undefined) {
        this.loadFiles(event.state.prefix, false);
      }
    });
  }

  async checkCliMode() {
    try {
      const config = await API.getConfig();
      
      if (config.cliMode && config.sessionId && config.bucket) {
        this.state.setSession(config.sessionId, config.bucket, config.rootPrefix);
        this.dom.showBrowser();
        this.dom.disconnectBtn.style.display = 'none';
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlPath = urlParams.get('path');
        
        // If URL has path param, parse it (could be S3 URI or just prefix)
        let initialPrefix = this.state.rootPrefix;
        if (urlPath) {
          if (urlPath.startsWith('s3://')) {
            // Parse S3 URI to extract prefix
            const parsed = this.parseS3Uri(urlPath);
            if (parsed.bucket === config.bucket) {
              initialPrefix = parsed.prefix;
            }
          } else {
            // Assume it's a prefix
            initialPrefix = urlPath;
          }
        }
        
        await this.loadFiles(initialPrefix, false);
        
        if (!history.state) {
          const s3Uri = `s3://${config.bucket}/${initialPrefix}`;
          history.replaceState({ prefix: initialPrefix }, '', buildPathUrl(s3Uri));
        }
      }
    } catch (error) {
      console.error('Error checking CLI mode:', error);
    }
  }

  parseS3Uri(uri) {
    if (!uri.startsWith('s3://')) {
      throw new Error('Invalid S3 URI');
    }
    
    const withoutProtocol = uri.slice(5);
    const firstSlashIndex = withoutProtocol.indexOf('/');
    
    if (firstSlashIndex === -1) {
      return { bucket: withoutProtocol, prefix: '' };
    }
    
    const bucket = withoutProtocol.slice(0, firstSlashIndex);
    let prefix = withoutProtocol.slice(firstSlashIndex + 1);
    
    // Ensure prefix ends with / if it exists
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/';
    }
    
    return { bucket, prefix };
  }

  async handleCredentialsSubmit(e) {
    e.preventDefault();
    
    const accessKey = document.getElementById('access-key').value;
    const secretKey = document.getElementById('secret-key').value;
    const region = document.getElementById('region').value;
    const s3Uri = document.getElementById('s3-uri').value;

    this.dom.hideError();

    try {
      const data = await API.init({
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        region: region || 'us-east-1',
        s3Uri: s3Uri
      });

      this.state.setSession(data.sessionId, data.bucket, data.rootPrefix);
      this.dom.showBrowser();
      this.dom.currentBucketEl.textContent = this.state.getDisplayUri();

      await this.loadFiles(this.state.rootPrefix, false);
      const initialS3Uri = `s3://${data.bucket}/${this.state.rootPrefix}`;
      history.replaceState({ prefix: this.state.rootPrefix }, '', buildPathUrl(initialS3Uri));
    } catch (error) {
      this.dom.showError(error.message);
    }
  }

  async loadFiles(prefix = '', pushState = true, refresh = false) {
    this.state.setCurrentPrefix(prefix);
    this.renderer.updateBreadcrumb();

    if (pushState) {
      const s3Uri = `s3://${this.state.currentBucket}/${prefix}`;
      const url = buildPathUrl(s3Uri);
      history.pushState({ prefix }, '', url);
    }

    try {
      const data = await API.listFiles(this.state.sessionId, this.state.currentBucket, prefix, refresh);
      this.renderer.renderFiles(data.folders, data.files);
    } catch (error) {
      this.dom.showError(error.message);
      this.renderer.renderFiles([], []);
    }
  }

  handleRefresh() {
    this.dom.setRefreshState(true);
    this.loadFiles(this.state.currentPrefix, false, true)
      .finally(() => this.dom.setRefreshState(false));
  }

  async previewFile(key, fileName) {
    try {
      const data = await API.getFileContent(this.state.sessionId, this.state.currentBucket, key);
      this.dom.showModal(fileName, data.content);
    } catch (error) {
      this.dom.showError(error.message);
    }
  }

  downloadFile(key, fileName) {
    const url = API.getDownloadUrl(this.state.sessionId, this.state.currentBucket, key);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  handleDisconnect() {
    this.state.reset();
    this.dom.showCredentials();
    this.dom.credentialsForm.reset();
  }
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

function encodeS3Uri(uri) {
  // Only encode characters that must be encoded in URLs
  // Keep slashes, colons, and most other characters readable
  return uri.replace(/[^A-Za-z0-9\-_.~:/@]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  });
}

function buildPathUrl(s3Uri) {
  // Manually construct URL to avoid automatic encoding by browser
  // This ensures slashes and colons remain unencoded
  const encoded = encodeS3Uri(s3Uri);
  return '?path=' + encoded;
}

const app = new S3Explorer();
