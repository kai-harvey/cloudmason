const { SSMClient,GetParametersByPathCommand } = require("@aws-sdk/client-ssm");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const path = require('path');
const fs = require('fs');

const logLines = [];

exports.setParams = async function(rootDir){
    // Read App Name and Region from mason.txt
    const configPath = path.resolve(rootDir,'mason.txt');
    const configText = fs.readFileSync(configPath,'utf-8');
    const configLines = configText.split(',');
    process.env.$APP_REGION = configLines[0];
    process.env.$APP_ID = configLines[1];
    process.env.$IS_LOCAL = configLines[2] ? true : false;

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

exports.log = function(msg,dump){
    if (process.env.$IS_LOCAL){ console.log(msg);  return }
    console.log('not returning');
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
    s3Client.send(poc);
    logLines.length = 0;
}

exports.verifyUser = async function(req, res, next){
    // Return Mock User if Local
    if (process.env.$IS_LOCAL) {
        req.user = { 
            email: 'test@example.com',
            groups: []
        };
        return next();
    }
    const token = req.headers['x-amzn-oidc-data'];

    if (!token) {
      return res.status(403).send('A token is required for authentication');
    }
  
    // try {
    //   // Fetch the JWKs from the OIDC provider
    //   const jwksUrl = 'YOUR_JWKS_URL'; // Replace with your JWKS URL
    //   const { data: jwks } = await axios.get(jwksUrl);
  
    //   // Convert JWK to PEM
    //   const pem = jwkToPem(jwks.keys[0]); // This is a simplification. In a real app, match the kid.
  
    //   // Verify the token
    //   jwt.verify(token, pem, (err, decoded) => {
    //     if (err) {
    //       return res.status(401).send('Invalid Token');
    //     }
    //     req.user = decoded;
    //     next();
    //   });
    // } catch (error) {
    //   return res.status(401).send('Invalid Token');
    // }
      
}
