const { S3Client,PutObjectCommand,CopyObjectCommand,HeadObjectCommand,DeleteObjectsCommand,ListObjectsV2Command } = require("@aws-sdk/client-s3");
const fs = require('fs');


exports.uploadInfraFile = async function(fileKey,localPath){
    const s3Path = fileKey;
    if (!fs.existsSync(localPath)){
        throw new Error('File does not exist:' + localPath)
    }
    const fileStream = fs.createReadStream(localPath);
    // Upload Stack
    const client = new S3Client({region: process.env.orgRegion});
    const input = {
        Body: fileStream,
        Bucket: process.env.orgBucket,
        Key: s3Path.toLowerCase()
    };
    const poCommand = new PutObjectCommand(input);
    const poResponse = await client.send(poCommand);
    return poResponse;
}

exports.uploadInfraText = async function(fileKey,fileText){
    // Upload Stack
    const client = new S3Client({region: process.env.orgRegion});
    const input = {
        Body: fileText,
        Bucket: process.env.orgBucket,
        Key: fileKey.toLowerCase()
    };
    const poCommand = new PutObjectCommand(input);
    const poResponse = await client.send(poCommand);
    return poResponse;
}

exports.infraFileExists = async function(fileKey){
    const client = new S3Client({region: process.env.orgRegion});
    
    const input = {
        Bucket: process.env.orgBucket,
        Key: fileKey.toLowerCase()
    };

    const command = new HeadObjectCommand(input)
    try{
        const response = await client.send(command);
        return true;
    } catch (e){
        if (/NotFound/.test(e)){
            return false;
        } else {
            console.log('Uncaught Error:',e)
            throw e;
        }
    }
}


exports.copyInfraFile = async function(srcKey,destKey){
    const client = new S3Client({ region: process.env.orgRegion });
    const params = {
        Bucket: process.env.orgBucket,
        CopySource: `${process.env.orgBucket}/${srcKey}`,
        Key: destKey.toLowerCase(),
    };
    await client.send(new CopyObjectCommand(params));
    return true;
}

exports.deleteAppFolder = async function(appName){
    await deleteFolder(
        process.env.orgBucket,
        `apps/${appName.toLowerCase()}/`,
        process.env.orgRegion
    )
    return true;
}


///////////

async function deleteFolder(bucketName, prefix, region){
    const client = new S3Client({ region });
    const listParams = {
        Bucket: bucketName,
        Prefix: prefix
    };
    const listedObjects = await client.send(new ListObjectsV2Command(listParams));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    // Array to hold all keys to delete
    const deleteKeys = listedObjects.Contents.map(({ Key }) => ({ Key }));

    // Delete objects
    const deleteParams = {
        Bucket: bucketName,
        Delete: { Objects: deleteKeys }
    };
    await client.send(new DeleteObjectsCommand(deleteParams));

    // In case of pagination (more than 1000 objects), recursively handle the next batch
    if (listedObjects.IsTruncated) await deleteFolder(bucketName, prefix, region);
}