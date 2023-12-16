const S3 = require('./helpers/s3');
const Params = require('./helpers/params');
const fs = require('fs');
const path = require('path');

exports.main = async function(args){
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }
    if (args.default ===  undefined && !app.versions[args.v]){
        console.log('Err: No app version ' + args.app + ' ' + args.v);
        throw new Error('Err: No app version ' + args.app + ' ' + args.v)
    }
    if (args.default === null && args.v){
        console.log('Err: Cannot set default and specify version');
        throw new Error('Err: Cannot set default version and specify version')
    }
    const stackPath = path.resolve(args.stack);
    if (!fs.existsSync(stackPath)){ throw new Error("Stack file not found:" + args.stack)}

    console.log(`Upating v${args.v || 'Default'} stack for ${args.app}`);
    const stackKey = args.default === null ? `apps/${args.app}/default_stack.yaml` : `apps/${args.app}/${args.v}/stack.yaml`;
    await S3.uploadInfraFile(stackKey,stackPath);
}