const { S3Client,PutObjectCommand,CopyObjectCommand,HeadObjectCommand,DeleteObjectsCommand,ListObjectsV2Command,GetObjectCommand,ListObjectVersionsCommand,DeleteObjectCommand } = require("@aws-sdk/client-s3");
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

exports.getInfraFile = async function(fileKey){
    const client = new S3Client({ region: process.env.orgRegion });
    const params = {
        Bucket: process.env.orgBucket,
        Key: fileKey.toLowerCase(),
    };
    const command = new GetObjectCommand(params);
    const response = await client.send(command);

    const streamToString = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      });

    const fileContent = await streamToString(response.Body);
    return fileContent;
}

exports.emptyBucket = async function(bucketName,region){
    await emptyS3Bucket(bucketName,region)
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

exports.readFiles = async function(bucketName,prefix,region){
    const  s3Client= new S3Client({region});
    const Content = [];
    const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 50
    });
    const listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents) { return []}
    

    const proms = listResponse.Contents.map(object=>{ 
        return s3Client.send(new GetObjectCommand({
            Bucket: bucketName,
            Key: object.Key,
        })).then(r=>{
            return streamToString(r.Body).then(fileContent=>{
                Content.push({ 
                    Key: object.Key, 
                    FileName: object.Key.replace(prefix + '/',''),
                    Content: fileContent,
                    LastModified: object.LastModified
                });
            })
        });
    })
    await Promise.all(proms);
    return Content.sort((a,b)=>{ return new Date(a.LastModified) - new Date(b.LastModified)  });
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


async function emptyS3Bucket(bucketName, region) {
    const  s3Client= new S3Client({region});

    // List all object versions
    const listedObjectVersions = await s3Client.send(new ListObjectVersionsCommand({ Bucket: bucketName }));
    if (listedObjectVersions.Versions || listedObjectVersions.DeleteMarkers) {
        const objectsToDelete = [
            ...listedObjectVersions.Versions.map(v => ({ Key: v.Key, VersionId: v.VersionId })),
            ...listedObjectVersions.DeleteMarkers.map(dm => ({ Key: dm.Key, VersionId: dm.VersionId }))
        ];

        for (const object of objectsToDelete) {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: object.Key,
                VersionId: object.VersionId
            }));
        }
    }
    
    // List all objects
    const listedObjects = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    // Delete all objects
    const deleteParams = {
        Bucket: bucketName,
        Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) }
    };
    await s3Client.send(new DeleteObjectsCommand(deleteParams));

    // Recursively call the function if the bucket is not empty
    if (listedObjects.IsTruncated) await emptyS3Bucket(bucketName);
}

async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
    });
}