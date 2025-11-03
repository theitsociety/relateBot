# Azure Key Vault Setup Guide

This guide explains how to store your production secrets in Azure Key Vault and configure the application to read from it.

## Overview

The application supports loading secrets from Azure Key Vault instead of storing them directly in configuration files. This provides better security and centralized secret management.

## Prerequisites

- Azure subscription
- Azure CLI installed and configured
- Application deployed to Azure (or configured with Azure Managed Identity)

## Step 1: Create Azure Key Vault

1. Create a Key Vault using Azure Portal or CLI:

```bash
az keyvault create \
  --name <your-keyvault-name> \
  --resource-group <your-resource-group> \
  --location <your-location>
```

Example:
```bash
az keyvault create \
  --name relatebot-secrets \
  --resource-group relatebot-rg \
  --location eastus
```

## Step 2: Set Secrets in Key Vault

Add all secrets that correspond to the mappings in `configs/service/secretMappings.json`:

### Discord Secrets
```bash
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-BOT-TOKEN" --value "<your-discord-token>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-ADMIN-ROLE-ID" --value "<admin-role-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-COMMUNITY-BUILDER-ROLE-ID" --value "<community-builder-role-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-MENTOR-RELATIONS-ROLE-ID" --value "<mentor-relations-role-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-DONATIONS-CHANNEL-ID" --value "<donations-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-LOG-CHANNEL-ID" --value "<log-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-WELCOME-CHANNEL-ID" --value "<welcome-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-ROLE-SELECTION-CHANNEL-ID" --value "<role-selection-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-REGISTRATION-CHANNEL-ID" --value "<registration-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-REFERRALS-CHANNEL-ID" --value "<referrals-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-COMMUNITY-BUILDERS-CHANNEL-ID" --value "<community-builders-channel-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-ONBOARDING-CATEGORY-ID" --value "<onboarding-category-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-MENTORSHIP-CATEGORY-ID" --value "<mentorship-category-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-COORDINATOR-ROLE-ID" --value "<coordinator-role-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-CLIENT-ID" --value "<discord-client-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "DISCORD-GUILD-ID" --value "<discord-guild-id>"
```

### Notion Secrets
```bash
az keyvault secret set --vault-name <your-keyvault-name> --name "NOTION-REGISTRATION-DATABASE-ID" --value "<notion-registration-db-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "NOTION-SKILL-DATABASE-ID" --value "<notion-skill-db-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "NOTION-REFERRAL-DATABASE-ID" --value "<notion-referral-db-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "NOTION-MENTORSHIP-DATABASE-ID" --value "<notion-mentorship-db-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "NOTION-API-SECRET" --value "Bearer <notion-api-secret>"
```

### Google Secrets
```bash
az keyvault secret set --vault-name <your-keyvault-name> --name "GOOGLE-CLIENT-ID" --value "<google-client-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "GOOGLE-PROJECT-ID" --value "<google-project-id>"
az keyvault secret set --vault-name <your-keyvault-name> --name "GOOGLE-CLIENT-SECRET" --value "<google-client-secret>"
az keyvault secret set --vault-name <your-keyvault-name> --name "GOOGLE-REFRESH-TOKEN" --value "<google-refresh-token>"
```

## Step 3: Configure Authentication

The application uses `DefaultAzureCredential` which supports multiple authentication methods:

### Option A: Managed Identity (Recommended for Azure deployments)

If your application is running on Azure (App Service, VM, Container Instances, etc.), use Managed Identity:

1. Enable Managed Identity on your Azure resource
2. Grant the identity access to Key Vault:

```bash
# Get the principal ID of your Managed Identity
PRINCIPAL_ID=$(az resource show --id /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.Web/sites/<app-name>/providers/Microsoft.ManagedIdentity/identities/default --query principalId -o tsv)

# Grant access to Key Vault
az keyvault set-policy \
  --name <your-keyvault-name> \
  --object-id $PRINCIPAL_ID \
  --secret-permissions get list
```

### Option B: Service Principal

1. Create a Service Principal:

```bash
az ad sp create-for-rbac --name relatebot-keyvault-reader
```

2. Grant access to Key Vault:

```bash
az keyvault set-policy \
  --name <your-keyvault-name> \
  --spn <service-principal-id> \
  --secret-permissions get list
```

3. Set environment variables:

```bash
export AZURE_CLIENT_ID=<client-id>
export AZURE_CLIENT_SECRET=<client-secret>
export AZURE_TENANT_ID=<tenant-id>
```

### Option C: Azure CLI Authentication (for local development)

1. Login to Azure CLI:

```bash
az login
```

2. Set the subscription:

```bash
az account set --subscription <subscription-id>
```

## Step 4: Configure Application

Set the `AZURE_KEY_VAULT_URL` environment variable:

```bash
export AZURE_KEY_VAULT_URL="https://<your-keyvault-name>.vault.azure.net/"
```

Or in your deployment configuration (Azure App Service, etc.), add it as an environment variable.

## Step 5: Update Configuration File

Use the template file `configs/service/config_prod.json.template` as a reference. Your actual `config_prod.json` should have placeholder values or be omitted entirely if all secrets come from Key Vault.

## How It Works

1. On startup, the application checks for the `AZURE_KEY_VAULT_URL` environment variable
2. If set, it loads the secret mappings from `configs/service/secretMappings.json`
3. It fetches all secrets from Azure Key Vault in parallel
4. Secrets are merged into the configuration object at the paths specified in the mappings
5. If Azure Key Vault is not configured or unavailable, the application falls back to local config files

## Troubleshooting

### Issue: "Failed to initialize Azure Key Vault client"

**Solution**: Ensure you're authenticated with Azure. Check your authentication method (Managed Identity, Service Principal, or Azure CLI).

### Issue: "Failed to get secret" warnings

**Solution**: 
- Verify the secret name exists in Key Vault
- Check that the service principal/Managed Identity has `get` and `list` permissions on the Key Vault
- Verify the Key Vault URL is correct

### Issue: Secrets not being populated

**Solution**:
- Check that `AZURE_KEY_VAULT_URL` environment variable is set correctly
- Verify the secret names in Key Vault match the names in `secretMappings.json`
- Check application logs for error messages

## Security Best Practices

1. **Never commit secrets**: Keep `config_prod.json` out of version control or use placeholders
2. **Use Managed Identity**: Prefer Managed Identity over Service Principals for Azure deployments
3. **Limit access**: Grant minimal permissions (only `get` and `list` on secrets)
4. **Rotate secrets**: Regularly rotate secrets stored in Key Vault
5. **Enable logging**: Enable Key Vault audit logs to monitor secret access

## Local Development

For local development without Azure Key Vault, simply don't set the `AZURE_KEY_VAULT_URL` environment variable. The application will use local config files as before.

