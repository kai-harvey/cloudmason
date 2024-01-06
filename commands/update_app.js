const path = require('path');
const fs = require('fs');
const EC2 = require('./helpers/ec2');
const { EC2Client, RunInstancesCommand,CreateImageCommand,TerminateInstancesCommand,DescribeInstanceStatusCommand,DeregisterImageCommand,DescribeImagesCommand,CopyImageCommand } = require("@aws-sdk/client-ec2");

const AdmZip = require("adm-zip");

const Params = require('./helpers/params')
const S3 = require('./helpers/s3');


const INSTANCE_TYPE="t2.micro"

exports.main = async function(args){
    console.log(`Updating ${args.app} v${args.v}`);

    // Check Version Format
    if (!args.v.match(/^[1-9][0-9]{0,4}\.[0-9]{0,4}$/)){ 
        console.log('Invalid Version Format. Use format [major].[minor] without leading 0s')
        throw new Error('Invalid Version Format');
    }
    
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }

    // --- I PREP ZIP ---
    const zipPath = path.resolve(args.path);
    if (!fs.existsSync(zipPath)){ throw new Error("Path not found:" + args.path)}
    const zipFilePath = await prepZip(zipPath);
    await S3.uploadInfraFile(`apps/${args.app}/${args.v}/app.zip`,zipFilePath);

    // --- II UPDATE STACK ---
    // If stack arg, upload stack
    const stackKey = `apps/${args.app}/${args.v}/stack.yaml`;
    // If no stack arg, upload default stack if none exists
    const stackExists = await S3.infraFileExists(stackKey)
    if (!stackExists){
        console.log('Copying default stack to ' +  `apps/${args.app}/${args.v}`);
        await S3.copyInfraFile(app.stackKey,stackKey)
    }

    // --- III BUILD IMAGE ---
    // Launch ec2
    const orgParams = await Params.getOrgConfig();

    // const awsLinuxAMI = await findLinuxAMI(process.env.orgRegion);
    const awsLinuxAMI = EC2.awsLinuxAMI(process.env.orgRegion);
    const instance_id = await launchInstance({
        app: app.name,
        linuxAMI: awsLinuxAMI,
        version: args.v,
        sec_group: orgParams.buildSecGroup,
        iam: orgParams.buildInstanceProfile,
        node: app.nodeV,
        py: app.pyV
    });

    await waitUntilInstanceReady(instance_id,process.env.orgRegion);
    
    // Create AMI
    const buildNumber = (app.versions[args.v]?.currentBuild || 0) + 1;
    const appVID = `${app.name.toLowerCase()}-v${args.v}.${buildNumber}`;

    var success = false;
    let ami_id;
    try {
        ami_id = await createAMI(instance_id, appVID,process.env.orgRegion)
        success = true;
    } catch(e){
        console.log("Error Creating AMI:" + e)
    }
    await terminateInstance(instance_id,process.env.orgRegion)
    if (success === false){ throw new Error("Error - Build Not Complete") }

    // --- IV UPDATE PARAMS ---
    const versionInfo = {
        baseAMI_Name: appVID,
        stackPath: stackKey,
        stackURL: `https://s3.${process.env.orgRegion}.amazonaws.com/${process.env.orgBucket}/apps/${args.app.toLowerCase()}/${args.v}/stack.yaml`,
        baseAMI_Id: ami_id,
        currentBuild: buildNumber,
        updated: Date.now()
    }
    await Params.updateAppV(app.name,args.v,versionInfo);

    return true;
}



///////////////////////////////////////////////
///////////////////////////////////////////////
///////////////////////////////////////////////

async function prepZip(appPath){
    console.log('Zipping ' + appPath);
    const inPath = path.resolve(appPath);
    let zipPath = path.resolve(`./app.zip`);

    const pathStat = fs.statSync(inPath);
    // If dir, zip
    if (!pathStat.isFile()){
        const zip = new AdmZip();
        zip.addLocalFolder(inPath);
        zip.writeZip(zipPath);
    } else {
        // If not zip, throw error
        if (path.extname(inPath) !== '.zip'){
            console.log('ERROR:Not a .zip file >>' + inPath)
            throw 'ERROR:Not a .zip file >>' + inPath;
        }
        // Copy .zip file
        fs.copyFileSync(inPath,zipPath);
    }
    process.on('exit', function(){ fs.unlinkSync(zipPath) });
    return zipPath;
}

