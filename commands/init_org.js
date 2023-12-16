const fs = require('fs');
const path = require('path');
const { S3Client,HeadBucketCommand } = require("@aws-sdk/client-s3");
const { EC2Client, DescribeVpcsCommand } = require("@aws-sdk/client-ec2");

const CF = require('./helpers/cf');


exports.main = async function(args){
    console.log(`Setting up ${args.name}@ in ${args.region}`)

    // Get VPC ID
    const VpcId = await getDefaultVPC(args.region);
    console.log(`Default VPC: ${VpcId}`);
    
    // Deploy Stack
    const success = await CF.deployOrgStack(args.region, {orgName: args.name, VpcId: VpcId})
    if (success === false){
        console.log('ERR: Org already exists. Only one org permitted per account');
        throw new Error('Org already exists')
    }

    // Set org.txt
    const orgPath = path.resolve(__dirname,'..','org.txt');
    const orgData = `${args.name},${args.region}`;
    fs.writeFileSync(orgPath,orgData,'utf-8')
    console.log('Set up org:',orgData)
    return true;
}


/////////////////////////////////////////
////////////// FUNCS ////////////////////
////////////////////////////////////////

async function bucketExists(bucketName,region){
    const client = new S3Client({region});
    try {
        await client.send(new HeadBucketCommand({ Bucket: bucketName }));
        return true;
    } catch (e){
        return false;
    }
}

async function getDefaultVPC(region){
    const ec2Client = new EC2Client({ region }); 
    const response = await ec2Client.send(new DescribeVpcsCommand({ Filters: [{ Name: "isDefault", Values: ["true"] }] }));
    return response.Vpcs[0].VpcId;
}



