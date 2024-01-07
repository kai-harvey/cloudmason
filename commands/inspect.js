const Params = require('./helpers/params');
const EC2 = require('./helpers/ec2');
const CF = require('./helpers/cf');
const S3 = require('./helpers/s3');
const Common = require('./helpers/common');

exports.main = async function(args){
    const logType = args.build === null ? 'build' : args.boot === null ? 'boot' : 'run';
    const getLatest = args.boot === null ? false : true;

    console.log(`Inspecting ${args.app} instance ${args.domain} ${logType} logs`);
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){ console.log('Err: No app named ' + args.app); return false;}
    const instance = app.instances.find(ins=>{ return ins.domain.toLowerCase() == args.domain.toLowerCase() });
    if (!instance){ console.log(`No instance of ${args.app} named ${args.domain}`); throw new Error('Invalid Instance')}
    
    // Check Stack
    const stackStatus = await CF.stackStatus(instance.stackName, instance.region);
    console.log("STACK STATUS:", stackStatus.status);
    if (stackStatus.ok === null){
        return
    } else if (stackStatus.ok === false){
        console.log("\tSTACK FAILURE REASON:", stackStatus.failureReason);
        return
    }

 
    const asgId = await CF.getStackResource('asg',instance.stackName,instance.region);
    console.log("Auto Scaling Group ID:", asgId);
    const consoleOutputs = await EC2.getConsoleOutput(asgId,instance.region,getLatest);
    console.log(`================= ${logType.toUpperCase()} LOGS =================`);
    consoleOutputs.forEach(output => {
        console.log("---- EC2 ID:", output.instanceId, "----");
        console.log( output.output );
        console.log('======================= END =========================');
    });
    return
}

