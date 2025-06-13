const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');

class ProjectMetadataFetcher {
  static async fetch(resourcePath, transformFn = (text) => text) {
    const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/';
    const headers = { 'Metadata-Flavor': 'Google' };

    try {
      const response = await fetch(metadataUrl + resourcePath, { headers });
      if (response.ok) {
        const text = await response.text();
        return transformFn(text);
      } else {
        console.warn(`Failed to fetch ${resourcePath} from metadata server.`);
        return null;
      }
    } catch (error) {
      console.warn(`Error accessing metadata server for ${resourcePath}:`, error);
      return null;
    }
  }
}

class ServiceMetadataConfig {
  constructor(projectId, projectNumber, backendServiceId, cloudRegion) {
    this.projectId = projectId ? projectId : ProjectMetadataFetcher.fetch('project/project-id');
    this.projectNumber = projectNumber ? projectNumber : ProjectMetadataFetcher.fetch('project/numeric-project-id');
    this.backendServiceId = backendServiceId;
    this.cloudRegion = cloudRegion ? cloudRegion : ProjectMetadataFetcher.fetch('instance/region', (text) => text.split('/').pop());
  }
}

class IapValidator {
  constructor(metaDataConfig) {
    this.oAuth2Client = new OAuth2Client();
    this.serviceMetadataConfig = metaDataConfig;
  }  

  async getExpectedAudience() {
    const backendServiceId = await this.serviceMetadataConfig.backendServiceId;
    const projectNumber = await this.serviceMetadataConfig.projectNumber;
    const cloudRegion = await this.serviceMetadataConfig.cloudRegion;
    if (backendServiceId) {
      const isNumerical = /^\d+$/.test(backendServiceId);
      return isNumerical
        ? `/projects/${projectNumber}/global/backendServices/${backendServiceId}`
        : `/projects/${projectNumber}/locations/${cloudRegion}/services/${backendServiceId}`;
    } else {
      return `/projects/${await this.serviceMetadataConfig.projectNumber}/apps/${await this.serviceMetadataConfig.projectId}`;
    }
  }

  async verifyIapIdToken(iapJwt) {
    const expectedAudience = await this.getExpectedAudience();
    if (!expectedAudience) {
      console.warn('Expected audience not determined. Skipping audience verification.');
    }

    try {
      const response = await this.oAuth2Client.getIapPublicKeys();
      const ticket = await this.oAuth2Client.verifySignedJwtWithCertsAsync(
        iapJwt,
        response.pubkeys,
        expectedAudience,
        ['https://cloud.google.com/iap']
      );
      return ticket.getPayload();
    } catch (error) {
      console.error('Error verifying IAP ID token:', error);
      return null;
    }
  }
}

module.exports = { ServiceMetadataConfig, IapValidator };