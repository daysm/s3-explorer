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
    this.settingsBtn = document.getElementById('settings-btn');
    this.previewModal = document.getElementById('preview-modal');
    this.previewFilename = document.getElementById('preview-filename');
    this.previewContent = document.getElementById('preview-content');
    this.settingsModal = document.getElementById('settings-modal');
    this.settingsForm = document.getElementById('settings-form');
    this.settingsErrorMessage = document.getElementById('settings-error-message');
    this.profileSelect = document.getElementById('profile-select');
    this.settingsS3Uri = document.getElementById('settings-s3-uri');
    this.regionSelect = document.getElementById('region-select');
    this.historyContainer = document.getElementById('history-container');
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

  showSettingsModal() {
    this.settingsModal.style.display = 'flex';
  }

  closeSettingsModal() {
    this.settingsModal.style.display = 'none';
    this.hideSettingsError();
  }

  showSettingsError(message) {
    this.settingsErrorMessage.textContent = message;
    this.settingsErrorMessage.classList.add('show');
  }

  hideSettingsError() {
    this.settingsErrorMessage.textContent = '';
    this.settingsErrorMessage.classList.remove('show');
  }

  setRefreshState(loading) {
    this.refreshBtn.disabled = loading;
    this.refreshBtn.textContent = loading ? 'Refreshing...' : 'Refresh';
  }

  setSettingsFormState(loading) {
    const submitBtn = this.settingsForm.querySelector('button[type="submit"]');
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Applying...' : 'Apply Changes';
    this.profileSelect.disabled = loading;
    this.settingsS3Uri.disabled = loading;
    this.regionSelect.disabled = loading;
  }

  renderHistory(history) {
    if (!history || history.length === 0) {
      this.historyContainer.innerHTML = '<p class="history-empty">No recent S3 URIs</p>';
      return;
    }
    
    const historyHtml = history.map((entry, index) => `
      <div class="history-item" data-index="${index}">
        <div class="history-info">
          <div class="history-uri">${escapeHtml(entry.s3Uri)}</div>
          <div class="history-meta">
            <span class="history-profile">Profile: ${escapeHtml(entry.profile)}</span>
            ${entry.region ? `<span class="history-region">${escapeHtml(entry.region)}</span>` : ''}
            <span class="history-time">${HistoryManager.formatTimestamp(entry.lastUsed)}</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-history-load" data-index="${index}" title="Load this URI">↩</button>
          <button class="btn-history-delete" data-index="${index}" title="Delete this entry">×</button>
        </div>
      </div>
    `).join('');
    
    this.historyContainer.innerHTML = historyHtml;
  }
}

class API {
  static async getConfig() {
    const response = await fetch('/api/config');
    return response.json();
  }

  static async getProfiles() {
    const response = await fetch('/api/profiles');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get profiles');
    }
    return data;
  }

  static async updateConfig(config) {
    const response = await fetch('/api/update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update configuration');
    }
    return data;
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

class HistoryManager {
  static STORAGE_KEY = 's3-explorer-history';
  static MAX_ENTRIES = 10;

