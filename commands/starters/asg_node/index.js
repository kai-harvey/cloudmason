const express = require('express');
const path = require('path');
const fs = require('fs');
const Infra = require('./modules/appConfig.js');

// Port must be 8080
const app = express();
const PORT = 8080;

// Use JSON
app.use(express.json());

// Protect Routes: User email and groups available in req.user
app.use(Infra.verifyUser);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// app.use('/a',express.static(path.join(__dirname, 'public')));

// app.get('/', (req, res, next) => {
//     if (req.headers['x-amzn-oidc-data'] || process.env.$IS_LOCAL == 'y'){
//         res.redirect('/a');
//     } else {
//         next();
//     }
// });

app.get('/api/health', (req, res) => {
    res.send('OK:' + process.env.$APP_S3BUCKET);
});

app.get('/a/whoami', async (req, res) => {
    const logs = [
        `access:${req.headers['x-amzn-oidc-accesstoken']}`,
        `oidc:${req.headers['x-amzn-oidc-data']}`,
        `user:${req.headers['x-amzn-oidc-identity']}`
    ];
    Infra.log(logs.join('\n'),true);
    res.json(res.locals.user);
});

// Start Server
Infra.setParams(__dirname).then(()=>{
    console.log(`Starting Server for ${process.env.$APP_ID} in ${process.env.$APP_REGION}`,true);
    app.listen(PORT, async () => {
        console.log(`${process.env.$APP_ID} running on http://localhost:${PORT} in ${process.env.$APP_REGION}`);
        Infra.log(`Boot Complete ${process.env.$APP_ID}@${process.env.$APP_REGION}`,true);
    });
});