const { SSMClient, GetParameterCommand,PutParameterCommand,GetParametersByPathCommand,DeleteParameterCommand } = require("@aws-sdk/client-ssm");

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
    const params = parameters.map(p=>{ return JSON.parse(p.Value) })
    return params;
}

exports.getApp = async function(appName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const app = await readParam(
        `/infra/apps/${appName.toLowerCase()}`,
        process.env.orgRegion
    )
    return app ? JSON.parse(app) : null;
}

exports.addApp = async function(appName,appType,stackKey,nodeV,pyV){
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
    const paramPath = `/infra/apps/${appName.toLowerCase()}`;
    await writeParam(paramPath,JSON.stringify(appData),process.env.orgRegion);
}

exports.deleteApp = async function(appName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const paramPath = `/infra/apps/${appName.toLowerCase()}`;
    await deleteParam(paramPath,process.env.orgRegion);
    return true
}

// VERSION PARAMS
exports.updateAppV = async function(appName,version,vParams){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    if (!vParams.baseAMI_Name || !vParams.baseAMI_Id || !vParams.updated){ throw new Error('Missing version param' + vParams)}
    const appKey = `/infra/apps/${appName.toLowerCase()}`
    const appStr = await readParam(appKey,process.env.orgRegion);
    const app = JSON.parse(appStr);

    app.versions[version] = vParams;
    await writeParam(appKey,JSON.stringify(app),process.env.orgRegion);
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
    const appKey = `/infra/apps/${appName.toLowerCase()}`
    const appStr = await readParam(appKey,process.env.orgRegion);
    const app = JSON.parse(appStr);

    app.pid = productId;
    await writeParam(appKey,JSON.stringify(app),process.env.orgRegion);
}


exports.addInstance = async function(appName,instanceName,params){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const appKey = `/infra/apps/${appName.toLowerCase()}`
    const appStr = await readParam(appKey,process.env.orgRegion);
    const app = JSON.parse(appStr);

    const ei = app.instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
    if (ei){
        throw new Error('Instance exists')
    }
    app.instances.push(params);
    await writeParam(appKey,JSON.stringify(app),process.env.orgRegion)
}

exports.updateInstanceV = async function(appName,instanceName,version,build,amiId,amiName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const appKey = `/infra/apps/${appName.toLowerCase()}`
    const appStr = await readParam(appKey,process.env.orgRegion);
    const app = JSON.parse(appStr);
    const ei = app.instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
    if (!ei){ throw new Error('Instance not found') }

    ei.version = version;
    ei.build = build;
    ei.lastDeployed = Date.now();
    ei.amiName = amiName;
    ei.cfParams.AmiId = amiId;

    await writeParam(appKey,JSON.stringify(app),process.env.orgRegion)
}

// exports.editInstance = async function(appName,instanceName,version,stack,cfParams){
//     if (!process.env.orgRegion){ throw new Error('Region not set') }
//     const appKey = `/infra/apps/${appName.toLowerCase()}`
//     const appStr = await readParam(appKey,process.env.orgRegion);
//     const app = JSON.parse(appStr);

//     const ei = app.instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
//     if (!ei){ throw new Error('Instance not found') }
//     ei.version = version;
//     ei.stack = stack;
//     ei.cfParams = cfParams;
//     ei.lastDeployed = Date.now();
//     await writeParam(appKey,JSON.stringify(app),process.env.orgRegion)
// }

exports.deleteInstance = async function(appName,instanceName){
    if (!process.env.orgRegion){ throw new Error('Region not set') }
    const appKey = `/infra/apps/${appName.toLowerCase()}`
    const appStr = await readParam(appKey,process.env.orgRegion);
    const app = JSON.parse(appStr);

    const ei = app.instances.find(ins=>{ return ins.domain.toLowerCase() == instanceName.toLowerCase()});
    if (!ei){ throw new Error('Instance not found') }
    app.instances = app.instances.filter(ins=>{ return ins.domain.toLowerCase() !== instanceName.toLowerCase()});
    await writeParam(appKey,JSON.stringify(app),process.env.orgRegion)
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