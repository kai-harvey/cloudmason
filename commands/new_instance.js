const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } = require("@aws-sdk/client-ec2");
const { Route53Client, ListHostedZonesByNameCommand } = require("@aws-sdk/client-route-53");

const Params = require('./helpers/params');

exports.main = async function(args){
    console.log(`Adding ${args.app} instance ${args.domain} in ${args.region}`)
    if (!args.max){ 
        console.log('Using default max instance count of 2. Specify -max to override')
        args.max = 2; 
    } else if (args.max < 2){
        console.log('-max must be at least 2 to allow proper rolling updates');
        throw new Error('Invalid max instance count');
    }
    // Get App
    const existingApp = await Params.getApp(args.app);
    if (!existingApp){
        console.log('Err: No app named ' + args.app);
        throw new Error('Err: No app named ' + args.app)
    }
    // Get Instance
    const existingInstance = existingApp.instances.find(ins=>{ return ins.domain.toLowerCase() === args.domain.toLowerCase() })
    if (existingInstance){
        console.log('Err: Existing Intance with name ' + args.domain);
        throw new Error('Existing Instance')
    }
    // Get Hosted Zone
    const rootDomain = parseDomain(args.domain);
    const hostedZoneId = await getHostedZoneId(rootDomain);
    if (!hostedZoneId){
        console.log('Err: Hosted zone/domain not found ' + rootDomain);
        throw new Error('Domain not found')
    }

    const instanceParams = {
        domain: args.domain,
        region: args.region,
        version: null,
        build: null,
        amiName: null,
        stackName: `${args.app.toUpperCase()}-i-${args.domain.replaceAll(/[^A-Za-z0-9]/ig,'-').toUpperCase()}`,
        cfParams: {
            AmiId: null,
            VpcId: null,
            InstanceSubnets: [],
            InstanceRootDomain: hostedZoneId,
            InstanceDomain: args.domain,
            MaxEc2Instances: args.max || 2,
            AdminEmail: args.admin,
            EC2InstanceType: args.ins || 't2.small'
        }
    }

    // Get VPC & Subnets
    instanceParams.cfParams.VpcId = await getVPC(args.region);
    instanceParams.cfParams.InstanceSubnets = await getSubnets(args.region)

    // Update SSM
    console.log('Updating instance params')
    await Params.addInstance(args.app,args.domain,instanceParams);
    
    console.log(`Added instance ${args.domain}`);
    return true;
}

//////////////////////////////////////////////////
//////////////////////////////////////////////////
/////////////////////////////////////////////////


function parseDomain(domain){
    const domainArray = domain.split('.');
    const rootDomainName = domainArray.length === 2 ? domainArray[0] : domainArray[domainArray.length-2]
    const rootDomain = rootDomainName + '.'+ domainArray[domainArray.length-1];
    return rootDomain;
}

async function getVPC(region){
    console.log('Getting default VPC ID')
    // Initialize an Amazon EC2 client object.
    const ec2Client = new EC2Client({ region }); // replace with your desired region
    const data = await ec2Client.send(new DescribeVpcsCommand({}));
    
    // Find the default VPC from the list of VPCs.
    const defaultVpc = data.Vpcs.find(vpc => vpc.IsDefault);
    
    // Return the VPC ID if the default VPC is found.
    return defaultVpc.VpcId;
}

async function getSubnets(region){
    console.log('Retrieving Subnets')
    const ec2Client = new EC2Client({ region }); 
    const subnetsData = await ec2Client.send(new DescribeSubnetsCommand({}));
    const subNets = subnetsData.Subnets.filter(s=>{ return s.DefaultForAz === true });
    const subnetList = subNets.map(subnet => subnet.SubnetId  );
    return subnetList;
}

async function getHostedZoneId(hostedZoneName){
    hostedZoneName += '.';
    const client = new Route53Client({ region: "us-east-1" });
    const command = new ListHostedZonesByNameCommand({ DNSName: hostedZoneName });
    let response;
    try {
        response = await client.send(command);
    } catch(e){
        console.log(e);
        return false;
    }
    

    // Check if we have the desired hosted zone in the response
    if (response.HostedZones && response.HostedZones.length > 0) {
        for (let zone of response.HostedZones) {
            if (zone.Name === hostedZoneName) {
                return zone.Id.split("/").pop(); // Extracting the ID part from the full ARN
            }
        }
    } else {
        return false;
    }
}


async function sleep(time){
    return new Promise(function (resolve, reject) {
        setTimeout(function () { resolve(true);
        }, time);
    });
}

