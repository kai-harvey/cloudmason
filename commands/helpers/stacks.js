const path = require('path');
const fs = require('fs');

const Stacks = {};

exports.get = function(stackType,params){
    const stackPath = path.resolve(__dirname, 'stacks', `${stackType}.yaml`);

    if (!fs.existsSync(stackPath)){ throw new Error('Invalid stack ' + stackType); }
    
    const stackText = fs.readFileSync(stackPath, 'utf-8');
    return Stacks[stackType](stackText,params)
}

Stacks.asg = function(stackText,params){
    let bootScript = `#!/bin/bash -xe\ncd /app\n`;
    if (params.lang == 'py'){
        bootScript += 'py start .'
    } else {
        bootScript += `npm run start .`
    }

    const b64Script = Buffer.from(bootScript, 'utf8').toString('base64');
    stackText = stackText.replace(/{{user_data}}/, b64Script);
    return stackText;
}