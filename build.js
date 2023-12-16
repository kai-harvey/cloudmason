const fs = require('fs');

const pckg = JSON.parse(fs.readFileSync('./package.json'));

const branch = process.env.branch;
const build = process.env.build;

console.log(`Branch: ${branch}`);
console.log(`Build: ${build}`);

const branchParts = branch.split('/');
const lastPart = branchParts[branchParts.length - 1];
const majorVersion = lastPart.replaceAll(/[^0-9\.]/g, '');

const version = `${majorVersion}.${build}`;

pckg.version = version;

console.log(`Version: ${version}`);

fs.writeFileSync('./package.json', JSON.stringify(pckg));