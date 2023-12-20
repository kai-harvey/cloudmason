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
// app.use(App.verifyUser);


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
    res.send('OK:' + process.env.$APP_S3BUCKET);
});

app.get('/whoami', async (req, res) => {
    // const token = req.headers['x-amzn-oidc-data'];
    const token = `eyJ0eXAiOiJKV1QiLCJraWQiOiIzMWFmZTU2MS02OTUyLTQ1YTEtOGU0Mi05YjM2OWQwNTI5ODkiLCJhbGciOiJFUzI1NiIsImlzcyI6Imh0dHBzOi8vY29nbml0by1pZHAudXMtd2VzdC0yLmFtYXpvbmF3cy5jb20vdXMtd2VzdC0yX001TWI3VndOdiIsImNsaWVudCI6IjFjMHM5cXYzdXV2YTVxMXVzcGVnczZlaHNtIiwic2lnbmVyIjoiYXJuOmF3czplbGFzdGljbG9hZGJhbGFuY2luZzp1cy13ZXN0LTI6Mzg3Mjg2Mjk3MzE1OmxvYWRiYWxhbmNlci9hcHAvTUVBTlRULUFwcEFMLXFhWGI5WDcwV3BSMS85NWQyNzcwNGRiZGY1NzE5IiwiZXhwIjoxNzAzMDI3MDY3fQ==.eyJzdWIiOiI1OWU0YTkwNy02NzQ4LTRlNWYtODUzZC0wMmM0YTcwNmE1YjUiLCJlbWFpbCI6ImtraEBra2guaW8iLCJ1c2VybmFtZSI6IjU5ZTRhOTA3LTY3NDgtNGU1Zi04NTNkLTAyYzRhNzA2YTViNSIsImV4cCI6MTcwMzAyNzA2NywiaXNzIjoiaHR0cHM6Ly9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbS91cy13ZXN0LTJfTTVNYjdWd052In0=.y_B2_t6ORlDtfyOmoMDMj3VR-vrAITgGOvcBL21u_YpOdzgQYECZhH5-o_fGQikgwb2AsTR2MggLVDErjmGoVg==`
    // await Infra.log(`whoami: ${token}`);
    // try {
        const user = await Infra.verifyUser(token);
        console.log('user',user);
        const rval = typeof user === 'string' ? user : JSON.stringify(user);
        res.send(rval);
    // } catch (e) {
    //     res.status(407).send('err' + e.message);
    // }
});

// Start Server
Infra.setParams(__dirname).then(()=>{
    console.log('Starting Server ');
    // Infra.log(`Starting Server for ${process.env.$APP_ID} in ${process.env.$APP_REGION}`,true);
    app.listen(PORT, async () => {
        console.log(`${process.env.$APP_ID} running on http://localhost:${PORT} in ${process.env.$APP_REGION}`);
        Infra.log('Boot Complete',true);
    });
})

// [   20.818662] cloud-init[2212]: