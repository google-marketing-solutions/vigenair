const express = require('express');
const path = require('path');
const {IapValidator, ServiceMetadataConfig} = require('./iapValidator');

const app = express();
const port = 8080;

const staticFilesPath = path.join(__dirname, 'public');

const serviceMetadataConfig = new ServiceMetadataConfig(
  process.env.PROJECT_ID,
  process.env.PROJECT_NUMBER,
  process.env.IAP_SERVICE_ID || process.env.K_SERVICE,
  process.env.K_SERVICE_REGION
);

const iapValidator = new IapValidator(serviceMetadataConfig);

const validateIap = async (req, res, next) => {
  const iapJwt = req.headers['x-goog-iap-jwt-assertion'];
  if (!iapJwt) {
    return res.status(401).send('Missing IAP ID token in request header (x-goog-iap-jwt-assertion)');
  }
  try {
    const payload = await iapValidator.verifyIapIdToken(iapJwt);
    if (payload) {
      console.log('IAP token validated successfully for user:', payload.email);
      req.user = payload.email;
      next();
    } else {
      console.warn('Invalid IAP JWT received.');
      res.status(403).send('Invalid IAP ID token');
    }
  } catch (error) {
    console.error('Error during IAP token verification:', error);
    res.status(500).send('Internal server error during authentication.');
  }
};


app.get('/', validateIap, (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'index.html'), (err) => {
    if (err) {
      console.error(`Error sending file index.html: ${err}`);
      if (!res.headersSent) {
        res.status(500).type('text/plain').send('Error serving requested file.');
      }
    }
  });
});

app.get('/service_url', validateIap, async (req, res) => {
  try {
    let serviceUrl = process.env.SERVICE_URL_OVERRIDE;
    if (!serviceUrl) {
      const projectNumber = await serviceMetadataConfig.projectNumber;
      const cloudRegion = await serviceMetadataConfig.cloudRegion;
      const backendServiceId = await serviceMetadataConfig.backendServiceId;

      serviceUrl = `https://${backendServiceId}-${projectNumber}.${cloudRegion}.run.app`;
    }

    res.json({
      url: serviceUrl
    });
  } catch (error) {
    console.error('Error constructing service URL:', error);
    res.status(500).json({ error: 'Failed to construct service URL' });
  }
});

app.get('/userinfo', validateIap, (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).send('User information not available.');
  }
});

app.use(express.static(staticFilesPath));

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});