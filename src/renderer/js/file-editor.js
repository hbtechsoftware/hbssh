/**
 * File Editor Module
 * Handles file editing functionality for SFTP browser
 */

class FileEditor {
  constructor() {
    this.modal = document.getElementById('fileEditorModal');
    this.titleElement = document.getElementById('fileEditorTitle');
    this.textarea = document.getElementById('fileEditorTextarea');
    this.statusElement = document.getElementById('fileEditorStatus');
    this.saveButton = document.getElementById('saveFileButton');
    this.cancelButton = document.getElementById('cancelFileEditButton');
    this.closeButton = document.getElementById('closeFileEditorModal');
    
    this.currentFile = null;
    this.currentConnectionId = null;
    this.originalContent = '';
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // Close modal events
    this.closeButton?.addEventListener('click', () => this.closeEditor());
    this.cancelButton?.addEventListener('click', () => this.closeEditor());
    
    // Save file event
    this.saveButton?.addEventListener('click', () => this.saveFile());
    
    // Close modal when clicking outside
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeEditor();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.modal?.style.display === 'block') {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 's') {
            e.preventDefault();
            this.saveFile();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeEditor();
          }
        }
      }
    });
    
    // Track changes
    this.textarea?.addEventListener('input', () => {
      this.updateStatus();
    });
  }
  
  /**
   * Opens a file for editing
   * @param {string} connectionId - SSH connection ID
   * @param {string} filePath - Path to the file
   * @param {string} fileName - Name of the file
   */
  async openFile(connectionId, filePath, fileName) {
    try {
      this.currentConnectionId = connectionId;
      this.currentFile = filePath;
      
      // Update modal title
      if (this.titleElement) {
        this.titleElement.textContent = `Editing: ${fileName}`;
      }
      
      // Show loading status
      this.updateStatus('Loading file...');
      
      // Read file content via SFTP
      const content = await window.api.readSFTPFile(connectionId, filePath);
      
      if (this.textarea) {
        this.textarea.value = content;
        this.originalContent = content;
      }
      
      // Show modal
      if (this.modal) {
        this.modal.style.display = 'block';
      }
      
      // Focus textarea
      setTimeout(() => {
        if (this.textarea) {
          this.textarea.focus();
        }
      }, 100);
      
      this.updateStatus('Ready');
      
    } catch (error) {
      console.error('Failed to open file for editing:', error);
      this.updateStatus(`Error: ${error.message}`);
      
      // Show error and close modal after delay
      setTimeout(() => {
        this.closeEditor();
      }, 2000);
    }
  }
  
  /**
   * Saves the current file
   */
  async saveFile() {
    if (!this.currentFile || !this.currentConnectionId || !this.textarea) {
      return;
    }
    
    try {
      this.updateStatus('Saving...');
      
      const content = this.textarea.value;
      
      // Write file content via SFTP
      await window.api.writeSFTPFile(this.currentConnectionId, this.currentFile, content);
      
      this.originalContent = content;
      this.updateStatus('Saved successfully');
      
      // Clear status after delay
      setTimeout(() => {
        this.updateStatus('Ready');
      }, 2000);
      
    } catch (error) {
      console.error('Failed to save file:', error);
      this.updateStatus(`Save error: ${error.message}`);
    }
  }
  
  /**
   * Closes the file editor
   */
  closeEditor() {
    if (this.hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) {
        return;
      }
    }
    
    if (this.modal) {
      this.modal.style.display = 'none';
    }
    
    // Reset state
    this.currentFile = null;
    this.currentConnectionId = null;
    this.originalContent = '';
    
    if (this.textarea) {
      this.textarea.value = '';
    }
    
    this.updateStatus('');
  }
  
  /**
   * Checks if there are unsaved changes
   * @returns {boolean}
   */
  hasUnsavedChanges() {
    if (!this.textarea) return false;
    return this.textarea.value !== this.originalContent;
  }
  
  /**
   * Updates the status message
   * @param {string} message - Status message
   */
  updateStatus(message = '') {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
    
    // Update save button state
    if (this.saveButton) {
      const hasChanges = this.hasUnsavedChanges();
      this.saveButton.disabled = !hasChanges;
      this.saveButton.textContent = hasChanges ? 'Save *' : 'Save';
    }
  }
}

// Initialize file editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.fileEditor = new FileEditor();
});

export default FileEditor;