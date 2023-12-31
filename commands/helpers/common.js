const Params = require('./params');
const EC2 = require('./ec2');


exports.prune_amis = async function(appName,version,region,removeLatest){
    // Removal Func
    const removeUnused = async function(aN,v,r){
        const app = await Params.getApp(appName);
        const latestBuildAMI = app.versions[version].baseAMI_Name;
        
        // All AMIs
        const AMIs = await EC2.listAMIs(`${appName}-v${version}`,region);
        // console.log(`Found ${AMIs.length} AMIs in ${region}`)

        // Used AMIs
        const regionInstances = app.instances.filter(i=>{ return i.region === region });
        const usedAMIs = regionInstances.map(i=>{ return i.amiName });
        // console.log(`Found ${usedAMIs.length} used AMIs in ${region}`)


        // Remove Unused AMI from Target Region
        let unusedAMIs = AMIs.filter(ami=>{ return !usedAMIs.includes(ami.Name) });
        if (removeLatest !== true){
            console.log('Retaining latest build ', latestBuildAMI, 'in ', region)
            unusedAMIs = unusedAMIs.filter(ami=>{ return ami.Name !== latestBuildAMI })
        } else {
            console.log('Removing latest build ', latestBuildAMI, 'in ', region)
        }
        // console.log(`Found ${unusedAMIs.length} unused AMIs in ${region}`);

        for (const ami of unusedAMIs){
            console.log(`Deregistering ${ami.Name} in ${region}`)
            await EC2.deleteAMI(ami.ImageId,region);
        }
    }
    // Remove from target region
    await removeUnused(appName,version,region);
    // Remove from org region
    await removeUnused(appName,version,process.env.orgRegion);
}

exports.remove_app_amis = async function(appName,region){
    // All AMIs
    const AMIs = await EC2.listAMIs(`${appName}-v`,region);
    for (const ami of AMIs){
        console.log(`Deregistering ${ami.Name} in ${region}`)
        await EC2.deleteAMI(ami.ImageId,region);
    }
}

exports.sleep = async function(s){
    s = s*1000;
    return new Promise(function (resolve, reject) {
        setTimeout(function () { resolve(true);
        }, s);
    });
}

exports.formatDate = function(utcMillis){
    let date;
    if (typeof(utcMillis) === 'string'){
        date = new Date(utcMillis);
    } else {
        date = new Date(utcMillis);
    }

    // Extracting individual components in local time
    const month = date.getMonth() + 1; // getMonth returns month from 0-11
    const day = date.getDate();
    const year = date.getFullYear().toString().substr(-2); // Get last two digits of the year
    const hours = date.getHours();
    const minutes = date.getMinutes();

    // Formatting each component to ensure two digits
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');

    // Constructing the final string
    return `${formattedMonth}-${formattedDay}-${year} ${formattedHours}:${formattedMinutes}`;
}