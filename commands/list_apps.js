const EC2 = require('./helpers/ec2');
const Params = require('./helpers/params');


exports.main = async function(){
    const apps = await Params.listApps();
    for(let i=0; i<apps.length; i++){
        const app = apps[i];
        console.log(`${app.name} <${app.stack}>`);
        console.log('\tVERSIONS')
        Object.entries(app.versions).forEach((k)=>{
            const s = k[0].length > 5 ? 1 : (5 - k[0].length);
            console.log(`\t\t[${k[0]}]${' '.repeat(s)}ami:${k[1].baseAMI_Name} | build: ${k[1].currentBuild} | updated: ${new Date(k[1].updated).toLocaleString()} `)
        })
        console.log('\tINSTANCES')
        app.instances.forEach(ins=>{
            const s = ins.domain.length > 20 ? 1 : (20 - ins.domain.length);
            console.log(`\t\t[${ins.domain}]${' '.repeat(s)} version:${ins.version} | region:${ins.region} | ami: ${ins.amiName} | stack: ${ins.stackName} | lastDeploy: ${Date(ins.lastDeploy).toLocaleString()} `)
        })
        console.log('--------------')
    }
}