const path = require('path');
const fs = require('fs');
const AdmZip = require("adm-zip");

const Params = require('./helpers/params')
const S3 = require('./helpers/s3');
const { buildAMI } = require('./ssh_build');

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
    if (!fs.existsSync(zipPath)){ throw new Error("Path not found:" + zipPath)}
  
    const zipFilePath = await prepZip(zipPath);
    await S3.uploadInfraFile(`apps/${args.app}/${args.v}/app.zip`,zipFilePath);

    // --- II UPDATE STACK ---
    // If stack arg, upload stack
    const stackKey = `apps/${args.app}/${args.v}/stack.yaml`;
    if (args.stack){
        console.log('Updating Stack');
        const stackPath = path.resolve(args.stack);
        if (!fs.existsSync(stackPath)){ throw new Error("Stack not found:" + stackPath)}
        await S3.uploadInfraFile(stackKey,stackPath);
    } else {   
        // If no stack arg, upload default stack if none exists
        const stackExists = await S3.infraFileExists(stackKey)
        if (!stackExists){
            console.log('Copying default stack to ' +  `apps/${args.app}/${args.v}`);
            await S3.copyInfraFile(app.stackKey,stackKey)
        }
    }

    // --- III BUILD IMAGE ---
    const buildNumber = (app.versions[args.v]?.currentBuild || 0) + 1;
    const appVID = `${app.name.toLowerCase()}-v${args.v}.${buildNumber}`;

    console.log(`Building AMI: ${appVID}`);
    console.log(`Using local zip: ${zipFilePath}`);

    let ami_id;
    try {
        ami_id = await buildAMI(appVID, zipFilePath);
    } catch(e) {
        console.log("Error Creating AMI:" + e);
        throw new Error("Error - Build Not Complete");
    }

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
