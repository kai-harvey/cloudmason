const { SSMClient,GetParametersByPathCommand } = require("@aws-sdk/client-ssm");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fetch = require('node-fetch');
const JWS = require('jws');

const path = require('path');
const fs = require('fs');

const logLines = [];

exports.setParams = async function(rootDir){
    console.log('Setting Params');
    // Read App Name and Region from mason.txt
    const configPath = path.resolve(rootDir,'mason.txt');
    const configText = fs.readFileSync(configPath,'utf-8');
    const configLines = configText.split(',');
    process.env.$APP_REGION = configLines[0].trim();
    process.env.$APP_ID = configLines[1].trim();
    process.env.$IS_LOCAL = configLines[2] ? true : false;  
    console.log(`REGION: ${process.env.$APP_REGION} APP_ID: ${process.env.$APP_ID} LOCAL: ${process.env.$IS_LOCAL}`)

    // Get the parameters from SSM
    const ssmClient = new SSMClient({ region: process.env.$APP_REGION }); // Set your preferred region
    const pathPrefix = `/${process.env.$APP_ID}/`;
    const parameters = [];
    let nextToken;

    do {
        const response = await ssmClient.send(new GetParametersByPathCommand({
            Path: pathPrefix,
            NextToken: nextToken
        }));

        if (response.Parameters) {
            parameters.push(...response.Parameters);
        }
        nextToken = response.NextToken;

    } while (nextToken);
    // Set Params to ENV
    parameters.forEach(p=>{ 
        const pname = p.Name.replace(`/${process.env.$APP_ID}/`,'');
        const key = `$APP_${pname.toUpperCase()}`;
        process.env[key] = p.Value;
    });
    return true;
}

exports.log = async function(msg,dump){
    if (process.env.$IS_LOCAL){ console.log(msg);  return }
    logLines.push(msg);
    if (logLines.length < 10 && !dump){ return }
    
    const logText = logLines.join('\n');
    const fileKey = `logs/run/${Date.now()}.txt`;
    const s3Client = new S3Client({ region: process.env.$APP_REGION });
    const poc = new PutObjectCommand({ 
        Bucket: process.env.$APP_S3BUCKET, 
        Key: fileKey, 
        Body: logText 
    });
    const res = await s3Client.send(poc);
    logLines.length = 0;
    return res;
}

// exports.verifyUser = async function(req,res,next){
exports.verifyUser = async function(token){
    // Return Mock User if Local
    if (process.env.$IS_LOCAL) {
        req.user = { 
            email: 'test@example.com',
            groups: []
        };
        return next();
    }

    // Verify Token
    const jwt_headers = token.split('.')[0]
    const decoded_jwt_headers = Buffer.from(jwt_headers, 'base64').toString('utf8');
    const { kid } = JSON.parse(decoded_jwt_headers);
    const verificationURL = `https://public-keys.auth.elb.${process.env.$APP_REGION}.amazonaws.com/${kid}`
    const pbRes = await fetch(verificationURL);
    const pubKey = await pbRes.text();
    const isValid = JWS.verify(token, pubKey);
    if (!isValid) { return 'Invalid token given' }

    // Parse Token Payload
    const jwt_pay = token.split('.')[1]
    const strPayload = Buffer.from(jwt_pay, 'base64').toString('utf8');
    return JSON.parse(strPayload);
}
