const { AWSMarketplaceCatalogClient, StartChangeSetCommand } = require("@aws-sdk/client-marketplace-catalog");
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
        region: process.env.orgRegion,
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
    pubArgs.amiId = instanceVersion.baseAMI_Name;
    console.log('Publishing AMI:\n',Object.entries(pubArgs).map(([k,v])=>{return `${k}:${v}`}).join('\n\t'));
    console.log('----------')
    // -- Publish AMI to Marketplace
    await publishAmi(pubArgs);

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

async function publishAmi({region, productId, amiId, version, changeDescription}) {
  const client = new AWSMarketplaceCatalogClient({ region });

  const changeSet = [
    {
      ChangeType: "AddDeliveryOptions",
      Entity: {
        Type: "Image",
        Identifier: amiId,
      },
      Details: JSON.stringify({
        ProductId: productId,
        DeliveryOptionDetails: [
          {
            DeliveryOptionId: "ami-delivery",
            DeliveryOptionType: "AMI",
            AmiDelivery: {
              AmiId: amiId,
            },
          },
        ],
      }),
    },
    {
      ChangeType: "AddVersion",
      Entity: {
        Type: "Image",
        Identifier: amiId,
      },
      Details: JSON.stringify({
        VersionTitle: version,
        ProductId: productId,
      }),
    },
  ];

  const command = new StartChangeSetCommand({
    Catalog: "AWSMarketplace",
    ChangeSet: changeSet,
    ChangeSetName: `Publish-${amiId}`,
    ChangeSetDescription: changeDescription,
  });

  try {
    const response = await client.send(command);
    console.log("Change set created:", response);
  } catch (error) {
    console.error("Error creating change set:", error);
    throw error;
  }
}







