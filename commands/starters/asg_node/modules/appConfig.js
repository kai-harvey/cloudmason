const { SSMClient,GetParametersByPathCommand } = require("@aws-sdk/client-ssm");
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

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
    process.env.$IS_LOCAL = configLines[2] ? 'y' : '';  
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
    if (process.env.$IS_LOCAL === 'y'){ console.log(msg);  return }
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

exports.verifyUser = async function(req,res,next){
    // Return Mock User if Local
    if (process.env.$IS_LOCAL == 'y') {
        res.locals.user = {
            ok: true,
            email: 'test@example.com',
            groups: ['user-admin']
        };
        return next();
    }
    if (!req.headers['x-amzn-oidc-data']){
        res.status(200).send('OK');
        return
    }

    // Extract User Info from Access Token
    const accessJWT = decode(req.headers['x-amzn-oidc-accesstoken'],1);
    res.locals.user = {
        username: accessJWT.username,
        groups: accessJWT['cognito:groups']
    }

    // Parse Data Token
    const dataJWT = decode(req.headers['x-amzn-oidc-data'],1);
    res.locals.user.email = dataJWT.email;


    // Verify Token
    const { kid } = decode(req.headers['x-amzn-oidc-data'],0);
    const verificationURL = `https://public-keys.auth.elb.${process.env.$APP_REGION}.amazonaws.com/${kid}`
    const pbRes = await fetch(verificationURL);
    const pubKey = await pbRes.text();
    const isValid = JWS.verify(req.headers['x-amzn-oidc-data'],'ES256', pubKey);
    if (!isValid) { 
        req.status(403).send('Forbidden: Invalid Token');
        return;
    }
    return next();
}

exports.checkDDBConnection = async function(){
    const client = new DynamoDBClient({ region: process.env.$APP_REGION }); // Replace with your region
    const ddbDocClient = DynamoDBDocumentClient.from(client);
    try {
        const params = {
            TableName: process.env.$APP_DDBTABLE,
            KeyConditionExpression: "pk = :pkValue",
            ExpressionAttributeValues: {
                ":pkValue": 'test'
            }
        };

        const command = new QueryCommand(params);
        const response = await ddbDocClient.send(command);
        console.log("Query response:", response);
        return { ok: true, msg: response.Items.length };
    } catch (error) {
        return { ok: false, msg: error };
    }
}

exports.checkS3Connection = async function(){
    const client = new S3Client({ region: process.env.$APP_REGION }); // Replace with your region
    const command = new ListObjectsV2Command({
        Bucket: process.env.$APP_S3BUCKET,
        MaxKeys: 2
    });
    try {
        const response = await client.send(command);
        return { ok: true, msg: response.Contents.length };
    } catch (error) {
        throw { ok: false, msg: error };
    }
}

function decode(token,index=0){
    const payload = token.split('.')[index]
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
}