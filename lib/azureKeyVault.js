const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const _ = require('lodash');

class AzureKeyVaultHelper {
  constructor(keyVaultUrl) {
    this.keyVaultUrl = keyVaultUrl;
    this.secretClient = null;
    this.secretsCache = new Map();
    
    if (keyVaultUrl) {
      try {
        const credential = new DefaultAzureCredential();
        this.secretClient = new SecretClient(keyVaultUrl, credential);
      } catch (error) {
        console.warn(`Failed to initialize Azure Key Vault client: ${error.message}`);
        console.warn('Falling back to local config files');
      }
    }
  }

  /**
   * Get a single secret from Azure Key Vault
   * @param {string} secretName - Name of the secret in Key Vault
   * @returns {Promise<string|null>} - Secret value or null if not found
   */
  async getSecret(secretName) {
    if (!this.secretClient) {
      return null;
    }

    // Check cache first
    if (this.secretsCache.has(secretName)) {
      return this.secretsCache.get(secretName);
    }

    try {
      const secret = await this.secretClient.getSecret(secretName);
      const value = secret.value;
      this.secretsCache.set(secretName, value);
      return value;
    } catch (error) {
      console.warn(`Failed to get secret "${secretName}" from Azure Key Vault: ${error.message}`);
      return null;
    }
  }

  /**
   * Get multiple secrets from Azure Key Vault
   * @param {string[]} secretNames - Array of secret names
   * @returns {Promise<Object>} - Object with secret names as keys and values as values
   */
  async getSecrets(secretNames) {
    if (!this.secretClient) {
      return {};
    }

    const secrets = {};
    const uncachedSecrets = secretNames.filter(name => !this.secretsCache.has(name));

    // Fetch uncached secrets in parallel
    const fetchPromises = uncachedSecrets.map(async (secretName) => {
      try {
        const secret = await this.secretClient.getSecret(secretName);
        const value = secret.value;
        this.secretsCache.set(secretName, value);
        return { name: secretName, value };
      } catch (error) {
        console.warn(`Failed to get secret "${secretName}" from Azure Key Vault: ${error.message}`);
        return { name: secretName, value: null };
      }
    });

    const results = await Promise.all(fetchPromises);
    
    // Combine cached and newly fetched secrets
    secretNames.forEach(secretName => {
      secrets[secretName] = this.secretsCache.get(secretName) || 
        results.find(r => r.name === secretName)?.value || null;
    });

    return secrets;
  }

  /**
   * Populate config object with secrets from Azure Key Vault
   * Supports nested object paths like "partnerConfig.notion.request.headers.Authorization"
   * @param {Object} config - Config object to populate
   * @param {Object} secretMappings - Mapping of secret names to config paths
   * @returns {Promise<Object>} - Config object with secrets populated
   */
  async populateConfigFromSecrets(config, secretMappings) {
    if (!this.secretClient) {
      return config;
    }

    const secretNames = Object.values(secretMappings);
    const secrets = await this.getSecrets(secretNames);

    // Create reverse mapping: secret name -> config path
    const reverseMapping = {};
    Object.entries(secretMappings).forEach(([configPath, secretName]) => {
      if (!reverseMapping[secretName]) {
        reverseMapping[secretName] = [];
      }
      reverseMapping[secretName].push(configPath);
    });

    // Populate config with secrets
    Object.entries(reverseMapping).forEach(([secretName, configPaths]) => {
      const secretValue = secrets[secretName];
      if (secretValue !== null) {
        configPaths.forEach(configPath => {
          _.set(config, configPath, secretValue);
        });
      }
    });

    return config;
  }
}

module.exports = AzureKeyVaultHelper;

