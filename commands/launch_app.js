const Params = require('./helpers/params');
const EC2 = require('./helpers/ec2');
const CF = require('./helpers/cf');
const Common = require('./helpers/common');

exports.main = async function(args){
    const app = await Params.getApp(args.app);
    if (!app){ console.log('No app named ' + args.app); throw new Error('Invalid App Name')}

    const targetInstance = app.instances.find(ins=>{ return ins.domain.toLowerCase() == args.domain.toLowerCase() });
    const targetVersion = app.versions[args.v];
    
    if (!targetInstance){ console.log(`No instance of ${args.app} named ${args.domain}`); throw new Error('Invalid Instance')}
    if (!targetVersion){ console.log(`No version ${args.v} of ${args.app}`); throw new Error('Invalid Version')}

    console.log(`Launching ${args.app} ${args.v}.${targetVersion.currentBuild} to ${targetInstance.domain} in ${targetInstance.region}`)

    // --- I GET AMI ---
    // Get Instance Region
    const targetRegion = targetInstance.region;
    // Get Latest AMI Build
    const latestBuild = targetVersion.baseAMI_Name;
    // Check for AMI Build in Instance Region
    let targetAMI = await EC2.findAMI(latestBuild,targetRegion);
    // Copy AMI from Org Region to Instance Region
    if (!targetAMI){
        console.log(`Copying ${latestBuild} from ${process.env.orgRegion} to ${targetRegion}`);
        targetAMI = await EC2.copyAMI(latestBuild,targetVersion.baseAMI_Id,process.env.orgRegion,targetRegion)
    } else {
        console.log('Found existing image ' + targetAMI)
    }

    // I.I WAIT FOR AMI TO BE AVAILABLE
    console.log(`Waiting for AMI ${targetAMI} to be available`);
    let isAvailable = false;
    for (let i = 0; i < 15; i++){
        const status = await EC2.checkAMIStatus(targetAMI,targetRegion);
        if (status === true){
            console.log(`AMI ${targetAMI} available after ${i*30}s`);
            isAvailable = true;
            break;
        }
        console.log(`\tAMI Status Check ${i} @${i*30}s : Not Available`);
        await Common.sleep(30);
    }
    if (!isAvailable){ throw new Error('AMI not available after 7 minutes. Try again in a few minutes.') }

    // --- II DEPLOY CF STACK ---
    // Get Stack URL
    const stackName = targetInstance.stackName;
    const stackURL = targetVersion.stackURL;

    // Update Instance CF Params to Instance Region AMI ID
    targetInstance.cfParams.AmiId = targetAMI;
    targetInstance.cfParams.AppVersion = `${args.v}.${targetVersion.currentBuild}`;
    await Params.updateInstanceV(args.app,args.domain,args.v,targetVersion.currentBuild,targetAMI,targetVersion.baseAMI_Name);

    // Check whether stack exists
    const stackExists = await CF.stackExists(stackName,targetRegion);

    // Update Stack
    let stackId;
    if (stackExists){
        const stackStatus = await CF.stackStatus(stackName,targetRegion);
        if (stackStatus.ok !== true){
            console.log(`Stack ${stackName} in ${targetRegion} is ${stackStatus.status}. Wait for completion before relaunching`);
            return false;
        }
        console.log(`Updating stack ${stackName} in ${targetRegion}`);
        stackId = await CF.updateStack(stackName,stackURL,targetInstance.cfParams,targetRegion);
    // Deploy Stack
    } else {
        console.log(`Syncing stack ${stackName} to ${targetRegion}`);
        const tags = {purpose: 'app', app: args.app, instance: args.domain};
        stackId = await CF.deployS3Stack(stackName,stackURL,targetInstance.cfParams,tags,targetRegion)
    }
    // console.log('Deployed stack ' + stackId);
    await Common.prune_amis(args.app,args.v,targetRegion);
    return true;
}
