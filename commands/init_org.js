const { S3Client,HeadBucketCommand } = require("@aws-sdk/client-s3");
const { EC2Client, DescribeVpcsCommand } = require("@aws-sdk/client-ec2");

const CF = require('./helpers/cf');
const Params = require('./helpers/params');
const OrgConfig = require('./helpers/org_config');

exports.main = async function(args){
    console.log(`Setting up ${args.name}@ in ${args.region} with repo ${args.repo}`)

    // Get VPC ID
    const VpcId = await getDefaultVPC(args.region);
    console.log(`Default VPC: ${VpcId}`);
    
    // Set Param
    await Params.setOrgParams(args.name,VpcId,args.repo);

    // Deploy Stack
    const success = await CF.deployOrgStack(args.region, {orgName: args.name, VpcId: VpcId, GitHubRepoName: args.repo})
    if (success === false){
        console.log('ERR: Org already exists. Only one org permitted per account');
        throw new Error('Org already exists')
    }

    OrgConfig.write({ name: args.name, region: args.region });
    console.log('Set up org:', args.name, args.region)
    return true;
}

exports.updateOrgStack = async function(args){
    console.log(`Updating Org Stack from ${args.stack}`)

    
    // Deploy Stack
    const success = await CF.updateOrgStack(args.stack)
    if (success === false){
        console.log('ERR:', success);
        throw new Error('Unknown error updating org stack')
    }

    // Set org.txt
    console.log('Updated org')
    return true;
}

exports.setOrg = async function(args){
    OrgConfig.write({ name: args.name, region: args.region });
    console.log('Set org:', args.name, args.region)
    return true;
}


/////////////////////////////////////////
////////////// FUNCS ////////////////////
////////////////////////////////////////

async function getDefaultVPC(region){
    const ec2Client = new EC2Client({ region }); 
    const response = await ec2Client.send(new DescribeVpcsCommand({ Filters: [{ Name: "isDefault", Values: ["true"] }] }));
    return response.Vpcs[0].VpcId;
}




