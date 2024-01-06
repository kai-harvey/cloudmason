const CF = require('./helpers/cf');
const Params = require('./helpers/params');
const S3 = require('./helpers/s3');
const Common = require('./helpers/common');

exports.delete_app = async function(args){
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }
    //  Check Instances
    if (app.instances.length > 0){
        console.log('Err: App has instances. Delete instances first');
        throw new Error('Err: App has instances. Delete instances first')
    }

    // Delete S3 Files
    console.log('Deleting S3 Content for ' + args.app)
    await S3.deleteAppFolder(args.app);

    // Deregister AMIs
    await Common.remove_app_amis(args.app,process.env.orgRegion);

    //  Update Params
    console.log('Updating SSM Params')
    await Params.deleteApp(args.app);
    console.log('Succesfully Deleted ' + args.app)
    return true;
}

exports.delete_instance = async function(args){
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }
    //  Get Instance
    const targetInstance = app.instances.find(ins=>{ return ins.domain.toLowerCase() == args.domain.toLowerCase() });
    if (!targetInstance){ console.log(`No instance of ${args.app} named ${args.domain}`); throw new Error('Invalid Instance')}
    
    // Check if Stack Exists
    const stackExists = await CF.stackExists(targetInstance.stackName,targetInstance.region);
    console.log(`Stack Exists: ${stackExists}`)
    if (stackExists === true){
        // Delete S3 App Bucket
        const bucketName = await CF.getStackResource('s3',targetInstance.stackName,targetInstance.region);
        console.log('Emptying S3 Bucket for ' + bucketName)
        await S3.emptyBucket(bucketName,targetInstance.region);
        //  Delete Stack
        const stackName = targetInstance.stackName;
        console.log(`Deleting ${args.app} instance ${args.domain} in ${targetInstance.region}`)
        const delOK = await CF.delete(stackName, targetInstance.region);
        if (delOK){
            console.log('Delete Successful')
        } else {
            return;
        }
        // Deregister AMIs
        await Common.prune_amis(args.app,targetInstance.version,targetInstance.region,true);
    }

    //  Update Params
    await Params.deleteInstance(args.app,args.domain);
    return true;
}