  static getHistory() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading history:', error);
      return [];
    }
  }

  static addEntry(profile, s3Uri, region = '') {
    const history = this.getHistory();
    const now = new Date().toISOString();
    
    const existingIndex = history.findIndex(
      entry => entry.profile === profile && entry.s3Uri === s3Uri && entry.region === region
    );
    
    if (existingIndex !== -1) {
      history[existingIndex].lastUsed = now;
      const [entry] = history.splice(existingIndex, 1);
      history.unshift(entry);
    } else {
      history.unshift({ profile, s3Uri, region, lastUsed: now });
      if (history.length > this.MAX_ENTRIES) {
        history.length = this.MAX_ENTRIES;
      }
    }
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }

  static deleteEntry(profile, s3Uri, region = '') {
    const history = this.getHistory();
    const filteredHistory = history.filter(
      entry => !(entry.profile === profile && entry.s3Uri === s3Uri && entry.region === region)
    );
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredHistory));
      return true;
    } catch (error) {
      console.error('Error deleting history entry:', error);
      return false;
    }
  }

  static formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
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
    app.loadFiles(path, true, false, false);
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
    this.cliMode = false;
    this.setupEventListeners();
    this.checkCliMode();
  }

  setupEventListeners() {
    this.dom.credentialsForm.addEventListener('submit', (e) => this.handleCredentialsSubmit(e));
    this.dom.disconnectBtn.addEventListener('click', () => this.handleDisconnect());
    this.dom.refreshBtn.addEventListener('click', () => this.handleRefresh());
    this.dom.settingsBtn.addEventListener('click', () => this.handleSettings());
    
    const closePreview = document.getElementById('close-preview');
    closePreview.addEventListener('click', () => this.dom.closeModal());

    const closeSettings = document.getElementById('close-settings');
    closeSettings.addEventListener('click', () => this.dom.closeSettingsModal());

    const cancelSettings = document.getElementById('cancel-settings');
    cancelSettings.addEventListener('click', () => this.dom.closeSettingsModal());

    this.dom.settingsForm.addEventListener('submit', (e) => this.handleSettingsSubmit(e));

    this.dom.previewModal.addEventListener('click', (e) => {
      if (e.target === this.dom.previewModal) {
        this.dom.closeModal();
      }
    });

    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) {
        this.dom.closeSettingsModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.dom.previewModal.style.display === 'flex') {
          this.dom.closeModal();
        } else if (this.dom.settingsModal.style.display === 'flex') {
          this.dom.closeSettingsModal();
        }
      }
    });

    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.prefix !== undefined) {
        this.loadFiles(event.state.prefix, false, false, true);
      }
    });
  }

  async checkCliMode() {
    try {
      const config = await API.getConfig();
      
      if (config.cliMode && config.sessionId && config.bucket) {
        this.cliMode = true;
        this.state.setSession(config.sessionId, config.bucket, config.rootPrefix);
        this.dom.showBrowser();
        this.dom.disconnectBtn.style.display = 'none';
        this.dom.settingsBtn.style.display = 'inline-flex';
        
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

  async loadFiles(prefix = '', pushState = true, refresh = false, restoreScroll = false) {
    // Save current scroll position before navigating away
    if (pushState && !restoreScroll) {
      const currentState = history.state;
      if (currentState && currentState.prefix !== undefined) {
        history.replaceState(
          { ...currentState, scrollY: window.scrollY },
          '',
          window.location.href
        );
      }
    }

    this.state.setCurrentPrefix(prefix);
    this.renderer.updateBreadcrumb();

    if (pushState) {
      const s3Uri = `s3://${this.state.currentBucket}/${prefix}`;
      const url = buildPathUrl(s3Uri);
      history.pushState({ prefix, scrollY: 0 }, '', url);
    }

    try {
      const data = await API.listFiles(this.state.sessionId, this.state.currentBucket, prefix, refresh);
      this.renderer.renderFiles(data.folders, data.files);
      
      // Restore scroll position if navigating back/forward
      if (restoreScroll && history.state && history.state.scrollY !== undefined) {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          window.scrollTo(0, history.state.scrollY);
        });
      }
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

  async handleSettings() {
    try {
      // Load available profiles
      const profilesData = await API.getProfiles();
      this.dom.profileSelect.innerHTML = '';
      
      if (profilesData.profiles.length === 0) {
        this.dom.profileSelect.innerHTML = '<option value="">No profiles found</option>';
        this.dom.showSettingsError('No AWS profiles found in ~/.aws/credentials or ~/.aws/config');
        this.dom.showSettingsModal();
        return;
      }

      // Get current config
      const config = await API.getConfig();
      
      // Populate profile dropdown
      profilesData.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;
        if (profile === config.profile) {
          option.selected = true;
        }
        this.dom.profileSelect.appendChild(option);
      });

      // Set current S3 URI and region
      const currentUri = config.rootPrefix 
        ? `s3://${config.bucket}/${config.rootPrefix}` 
        : `s3://${config.bucket}/`;
      this.dom.settingsS3Uri.value = currentUri;
      this.dom.regionSelect.value = config.region || '';

      // Load and display history
      const history = HistoryManager.getHistory();
      this.dom.renderHistory(history);
      this.attachHistoryHandlers(history);

      this.dom.hideSettingsError();
      this.dom.showSettingsModal();
    } catch (error) {
      this.dom.showError(error.message);
    }
  }

  attachHistoryHandlers(history) {
    // Add click handlers for load buttons
    this.dom.historyContainer.querySelectorAll('.btn-history-load').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(e.currentTarget.dataset.index);
        const entry = history[index];
        this.dom.profileSelect.value = entry.profile;
        this.dom.settingsS3Uri.value = entry.s3Uri;
        this.dom.regionSelect.value = entry.region || '';
      });
    });

    // Add click handlers for delete buttons
    this.dom.historyContainer.querySelectorAll('.btn-history-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(e.currentTarget.dataset.index);
        const entry = history[index];
        
        if (confirm(`Delete history entry for ${escapeHtml(entry.s3Uri)}?`)) {
          HistoryManager.deleteEntry(entry.profile, entry.s3Uri, entry.region);
          // Re-render history
          const updatedHistory = HistoryManager.getHistory();
          this.dom.renderHistory(updatedHistory);
          // Re-attach handlers
          this.attachHistoryHandlers(updatedHistory);
        }
      });
    });
  }

  async handleSettingsSubmit(e) {
    e.preventDefault();
    
    const profile = this.dom.profileSelect.value;
    const s3Uri = this.dom.settingsS3Uri.value;
    const region = this.dom.regionSelect.value;

    this.dom.hideSettingsError();
    this.dom.setSettingsFormState(true);

    try {
      const data = await API.updateConfig({
        profile,
        s3Uri,
        region: region || undefined
      });

      // Update state with new configuration
      this.state.setSession(this.state.sessionId, data.bucket, data.rootPrefix);
      
      // Save to history
      HistoryManager.addEntry(profile, s3Uri, region);
      
      // Close modal
      this.dom.closeSettingsModal();
      
      // Reload the browser at the new root
      await this.loadFiles(data.rootPrefix, false);
      
      // Update URL
      const newS3Uri = `s3://${data.bucket}/${data.rootPrefix}`;
      history.replaceState({ prefix: data.rootPrefix }, '', buildPathUrl(newS3Uri));
      
      this.renderer.updateBreadcrumb();
    } catch (error) {
      this.dom.showSettingsError(error.message);
    } finally {
      this.dom.setSettingsFormState(false);
    }
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
