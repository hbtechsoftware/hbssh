/**
 * Manages SSH connections and their configuration
 */
export class ConnectionManager {
  constructor() {
    this.connections = [];
    this.connectionListeners = [];
  }
  
  /**
   * Load saved connections from storage
   */
  async loadConnections() {
    try {
      this.connections = await window.api.getSavedConnections();
      this.notifyConnectionsUpdated();
    } catch (error) {
      console.error('Failed to load connections:', error);
      this.connections = [];
    }
  }
  
  /**
   * Get all connections
   * @returns {Array} Array of connection objects
   */
  getConnections() {
    return this.connections;
  }
  
  /**
   * Get connection by ID
   * @param {string} id - Connection ID
   * @returns {Object|null} Connection object or null if not found
   */
  getConnectionById(id) {
    return this.connections.find(conn => conn.id === id) || null;
  }
  
  /**
   * Save a connection
   * @param {Object} connection - Connection object to save
   * @returns {Promise<Object>} The saved connection
   */
  async saveConnection(connection) {
    try {
      this.connections = await window.api.saveConnection(connection);
      this.notifyConnectionsUpdated();
      return connection;
    } catch (error) {
      console.error('Failed to save connection:', error);
      throw error;
    }
  }
  
  /**
   * Delete a connection
   * @param {string} id - Connection ID to delete
   * @returns {Promise<void>}
   */
  async deleteConnection(id) {
    try {
      this.connections = await window.api.deleteConnection(id);
      this.notifyConnectionsUpdated();
    } catch (error) {
      console.error('Failed to delete connection:', error);
      throw error;
    }
  }
  
  /**
   * Subscribe to connections updated event
   * @param {Function} listener - Callback function
   */
  onConnectionsUpdated(listener) {
    this.connectionListeners.push(listener);
  }
  
  /**
   * Notify all listeners that connections have been updated
   */
  notifyConnectionsUpdated() {
    this.connectionListeners.forEach(listener => listener(this.connections));
  }
} 