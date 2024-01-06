const express = require('express');
const path = require('path');
const fs = require('fs');
const Infra = require('./modules/appConfig.js');

// Port must be 8080
const app = express();
const PORT = 8080;

// Use JSON
app.use(express.json());

// Protect Routes
// User info and cognito groups available in the res.local.user object
app.use(Infra.verifyUser);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
    let results = ''
    const ddB = Infra.checkDDBConnection().then((res)=>{results += `DDB Connection OK: ${res.ok} [${res.msg}]\n` });
    const s3 = Infra.checkS3Connection().then((res)=>{results += `S3 Connection OK: ${res.ok} [${res.msg}]\n` });
    Promise.all([ddB,s3]).then(()=>{
        res.send(results);
    });
});

app.get('/config', async (req, res) => {
    const cnf = {
        app: process.env.$APP_ID,
        region: process.env.$APP_REGION,
        user: res.locals.user,
        version: process.env.$APP_VERSION,
        env: process.env.$APP_ENV
    };
    res.json(cnf);
})

app.get('/whoami', async (req, res) => {
    const logs = [
        `access:${req.headers['x-amzn-oidc-accesstoken']}`,
        `oidc:${req.headers['x-amzn-oidc-data']}`,
        `user:${req.headers['x-amzn-oidc-identity']}`
    ];
    // Infra.log(logs.join('\n'),true);
    console.log(logs.join('\n'));
    res.json(res.locals.user);
});

app.get('/log', async (req, res) => {
    console.log('log>>',req.query);
    res.send('OK');
});

// Start Server
Infra.setParams(__dirname).then(()=>{
    console.log(`Starting Server for ${process.env.$APP_ID} in ${process.env.$APP_REGION}`,true);
    app.listen(PORT, async () => {
        console.log(`${process.env.$APP_ID} running on http://localhost:${PORT} in ${process.env.$APP_REGION}`);
        Infra.log(`Boot Complete ${process.env.$APP_ID}@${process.env.$APP_REGION}`,true);
    });
});