#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

const Params = require('./commands/helpers/params');

const Commands = {
    'init-org': {
        desc: "Set up a new organization",
        exec: require('./commands/init_org').main,
        args: [
            {n: 'name', desc: 'Unique org Name. Letters only', r: true, pattern: `[A-Za-z]{2,20}`},
            {n: 'region', desc: 'AWS Region for Core Assets. Default us-east-1', r: false}
        ]
    },
    'new-app': {
        desc: 'Add a new application',
        exec: require('./commands/new_app').main,
        args: [
            {n: 'name', desc: 'Application name (letters only)', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'type', desc: 'Architecture type: asg | static', r: true},
            {n: 'node', desc: 'Nodejs version. If set, app will run using nodejs', r: false},
            {n: 'py', desc: 'Python version. If set, app will run using python', r: false}
        ]
    },
    'new-instance': {
        desc: 'Add an instance of an existing app',
        exec: require('./commands/new_instance').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            // {n: 'name', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'domain', desc: 'Domain to deploy instance behind', r: true},
            {n: 'region', desc: 'Region to deploy instance in', r: true}
        ]
    },
    'update-app': {
        desc: 'Update application',
        exec: require('./commands/update_app').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'v', desc: 'Version to update', pattern: `[0-9]{1,20}`, r: true},
            {n: 'path', desc: 'Path to app zip file or folder', r: true},
            {n: 'stack', desc: 'Path to updated JSON or YML stack', r: false}
        ]
    },
    'update-stack': {
        desc: 'Update stack',
        exec: require('./commands/update_stack').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'v', desc: 'Version to update', pattern: `[0-9]{1,20}`, r: false},
            {n: 'default', desc: 'Update default version', r: false},
            {n: 'stack', desc: 'Path to updated JSON or YML stack', r: false}
        ]
    },
    'launch': {
        desc: 'Launch application version to an instance',
        exec: require('./commands/launch_app').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'domain', desc: 'Instance domain to launch to', r: true},
            {n: 'v', desc: 'Version to launch', pattern: `[0-9]{1,20}`, r: true}
        ]
    },
    'inspect': {
        desc: 'Get stack status and Ec2 console logs for an instance',
        exec: require('./commands/inspect').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'domain', desc: 'Instance domain inspect', r: true}
        ]
    },
    'starter': {
        desc: 'Get a starter template for an app',
        exec: require('./commands/starter').main,
        args: [
            {n: 'type', desc: 'asg or static',pattern:`^asg$|^py$`, r: true},
            {n: 'p', desc: 'Output path', r: true},
            {n: 'l', desc: 'Language. node or py',pattern: '^node$|^py$', r: true}
        ]
    },
    /////
    'delete-app': {
        desc: 'Delete app',
        exec: require('./commands/delete').delete_app,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true}
        ]
    },
    'delete-instance': {
        desc: 'Delete instance',
        exec: require('./commands/delete').delete_instance,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true},
            {n: 'domain', desc: 'Instance domain', r: true},
        ]
    },
    'reset-stack': {
        desc: 'Reset app stack to default',
        exec: require('./commands/reset_stack').main,
        args: [
            {n: 'app', desc: 'Name of existing app', pattern: `[A-Za-z]{2,20}`, r: true}
        ]
    },
    'list-apps': {
        desc: 'List all apps',
        exec: require('./commands/list_apps').main
    },
    'isvalid': {
        desc: 'Check if a cloudformation template is valid',
        exec: require('./commands/utils').checkValidCF,
        args: [
            {n: 'p', desc: 'Path to cloudformation template', r: true}
        ]
    },
    'zip': {
        desc: 'Zip a folder',
        exec: require('./commands/utils').zip,
        args: [
            {n: 'p', desc: 'Path to folder', r: true},
            {n: 'o', desc: 'Output path', r: true}
        ]
    }
}

async function main(){
    const orgExists = await readOrgInfo();
    if (orgExists){
        console.log(`>>>> ${process.env.orgName} <<<<`);
    }

    const args = parseArgs();
    // Print info if no command given
    if (!args.cmd){
        printAllInfo();
        return;
    }
    // Exit if no org found
    if (args.cmd !== 'init-org' && args.cmd !== 'set-org' && !orgExists){
        console.log(`No organization found. Use init-org or set-org`);
    }

    // Check for valid command
    if (!Commands[args.cmd]){
        console.log('Invalid command. Run without args to list commands');
        return;
    }
    // If Command has args, but none are give, print info
    if (Commands[args.cmd].args && Object.keys(args.args).length == 0){
        printCmdInfo(args.cmd);
        return
    }

    // Validate args
    const valid = validateArgs(args);
    if (!valid){ 
        console.log('FAILED:Invalid Arguments')
        process.exit(1);
    }
    // If init or set, set ENV vars
    if (args.cmd == 'init-org' || args.cmd == 'set-org'){
        args.args.region = process.env.orgRegion = args.args.region || 'us-east-1';
        process.env.orgName = args.args.name;
        process.env.orgId = args.args.domain;
    } else if (!orgExists){
        console.log('Run init-org or set-org first');
        return
    }

    // Exec Command
    try{
        await Commands[args.cmd].exec(args.args);
    } catch (e){
        const errLocation = e.stack ? e.stack.split('\n')[1].replace(/.*\\/,'') : e.at;
        console.log('FAILED>>' + e.message + ' @ ' + errLocation);
        process.exit(1)
    }
    console.log('SUCCESS')
}


/////////////////////////////////
////////////////////////////////


async function readOrgInfo(){
    const orgPath = path.resolve(__dirname,'org.txt');
    if (fs.existsSync(orgPath)){
        const orgInfo = fs.readFileSync(orgPath,'utf-8').split(',');
        process.env.orgName = orgInfo[0];
        process.env.orgRegion = orgInfo[1];
        process.env.orgBucket = await Params.getOrgBucket();
        return true;
    } else {
        return false;
    }
}

function parseArgs(){
    var args = {
        cmd: process.argv[2],
        args: {}
    };
    for (let i=0;i<process.argv.length; i++){
        if (process.argv[i][0] === '-'){
            args.args[process.argv[i].replace('-','')] = null;
            if (process.argv[i+1] && process.argv[i+1][0] !== '-'){
                args.args[process.argv[i].replace('-','')] = process.argv[i+1];
                i += 1
            }
        }
    }
    return args;
}

function printAllInfo(){
    Object.entries(Commands).forEach((c)=>{   
        console.log(`| ${c[0]} ${c[1].desc}`)
        c[1].args.forEach(a=>{
            const argName = a.r ? `${a.n}*` : a.n;
            console.log(`\t-${argName}: ${a.desc}`)
        })
        console.log('-------\n');
    })
    console.log('\n*required')
}

function printCmdInfo(cmd){
    const comm = Commands[cmd].args;
    console.log('\n' + cmd)
    comm.forEach(a=>{
        const argName = a.r ? `${a.n}*` : a.n;
        console.log(`\t-${argName}: ${a.desc}`)
    })
    console.log('-------\n');
}

function validateArgs(args){
    const command = Commands[args.cmd];
    if (!command.args){ return true }
    for (let i=0; i<command.args.length;i++){
        let carg = command.args[i];
        const userArg = args.args[carg.n]
        if (carg.pattern && userArg){
            const rgx = new RegExp(carg.pattern);
            if (!rgx.test(userArg)){
                console.log(`Arg ${carg.n} does not match pattern ${carg.pattern}`);
                return false;
            }
        }
        if (carg.r && !userArg){
            console.log('Missing required arg ' + carg.n);
            return false;
        }
    }
    return true;
}

main();