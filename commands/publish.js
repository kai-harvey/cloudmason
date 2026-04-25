const { MarketplaceCatalogClient, StartChangeSetCommand, DescribeChangeSetCommand } = require("@aws-sdk/client-marketplace-catalog");
const { EC2Client, DescribeImagesCommand } = require("@aws-sdk/client-ec2");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');
const Params = require('./helpers/params');

// Parse path-style, virtual-hosted, or s3:// URLs into {bucket, key, region}
function parseS3Url(url){
    if (!url){ throw new Error('Missing S3 URL'); }
    let m;
    if ((m = url.match(/^s3:\/\/([^/]+)\/(.+)$/)))                                 { return { bucket: m[1], key: m[2], region: null }; }
    if ((m = url.match(/^https:\/\/s3\.([^.]+)\.amazonaws\.com\/([^/]+)\/(.+)$/))) { return { bucket: m[2], key: m[3], region: m[1] }; }
    if ((m = url.match(/^https:\/\/s3\.amazonaws\.com\/([^/]+)\/(.+)$/)))          { return { bucket: m[1], key: m[2], region: null }; }
    if ((m = url.match(/^https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)$/))) { return { bucket: m[1], key: m[3], region: m[2] }; }
    if ((m = url.match(/^https:\/\/([^.]+)\.s3\.amazonaws\.com\/(.+)$/)))          { return { bucket: m[1], key: m[2], region: null }; }
    throw new Error('Unrecognized S3 URL format: ' + url);
}

// AWS Marketplace requires virtual-hosted-style URLs for Template/ArchitectureDiagram
function toVirtualHostedUrl(url){
    const { bucket, key, region } = parseS3Url(url);
    return region
        ? `https://${bucket}.s3.${region}.amazonaws.com/${key}`
        : `https://${bucket}.s3.amazonaws.com/${key}`;
}

async function readS3Text(url){
    const { bucket, key, region } = parseS3Url(url);
    const client = new S3Client({ region: region || process.env.orgRegion });
    const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await resp.Body.transformToString();
}

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
    pubArgs.arch = instanceVersion.arch || 'x86_64';
    if (args.cft){
        pubArgs.cftS3Url = instanceVersion.stackURL;
        if (!pubArgs.cftS3Url){
            console.log('ERR: No stack URL found for version',pubArgs.version);
            throw new Error('No stack URL found for version:' + pubArgs.version);
        }
        const missing = ['short','long','diagram'].filter(k => !args[k]);
        if (missing.length){
            throw new Error('Missing required CFT args: ' + missing.map(k=>'-'+k).join(', '));
        }
        pubArgs.shortDescS3Url   = args.short;
        pubArgs.longDescS3Url    = args.long;
        pubArgs.archDiagramS3Url = args.diagram;
        console.log('Publishing AMI + CFT:\n\t',Object.entries(pubArgs).map(([k,v])=>{return `${k}:${v}`}).join('\n\t'));
        await exports.updateAmiCft(pubArgs);
    } else {
        if (!args.stack){
            throw new Error('Missing required arg -stack for AMI-only publish');
        }
        console.log('Publishing AMI:\n\t',Object.entries(pubArgs).map(([k,v])=>{return `${k}:${v}`}).join('\n\t'));
        await updateAmiVersion(pubArgs);

        // -- Get Marketplace AMI IDs
        // AmiAlias: '/aws/service/marketplace/prod-shmtmk4gqrfge/1.2'
        const amiAlias = `/aws/service/marketplace/${pubArgs.productId}/${pubArgs.version}`;
        console.log('AMI Alias:',amiAlias);
        let stackTxt = fs.readFileSync(path.resolve(args.stack),'utf8');
        // stackTxt = stackTxt.replace(`ImageId: !Ref AmiId`,`ImageId: resolve:ssm:${amiAlias}`);
        stackTxt = stackTxt.replace(/^#-Strip.+#-Strip/ms,'');

        // -- Update CF Template with AMI IDs
        // const newFileName = path.resolve(args.out);
        // console.log('Updating Template:',newFileName);
        // fs.writeFileSync(newFileName,stackTxt);
    }

    console.log('----------')

    // -- Suggest next step
    console.log('\nTo wait for this version to be publicly available in marketplace, run:');
    console.log(`  mason await-ami -app ${args.app} -v ${args.v}`);

    return true
}




// Update AMI Function

const updateAmiVersion = async ({productId, amiId, version, changeDescription, arch}) => {
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
                                    "OperatingSystemVersion": arch === 'arm'
                                        ? "Amazon Linux 2023 arm64 HVM"
                                        : "Amazon Linux 2 AMI 2.0.20220207.1 x86_64 HVM gp2"
                                },
                                "UsageInstructions": "Visit Theorim.ai/install for installation instructions",
                                "RecommendedInstanceType": arch === 'arm' ? "r8g.medium" : "m6a.large",
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


// Update AMI + CloudFormation Template Function

exports.updateAmiCft = async ({productId, amiId, version, changeDescription, arch, cftS3Url, shortDescS3Url, longDescS3Url, archDiagramS3Url}) => {
    const client = new MarketplaceCatalogClient({ region: process.env.orgRegion });
    console.log('Updating AMI+CFT version:', productId, amiId, version, changeDescription, cftS3Url);

    const shortDescription = await readS3Text(shortDescS3Url);
    const longDescription  = await readS3Text(longDescS3Url);
    const templateUrl      = toVirtualHostedUrl(cftS3Url);
    const diagramUrl       = toVirtualHostedUrl(archDiagramS3Url);

    try {
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
                DeliveryOptions: [
                    {
                        DeliveryOptionTitle: "AMI with CloudFormation Template",
                        Details: {
                            "DeploymentTemplateDeliveryOptionDetails": {
                                "ShortDescription": shortDescription,
                                "LongDescription": longDescription,
                                "UsageInstructions": "Visit Theorim.ai/install for installation instructions",
                                "RecommendedInstanceType": arch === 'arm' ? "r8g.medium" : "m6a.large",
                                "ArchitectureDiagram": diagramUrl,
                                "Template": templateUrl,
                                "TemplateSources": [
                                    {
                                        "ParameterName": "AmiId",
                                        "AmiSource": {
                                            "AmiId": amiId,
                                            "AccessRoleArn": "arn:aws:iam::590183947985:role/Theorim_MarketPlaceRole",
                                            "UserName": "ec2-user",
                                            "OperatingSystemName": "AMAZONLINUX",
                                            "OperatingSystemVersion": arch === 'arm'
                                                ? "Amazon Linux 2023 arm64 HVM"
                                                : "Amazon Linux 2 AMI 2.0.20220207.1 x86_64 HVM gp2"
                                        }
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

      const startChangeSetCommand = new StartChangeSetCommand(changeSet);
      const startResponse = await client.send(startChangeSetCommand);
      console.log("Change set started:", startResponse);

      const changeSetId = startResponse.ChangeSetId;

      let status = "IN_PROGRESS";
      while (status === "IN_PROGRESS") {
        await new Promise(resolve => setTimeout(resolve, 5000));

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
      console.error("Error updating AMI+CFT version:", error);
      throw error;
    }
};





