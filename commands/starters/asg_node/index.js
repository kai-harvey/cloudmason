const express = require('express');
const path = require('path');
const fs = require('fs');

// Port must be 8080
const app = express();
const PORT = 8080;

// Retrieve the config values
setConfig();



// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/mason', (req, res) => {
    res.send(`Hello from ${process.env.instance} in ${process.env.region}`);
});

app.listen(PORT, () => {
    console.log(`${process.env.instance} running on http://localhost:${PORT} in ${process.env.region}`);
});

function setConfig(){
    const configPath = path.resolve(__dirname,'mason.txt');
    const configText = fs.readFileSync(configPath,'utf-8');
    const configLines = configText.split(',');
    process.env.region = configLines[0];
    process.env.instance = configLines[1];
    console.log(process.env.region)
    console.log(process.env.instance)
}