async function launchInstance(launchParams){
    console.log('Launching Instance in ' + process.env.orgRegion);
    const nodeRepo = launchParams.node === '' ? 'echo default_version' : `https://rpm.nodesource.com/setup_${launchParams.node}.x | sudo bash -`;
    const user_data = [
        `#!/bin/bash -xe`,
        nodeRepo,
        `yum -y install nodejs`,
        `yum -y install python3`,
        `yum -y install unzip`,
        `cd /home/ec2-user`,
        `aws s3 cp s3://${process.env.orgBucket}/apps/${launchParams.app.toLowerCase()}/${launchParams.version}/app.zip .`,
        `unzip app.zip -d app`,
        `rm -r app.zip`
    ].join('\n')

    const ud_b64 = Buffer.from(user_data).toString('base64');

    const client = new EC2Client({region: process.env.orgRegion });

    const createInstanceParams = {
        ImageId: launchParams.linuxAMI,
        InstanceType: INSTANCE_TYPE,
        SecurityGroupIds: [
            launchParams.sec_group
        ],
        MinCount: 1,
        MaxCount: 1,
        UserData: ud_b64,
        IamInstanceProfile: {
            Arn: launchParams.iam
        }
    };
    const command = new RunInstancesCommand(createInstanceParams);
    const response = await client.send(command);
    const instance_id = response.Instances[0].InstanceId
   
    console.log('Instance Launched:',instance_id);
    return instance_id;
}

async function waitUntilInstanceReady(instance_id,region){
    console.log(`Awaiting ${instance_id} status of ok`)
    const client = new EC2Client({region});
    const input = { // DescribeInstanceStatusRequest
        InstanceIds: [ // InstanceIdStringList
            instance_id
        ],
        DryRun: false,
        IncludeAllInstances: true
    };
    
    let totalSleepTime = 0;
    let ok = false;
    const command = new DescribeInstanceStatusCommand(input);
    for (let i=0; i<50; i++){
        const response = await client.send(command);
        const status = response.InstanceStatuses[0].InstanceStatus.Status;
        console.log(`\tCheck ${i+1} @ ${totalSleepTime}s: EC2 Status is ${status}`)
        if (status !== 'ok'){
            await sleep(10000);
            totalSleepTime += 10;
        } else {
            console.log('Ec2 Instance Ready:' + status);
            ok = true;
            break;
        }
    }

    if (ok === false){
        console.log('ERR:::', `Ec2 Instance Not Ready After ${totalSleepTime}s`)
        throw `Ec2 Instance Not Ready After ${totalSleepTime}s`
    } else {
        console.log(`Instance Ready After ${totalSleepTime}s. Waiting 30s to Proceed`);
        await sleep(30);
    }
    return true;
}

async function createAMI(instance_id,image_name,region){
    console.log(`Building ${image_name} in ${region}`)
    const client = new EC2Client({region});
    const input = { // CreateImageRequest
        Description: `Base Application Image`,
        DryRun: false,
        InstanceId: instance_id, // required
        Name: image_name, // required
        NoReboot: true
      };
      const command = new CreateImageCommand(input);
      const response = await client.send(command);
      console.log(`Created Image ${image_name} ID:${response.ImageId}`)
      return response.ImageId;
}

async function terminateInstance(instance_id,region){
    console.log('Terminating Instance ' + instance_id)
    const client = new EC2Client({region});
    const input = { // TerminateInstancesRequest
        InstanceIds: [ instance_id ],
        DryRun: false,
    };
    const command = new TerminateInstancesCommand(input);
    const response = await client.send(command);
    return true;
}


async function sleep(time){
    return new Promise(function (resolve, reject) {
        setTimeout(function () { resolve(true);
        }, time);
    });
}
