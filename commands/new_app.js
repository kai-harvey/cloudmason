const fs = require('fs');
const path = require('path')
const Params = require('./helpers/params');
const S3 = require('./helpers/s3');


exports.main = async function(args){
    // Check for existing app
    const existingApp = await Params.getApp(args.name);
    if (existingApp){
        console.log('Err: App already exists ' + args.name);
        throw new Error('App exists')
    }

    // Check Lang Selection
    if (!/[0-9]{1,2}/.test(args.node)){
        throw new Error('Invalid nodejs version. Use major version only (14,15,16)')
    }

    // Prep Stack
    const stackPath = path.resolve(__dirname, 'helpers', 'stacks', `${stackType}.yaml`);
    if (!fs.existsSync(stackPath)){ throw new Error('Invalid stack ' + args.type); }

    const stackText = fs.readFileSync(stackPath, 'utf-8')

    // Upload Stack
    console.log(`Uploading ${args.type} stack to ${process.env.orgBucket}`)
    const stackKey = `apps/${args.name.toLowerCase()}/default_stack.yaml`
    await S3.uploadInfraText(stackKey,stackText);

    // Update app config
    console.log('Adding app params');
    const nodev = args.node || '';
    const pyv = args.py || '';
    await Params.addApp(args.name,args.type,stackKey,nodev,pyv);
    console.log(`Added ${args.name} with ${args.type} stack`);
}


// #!/bin/bash -x
// echo "Running user data"
// cd /home/ec2-user/app
// chmod +x start.sh
// source start.sh