const S3 = require('./helpers/s3')
const Params= require('./helpers/params');
const Stacks = require('./helpers/stacks')

exports.main = async function(args){
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }
    // Get Stack
    const stackText = Stacks.get('asg', {lang: 'node'});
    const stackKey = `apps/${args.app.toLowerCase()}/default_stack.yaml`
    
    // Reset Default
    console.log('Resetting default stack @ ', stackKey)
    await S3.uploadInfraText(stackKey,stackText);

    if (!app.versions){ return }
    const versions = Object.keys(app.versions);
    for (let i=0; i<versions.length; i++){
        let k = versions[i]
        let vStackPath = `apps/${args.app.toLowerCase()}/${k}/stack.yaml`
        console.log('Resetting v',k, '@', vStackPath);
        await S3.uploadInfraText(vStackPath,stackText);
    }
}