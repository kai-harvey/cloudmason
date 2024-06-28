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
    console.log(args)
    const outputPath = path.resolve(args.out);
    if (!fs.statSync(outputPath).isDirectory()){ throw new Error("Invalid Output Path:" + args.out)}

    console.log(`Pulling stack for v${args.v || 'Default'} ${args.app}`);
    const stackKey = args.default === null ? `apps/${args.app}/default_stack.yaml` : `apps/${args.app}/${args.v}/stack.yaml`;
    const stackText = await S3.getInfraFile(stackKey);
    const outputFilePath = path.join(outputPath,`${args.app}_v${args.v || 'default'}_stack.yaml`);
    fs.writeFileSync(outputFilePath,stackText,{ encoding: "utf8" });
}