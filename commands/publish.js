const { MarketplaceCatalogClient, StartChangeSetCommand, DescribeChangeSetCommand } = require("@aws-sdk/client-marketplace-catalog");
const { EC2Client, DescribeImagesCommand } = require("@aws-sdk/client-ec2");
const fs = require('fs');
const path = require('path');
const Params = require('./helpers/params');

exports.add_listing = async function(args){
    console.log('Adding Listing>>', args.app, args.pid);
    await Params.addPid(args.app,args.pid.trim());
    const app = await Params.getApp(args.app);
    console.log('Added listing:',args.app, app.pid);
}

exports.main = async function(args){
    // -- Get Version & Descriptions
    const pubArgs = {
        version: args.v,
        changeDescription: args.desc
    };

    // -- Get Params
    const app = await Params.getApp(args.app);
    pubArgs.productId = app.pid;
    const instanceVersion = app.versions[pubArgs.version];
    if (!instanceVersion){
        console.log('ERR: Version not found:',pubArgs.version);
        throw new Error('Version not found:' + pubArgs.version);
    }
    pubArgs.amiId = instanceVersion.baseAMI_Id;
    console.log('Publishing AMI:\n\t',Object.entries(pubArgs).map(([k,v])=>{return `${k}:${v}`}).join('\n\t'));
    console.log('----------')
    
    // -- Publish AMI to Marketplace
    await updateAmiVersion(pubArgs);

    // -- Get Marketplace AMI IDs
    // AmiAlias: '/aws/service/marketplace/prod-shmtmk4gqrfge/1.2'
    const amiAlias = `/aws/service/marketplace/${pubArgs.productId}/${pubArgs.version}`;
    console.log('AMI Alias:',amiAlias);
    let stackTxt = fs.readFileSync(path.resolve(args.stack),'utf8');
    stackTxt = stackTxt.replace(`ImageId: !Ref AmiId`,`ImageId: resolve:ssm:${amiAlias}`);
    stackTxt = stackTxt.replace(/^#-Strip.+#-Strip/ms,'');

    // -- Update CF Template with AMI IDs
    const newFileName = path.resolve(args.out);
    console.log('Updating Template:',newFileName);
    fs.writeFileSync(newFileName,stackTxt);

    // -- Suggest next step
    console.log('\nTo wait for this version to be publicly available in marketplace, run:');
    console.log(`  mason await-ami -app ${args.app} -v ${args.v}`);

    return true
}




// Update AMI Function

const updateAmiVersion = async ({productId, amiId, version, changeDescription}) => {
    const client = new MarketplaceCatalogClient({ region: process.env.orgRegion }); // Update the region if needed
    console.log('Updating AMI version:',productId, amiId, version, changeDescription);
    try {
      // Define the change set to update the AMI version
      const changeSet = {
        Catalog: "AWSMarketplace",
        Intent: "APPLY",
        ChangeSet: [
          {
            ChangeType: "AddDeliveryOptions",
            Entity: {
              Type: "AmiProduct@1.0",
              Identifier: productId,
            },
            Details: JSON.stringify({
                Version: {
                    VersionTitle: version,
                    ReleaseNotes: changeDescription,
                },
                DeliveryOptions:[
                    {
                        Details:
                        {
                            "AmiDeliveryOptionDetails": {
                                "AmiSource":{
                                    "AmiId": amiId,
                                    "AccessRoleArn": "arn:aws:iam::590183947985:role/Theorim_MarketPlaceRole",
                                    "UserName": "ec2-user",
                                    "OperatingSystemName": "AMAZONLINUX",
                                    "OperatingSystemVersion": "Amazon Linux 2 AMI 2.0.20220207.1 x86_64 HVM gp2"
                                },
                                "UsageInstructions": "Visit Theorim.ai/install for installation instructions",
                                "RecommendedInstanceType": "m6a.large",
                                "SecurityGroups":
                                [
                                    {
                                        "IpProtocol": "tcp",
                                        "FromPort": 443,
                                        "ToPort": 443,
                                        "IpRanges":["0.0.0.0/0"]
                                    },
                                    {
                                        "IpProtocol": "tcp",
                                        "FromPort": 8080,
                                        "ToPort": 8080,
                                        "IpRanges":["0.0.0.0/0"]
                                    }
                                ]
                            }
                        }
                    }
                ]
            }),
          },
        ],
      };
  
      // Start the change set
      const startChangeSetCommand = new StartChangeSetCommand(changeSet);
      const startResponse = await client.send(startChangeSetCommand);
      console.log("Change set started:", startResponse);
  
      const changeSetId = startResponse.ChangeSetId;
  
      // Poll for the status of the change set
      let status = "IN_PROGRESS";
      while (status === "IN_PROGRESS") {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before polling
  
        const describeChangeSetCommand = new DescribeChangeSetCommand({
          Catalog: "AWSMarketplace",
          ChangeSetId: changeSetId,
        });
        const describeResponse = await client.send(describeChangeSetCommand);
  
        status = describeResponse.Status;
        console.log("Change set status:", status);
  
        if (status === "SUCCEEDED") {
          console.log("Change set succeeded:", describeResponse);
          break;
        } else if (status === "FAILED") {
          console.error("Change set failed:", describeResponse);
          throw new Error("Change set failed");
        }
      }

    } catch (error) {
      console.error("Error updating AMI version:", error);
      throw error;
    }
};


// Get AMI Ids Function
const getRegions = async (productId) => {
  const client = new MarketplaceCatalogClient({ region: process.env.orgRegion }); // Update region if needed


    const command = new DescribeEntityCommand({
      Catalog: "AWSMarketplace",
      EntityId: productId,
    });
    const response = await client.send(command);
    console.log('dd',response.DetailsDocument);
    console.log('v',response.DetailsDocument.Versions[1].DeliveryOptions[0].AmiAlias);
    return response.DetailsDocument.RegionAvailability.Regions;
    // console.log("Regions:", response.DetailsDocument.Description.RegionAvailability.Regions);
    // console.log("Version:", response.DetailsDocument.Description.RegionAvailability.Regions);
    // Extract AMI details by region
}

// List by Mktplc Listing
const getAMIs = async (region,productName,productCode) => {
    const ec2Client = new EC2Client({ region });

    try {
        const command = new DescribeImagesCommand({
            Filters: [
                {
                    Name: "name",
                    Values: [
                        `${productName}-*-${productCode}` // Adjust the filter to match your product naming pattern
                    ]
                }
            ]
        });

        const response = await ec2Client.send(command);

        console.log(`Found ${response.Images.length} AMIs for product: ${productName} in region: ${region}`);
        for (const ami of response.Images) {
            console.log('ami',ami);
        }

        return response.Images;
    } catch (error) {
        console.error(`Error fetching AMIs for product: ${productName} in region: ${region}`, error);
        throw error;
    }
}



