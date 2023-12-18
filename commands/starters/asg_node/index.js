const express = require('express');
const path = require('path');
const fs = require('fs');
const App = require('./modules/appConfig.js');

// Port must be 8080
const app = express();
const PORT = 8080;

// Use JSON
app.use(express.json());

// Protect Routes: User email and groups available in req.user
app.use(App.verifyUser);


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// app.all('/*', function (req, res, next) {
//     console.log('Request received');
//     Object.keys(req.headers).forEach(h=>{ console.log(h, req.headers[h]) });
//     next();
// });

// app.get('/oauth/**', (req, res) => {
//     res.send(`Hello from ${process.env.$APP_INSTANCE} in ${process.env.$APP_REGION}`);
// });


// app.get('/mason', (req, res) => {
//     res.send(`Hello from ${process.env.$APP_INSTANCE} in ${process.env.$APP_REGION}`);
// });

// Start Server
App.setParams(__dirname).then(()=>{
    App.log(`Starting Server for ${process.env.$APP_INSTANCE} in ${process.env.$APP_REGION}`,true);
    app.listen(PORT, () => {
        console.log(`${process.env.$APP_ID} running on http://localhost:${PORT} in ${process.env.$APP_REGION}`);
    });
})

