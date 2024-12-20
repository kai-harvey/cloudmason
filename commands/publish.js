const { MarketplaceCatalogClient, StartChangeSetCommand,DescribeChangeSetCommand } = require("@aws-sdk/client-marketplace-catalog");
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

    // -- Update CF Template with AMI IDs

    // -- Publish CFT

}



//  * Publishes an AMI to AWS Marketplace.
//  * @param {string} region - AWS region.
//  * @param {string} productId - The AWS Marketplace product ID.
//  * @param {string} amiId - The AMI ID to publish.
//  * @param {string} version - Version string for the AMI.
//  * @param {string} changeDescription - Description of the change.
//  * @returns {Promise<void>} - Resolves when the operation completes.

// async function publishAmi({region, productId, amiId, version, changeDescription}) {
//   const client = new MarketplaceCatalogClient({ region });

//   const changeSet = [
//     {
//       ChangeType: "AddDeliveryOptions",
//       Entity: {
//         Type: "AmiProduct@1.0",
//         Identifier: amiId,
//       },
//       Details: JSON.stringify({
//         ProductId: productId,
//         DeliveryOptionDetails: [
//           {
//             DeliveryOptionId: "ami-delivery",
//             DeliveryOptionType: "AMI",
//             AmiDelivery: {
//               AmiId: amiId,
//             },
//           },
//         ],
//       }),
//     },
//     {
//       ChangeType: "AddVersion",
//       Entity: {
//         Type: "AmiProduct@1.0",
//         Identifier: amiId,
//       },
//       Details: JSON.stringify({
//         VersionTitle: version,
//         ProductId: productId,
//       }),
//     },
//   ];

//   const command = new StartChangeSetCommand({
//     Catalog: "AWSMarketplace",
//     ChangeSet: changeSet,
//     ChangeSetName: `Publish-${amiId}`,
//     ChangeSetDescription: changeDescription,
//   });

//   try {
//     const response = await client.send(command);
//     console.log("Change set created:", response);
//   } catch (error) {
//     console.error("Error creating change set:", error);
//     throw error;
//   }
// }



const updateAmiVersion = async ({productId, amiId, version, changeDescription}) => {
    const client = new MarketplaceCatalogClient({ region: process.env.orgRegion }); // Update the region if needed
    console.log('Updating AMI version:',productId, amiId, version, changeDescription);
    try {
      // Define the change set to update the AMI version
      const changeSet = {
        Catalog: "AWSMarketplace",
        Intent: "VALIDATE",
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
          break;
        }
      }
    } catch (error) {
      console.error("Error updating AMI version:", error);
    }
  };



