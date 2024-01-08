const fs = require('fs');
const path = require('path');
const cp = require('child_process');

exports.main = function(args){
    // Check Args Valid
    if (!args.type){ throw new Error('Missing type: asg or static') }
    if (args.type === 'asg' && !args.l){ throw new Error('Missing -l language. Specify py or node') }
    
    // Resolve Output Path
    const outputPath = path.resolve(args.p);
    const starterRelPath = `starters/${args.type}${args.l ? `_${args.l}` : ''}`;
    const starterPath = path.join(__dirname, starterRelPath);


    // Copy Directory
    console.log(`Creating dir ${outputPath}`);
    fs.mkdirSync(outputPath, { recursive: true });
    console.log(`Adding starter files`);
    fs.cpSync(starterPath, outputPath, {recursive: true,});
    console.log('Running NPM Install');
    cp.execSync(`npm install`, { cwd: outputPath, stdio: 'inherit' });
}