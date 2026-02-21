// audioHandler WebSocket Handler
// Handles WebSocket connections for audioHandler audio streaming

const WebSocket = require('ws');
const { logError, logInfo } = require('../console');
const audioHandler = require('./audio-handler');

class audioHandlerWebSocket {
    constructor() {
        this.audio = new audioHandler();
        this.clients = new Map();
        this.isInitialized = false;
        this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    }

    // Initialize the WebSocket handler
    async initialize() {
        logInfo('[audioHandlerWebSocket] Initializing WebSocket handler...');
        
        try {
            await this.audio.initialize();
            
            this.isInitialized = true;
            logInfo('[audioHandlerWebSocket] WebSocket handler initialized successfully');
            
        } catch (error) {
            logError(`[audioHandlerWebSocket] Failed to initialize: ${error.message}`);
            throw error;
        }
    }

    // Handle WebSocket upgrade
    handleUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (client) => {
            this.handleConnection(client);
        });
    }

    // Handle new WebSocket connection
    handleConnection(client) {
        logInfo('[audioHandlerWebSocket] New client connected');
        
        // Add client to audio handler
        this.audio.addClient(client);
        
        // Store client reference
        this.clients.set(client, {
            connected: true,
            timestamp: Date.now()
        });
        
        // Handle client close
        client.on('close', function() {
            this.handleDisconnection(client);
        }.bind(this));
        
        // Handle client errors
        client.on('error', function(error) {
            logError(`[audioHandlerWebSocket] Client error: ${error.message}`);
        });
    }

    // Handle client disconnection
    handleDisconnection(client) {
        logInfo('[audioHandlerWebSocket] Client disconnected');
        
        // Remove client from audio handler
        this.audio.clients.delete(client);
        
        // Remove client reference
        this.clients.delete(client);
    }

    // Get status information
    getStatus() {
        return {
            initialized: this.isInitialized,
            clients: this.clients.size,
            audioHandler: this.audio.getStatus()
        };
    }

    // Stop the WebSocket handler
    async stop() {
        logInfo('[audioHandlerWebSocket] Stopping WebSocket handler...');
        
        // Close all client connections
        this.clients.forEach(function(clientInfo, client) {
            try {
                client.close();
            } catch (error) {
                logError(`[audioHandlerWebSocket] Failed to close client: ${error.message}`);
            }
        });
        
        // Stop audio handler
        await this.audio.stop();
        
        this.clients.clear();
        this.isInitialized = false;
        
        logInfo('[audioHandlerWebSocket] WebSocket handler stopped');
    }
}

// Export the audioHandlerWebSocket class
module.exports = audioHandlerWebSocket;
