/**
 * Common utilities for HBSSH
 */

/**
 * Generate a unique ID
 * @returns {string} A unique ID
 */
export const generateId = () => {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
};

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Validate an SSH connection
 * @param {Object} connection - Connection object
 * @returns {Object} Object with isValid and message properties
 */
export const validateConnection = (connection) => {
  if (!connection.name || connection.name.trim() === '') {
    return { isValid: false, message: 'Connection name is required' };
  }

  if (!connection.host || connection.host.trim() === '') {
    return { isValid: false, message: 'Host is required' };
  }

  if (!connection.username || connection.username.trim() === '') {
    return { isValid: false, message: 'Username is required' };
  }

  if (connection.authType === 'password' && (!connection.password || connection.password.trim() === '')) {
    return { isValid: false, message: 'Password is required for password authentication' };
  }

  if (connection.authType === 'privateKey' && (!connection.privateKeyPath || connection.privateKeyPath.trim() === '')) {
    return { isValid: false, message: 'Private key path is required for key authentication' };
  }

  return { isValid: true, message: '' };
}; 