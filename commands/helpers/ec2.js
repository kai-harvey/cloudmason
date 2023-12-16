const { EC2Client, RunInstancesCommand,CreateImageCommand,TerminateInstancesCommand,DescribeInstanceStatusCommand,DeregisterImageCommand,DescribeImagesCommand,CopyImageCommand } = require("@aws-sdk/client-ec2");

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
