const path = require('path');
const fs = require('fs');
const CF = require('./helpers/cf')
const AdmZip = require("adm-zip");

exports.checkValidCF = async function(args){
    const stackPath = path.resolve(args.p);
    console.log('Checking ', stackPath);
    if (!fs.existsSync(stackPath)){
        console.log('Invalid path');
        return
    }
    const stackStr = fs.readFileSync(stackPath,'utf-8');
    const result = await CF.validateStack(stackStr);
    if (result.ok){
        console.log('Template seems good')
    } else {
        console.log(result.data)
        console.log('Is not good')
    }
}

exports.zip = async function(args){
    const inPath = path.resolve(args.p);
    if (!fs.existsSync(inPath)){
        console.log('Not a valid path ' + args.p);
        return
    }
    const zip = new AdmZip();
    zip.addLocalFolder(inPath);
    const outPath = path.resolve(args.o)
    zip.writeZip(outPath);
}