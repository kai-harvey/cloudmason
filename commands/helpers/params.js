const { SSMClient, GetParameterCommand,PutParameterCommand,GetParametersByPathCommand,DeleteParameterCommand } = require("@aws-sdk/client-ssm");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

// ORG PARAMS
exports.getOrgConfig = async function(){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const ssmClient = new SSMClient({ region: process.env.orgRegion }); // Set your preferred region
    const pathPrefix = "/infra/";
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
    const params = {}
    parameters.forEach(p=>{ 
        const k = p.Name.split('/')[p.Name.split('/').length-1]
        params[k] = p.Value 
    })
    return params;
}

exports.getOrgBucket = async function(){    
    const bucket = await readParam('/infra/infraBucket',process.env.orgRegion)
    return bucket;
}

// APP PARAMS
exports.listApps = async function(){
    if (!process.env.orgRegion){ throw new Error('Region not set') }

    const appList = await readOrgConfig();
    const params = appList;
    return params;
}



exports.getApp = async function(appName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const orgApps = await readOrgConfig();
    const app = orgApps.find(a=>{ return a.name.toLowerCase() == appName.toLowerCase() });
    return app ? app : null;
}

exports.addApp = async function(appName,appType,stackKey,nodeV,pyV){
    const orgApps = await readOrgConfig();
    const existingApp = orgApps.find(a=>{ return a.name.toLowerCase() == appName.toLowerCase() });
    if (existingApp){
        throw new Error('App already exists' + appName)
    }
    const appData = {
        name: appName,
        stack: appType,
        nodeV: nodeV,
        pyV: pyV,
        stackKey: stackKey,
        versions: {
            // build,ami,updated
        },
        instances: []
    }
    orgApps.push(appData);
    await writeOrgConfig(orgApps);
}

exports.deleteApp = async function(appName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const orgApps = await readOrgConfig();
    orgApps = orgApps.filter(a=>{ return a.name.toLowerCase() !== appName.toLowerCase() });
    await writeOrgConfig(orgApps);
    return true
}

// VERSION PARAMS
exports.updateAppV = async function(appName,version,vParams){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    if (!vParams.baseAMI_Name || !vParams.baseAMI_Id || !vParams.updated){ throw new Error('Missing version param' + vParams)}

    const [apps,i] = await readOrgConfig(appName);
    apps[i].versions[version] = vParams;

    await writeOrgConfig(apps);
}

// INSTANCE PARAMS
exports.setOrgParams = async function(orgName,VpcId,repo){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const r1 = await writeParam('/infra/org_name',orgName);
    console.log('Set Org Name:',r1)
    const r2 = await writeParam('/infra/vpc_id',VpcId);
    console.og('Set VPC ID:',r2);
    const r3 = await writeParam('/infra/GitHubRepoName',repo || '');
    console.log('Set GitHub Repo:',r3)
}


exports.addPid = async function(appName,productId){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const [apps,i] = await readOrgConfig(appName);
    apps[i].pid = productId;

    await writeOrgConfig(apps);
}


exports.addInstance = async function(appName,instanceName,params){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const [apps,i] = await readOrgConfig(appName);

    const ei = apps[i].instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
    if (ei){
        throw new Error('Instance exists')
    }
    apps[i].instances.push(params);
    await writeOrgConfig(apps);
}

exports.updateInstanceV = async function(appName,instanceName,version,build,amiId,amiName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const [apps,i] = await readOrgConfig(appName);
    const ei = apps[i].instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
    if (!ei){ throw new Error('Instance not found') }

    ei.version = version;
    ei.build = build;
    ei.lastDeployed = Date.now();
    ei.amiName = amiName;
    ei.cfParams.AmiId = amiId;

    await writeOrgConfig(apps);
}

exports.deleteInstance = async function(appName,instanceName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const [apps,i] = await readOrgConfig(appName);
    apps[i].instances = apps[i].instances.filter(ins=>{ return ins.domain.toLowerCase() !== instanceName.toLowerCase()});
    
    await writeOrgConfig(apps);
}

exports.migrate = async function(){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    console.log('Migrating params to s3');
    const migrated = await readParam('/infra/migrated',process.env.orgRegion);
    if (migrated){
        console.log('Already migrated');
        return;
    }
    const ssmClient = new SSMClient({ region: process.env.orgRegion }); // Set your preferred region
    const pathPrefix = "/infra/apps/";
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
    // const params = parameters.map(p=>{ return JSON.parse(p.Value) })
    const newStruct = [];
    for (let i=0; i<parameters.length; i++){
        newStruct.push(JSON.parse(parameters[i].Value))
    }

    await writeOrgConfig(newStruct);
    await writeParam('/infra/migrated',`${Date.now()}`, process.env.orgRegion);
    console.log('Successfully migrated');
    return true;
}



//////////////////////
async function writeParam(name,value,region){
    const ssmClient = new SSMClient({ region }); // specify the appropriate AWS region
    if (value.length > 1000){
        console.log('WARNING: Long parameter ' + value.length + ': ' + name)
    }
    // Creating the command object with the parameter details
    const command = new PutParameterCommand({
        Name: name,
        Value: value,
        Type: 'String', // Specify the parameter type: 'String', 'StringList', or 'SecureString'
        Overwrite: true, // Specify whether to overwrite an existing parameter
    });

    const response = await ssmClient.send(command);
    return true; 
}

async function readParam(name,region){
    const ssmClient = new SSMClient({ region });

    // Create a command object with the parameter name
    const command = new GetParameterCommand({
        Name: name,
        WithDecryption: true
    });
    
    try {
        // Send the command to SSM and wait for the result
        const response = await ssmClient.send(command);
        return response.Parameter.Value;
    } catch (error) {
        // Handle any errors
        if (/ParameterNotFound/.test(error)){
            return null;
        } else {
            throw error;
        }
    }
}

async function deleteParam(name,region){
    const ssmClient = new SSMClient({ region });

    // Create a command object with the parameter name
    const command = new DeleteParameterCommand({
        Name: name
    });
    
    try {
        // Send the command to SSM and wait for the result
        const response = await ssmClient.send(command);
        return true;
    } catch (error) {
        // Handle any errors
        if (/ParameterNotFound/.test(error)){
            return null;
        } else {
            throw error;
        }
    }
}

async function writeOrgConfig(data){
    const s3Client = new S3Client({ region: process.env.orgRegion }); // Use your desired region

    // Stringify the data
    const jsonString = JSON.stringify(data);
    const bucketName = await readParam('/infra/infraBucket',process.env.orgRegion);
    // Set up the PutObject parameters
    const putParams = {
      Bucket: bucketName,
      Key: "org_config.json",
      Body: jsonString,
      ContentType: "application/json",
    };
  
    const result = await s3Client.send(new PutObjectCommand(putParams));
    console.log("Successfully uploaded JSON to S3:", result);
}

async function readOrgConfig(appName=null){
    const s3 = new S3Client({ region: process.env.orgRegion }); // Change region if needed
    const bucketName = await readParam('/infra/infraBucket',process.env.orgRegion);
    const { Body } = await s3.send(new GetObjectCommand({ 
        Bucket: bucketName, 
        Key: "org_config.json" 
    }));
    const dataString = await streamToString(Body);
    const data = JSON.parse(dataString);
    if (!appName){
        return data;
    } else {
        const indx = data.findIndex(a=>{ return a.name.toLowerCase() == appName.toLowerCase() });
        return [data,indx];
    }
}

function streamToString(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
}