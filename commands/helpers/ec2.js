const { EC2Client, GetConsoleOutputCommand, RunInstancesCommand,CreateImageCommand,TerminateInstancesCommand,DescribeInstanceStatusCommand,DeregisterImageCommand,DescribeImagesCommand,CopyImageCommand } = require("@aws-sdk/client-ec2");
const { AutoScalingClient, DescribeAutoScalingGroupsCommand } = require("@aws-sdk/client-auto-scaling");

exports.findAMI = async function(image_name,region){
    const client = new EC2Client({ region });
    const input = { // DescribeImagesRequest
        Filters: [ // FilterList
            { // Filter
            Name: "name",
            Values: [ // ValueStringList
                image_name,
            ],
            },
        ],
        IncludeDeprecated: true,
        DryRun: false,
        MaxResults: 6
    };
    const command = new DescribeImagesCommand(input);
    const response = await client.send(command);
    const images = response.Images;
    if (!images[0]){ 
        console.log('No existing image with name:' + image_name)
        return false; 
    };
    return images[0].ImageId;
}

exports.awsLinuxAMI = function(region){
    const ami = {
        "us-east-1": "ami-0759f51a90924c166",
        "us-east-2": "ami-048e636f368eb3006",
        "us-west-1": "ami-0a07b0077b66673f1",
        "us-west-2": "ami-0c00eacddaea828c6",
        "ap-east-1": "",
        "ap-south-1": "",
        "ap-northeast-2": "",
        "ap-southeast-1": "",
        "ap-southeast-2": "",
        "ap-northeast-1": "",
        "ca-central-1": "ami-02d34aedb8fa9c346",
        "eu-central-1": "",
        "eu-west-1": "",
        "eu-west-2": "",
        "eu-west-3": "",
        "eu-north-1": "",
        "me-south-1": "",
        "sa-east-1": "ami-0f4e579ad17e32ab7"
    }[region];
    if (!ami){ throw 'No AMI found for region ' + region };
    return ami;
}

exports.listAMIs = async function(image_name,region){
    const client = new EC2Client({ region });
    image_name = image_name + '*';
    const input = { // DescribeImagesRequest
        Filters: [ // FilterList
            { // Filter
                Name: "name",
                Values: [ // ValueStringList
                    image_name,
                ],
            }
        ],
        Owners: [ // OwnerStringList
            "self",
        ],
        IncludeDeprecated: false,
        IncludeDisabled: false,
        DryRun: false,
        MaxResults: 6
    };
    const command = new DescribeImagesCommand(input);
    const response = await client.send(command);
    if (response.Images){
        return response.Images.map(i=>{ return { ImageId: i.ImageId, Name: i.Name } });
    } else {
        return [];
    }
}

exports.copyAMI = async function(image_name,src_ami,src_region,dest_region){
    
    const destinationEc2Client = new EC2Client({ region: dest_region });

    const copyImageCommand = new CopyImageCommand({
        SourceRegion: src_region,
        SourceImageId: src_ami,
        Name: image_name,
    });
    
    const { ImageId } = await destinationEc2Client.send(copyImageCommand);
    return ImageId;
}

exports.deleteAMI = async function(image_id,region){
    const client = new EC2Client({ region });
    const input = {
        ImageId: image_id,
        DryRun: false
    };
    const command = new DeregisterImageCommand(input);
    const response = await client.send(command);
    return response;
}

exports.checkAMIStatus = async function(image_id,region){
    const client = new EC2Client({ region }); // Replace 'your-region' with your AWS region

    const command = new DescribeImagesCommand({
        ImageIds: [image_id]
    });

    const response = await client.send(command);
    if (response.Images && response.Images.length > 0 && response.Images[0].State.toLowerCase() === 'available') {
        return true;
    } else {
        return false;
    }

}

exports.getConsoleOutput = async function(autoScalingGroupName,region,latest=true){
    const autoScalingClient = new AutoScalingClient({ region }); // specify your region
    const ec2Client = new EC2Client({ region });

    try {
        // Get instance IDs from Auto Scaling group
        const describeGroupsCommand = new DescribeAutoScalingGroupsCommand({
            AutoScalingGroupNames: [autoScalingGroupName]
        });
        const groupResponse = await autoScalingClient.send(describeGroupsCommand);
        const instances = groupResponse.AutoScalingGroups[0].Instances;
        const instanceIds = instances.map(instance => instance.InstanceId);

        // Get console output for each instance
        const consoleOutput = [];
        
        for (let i=0;i<instanceIds.length;i++){
            const consoleOutputCommand = new GetConsoleOutputCommand({ InstanceId: instanceIds[i],Latest: latest });
            const outputResponse = await ec2Client.send(consoleOutputCommand);
            const output = outputResponse.Output ? Buffer.from(outputResponse.Output, "base64").toString("ascii") : '';
            consoleOutput.push({
                instanceId: instanceIds[i],
                output: output
            });
        }
        return consoleOutput;
    } catch (error) {
        console.error("Error fetching EC2 console outputs:", error);
        throw error;
    }
}
