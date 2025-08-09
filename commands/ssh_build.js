const { 
    EC2Client, 
    RunInstancesCommand, 
    DescribeImagesCommand,
    DescribeInstancesCommand,
    DescribeVpcsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    AuthorizeSecurityGroupEgressCommand,
    RevokeSecurityGroupEgressCommand,
    CreateKeyPairCommand,
    StopInstancesCommand,
    CreateImageCommand,
    TerminateInstancesCommand,
    DeleteSecurityGroupCommand,
    DeleteKeyPairCommand,
    waitUntilInstanceRunning,
    waitUntilInstanceStopped,
    waitUntilImageAvailable,
    waitUntilInstanceTerminated
} = require('@aws-sdk/client-ec2');

const { 
    IAMClient, 
    CreateRoleCommand,
    PutRolePolicyCommand,
    CreateInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    RemoveRoleFromInstanceProfileCommand,
    DeleteInstanceProfileCommand,
    DeleteRolePolicyCommand,
    DeleteRoleCommand
} = require('@aws-sdk/client-iam');

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

// All SSH setup commands - array of [description, command]
const SETUP_COMMANDS = [
    ['Updating system packages', 'sudo dnf update -y'],
    ['Installing nodejs', 'sudo dnf install -y nodejs'],
    ['Node version', 'node --version'],
    ['Installing cloudwatch agent', 'sudo dnf install -y amazon-cloudwatch-agent'],
    ['Installing python', 'sudo dnf -y install python3'],
    ['Installing unzip', 'sudo dnf -y install unzip'],
    ['Installing pm2', 'sudo npm install -g pm2'],
    ['Creating app directory', 'sudo mkdir -p /app'],
];


class EC2AMIBuilder {
    constructor(amiName, instanceType = 'm6a.large', s3PackageUrl) {
        if (!amiName || !s3PackageUrl) {
            throw new Error('amiName and s3PackageUrl are required parameters');
        }
        
        this.amiName = amiName;
        this.instanceType = instanceType;
        this.s3PackageUrl = s3PackageUrl;
        
        // AWS clients
        const region = process.env.AWS_REGION || 'us-east-1';
        this.ec2Client = new EC2Client({ region });
        this.iamClient = new IAMClient({ region });
        
        // Generate unique names for temporary resources
        this.timestamp = Date.now();
        this.keyPairName = `ec2-builder-keypair-${this.timestamp}`;
        this.securityGroupName = `ec2-builder-sg-${this.timestamp}`;
        this.iamRoleName = `ec2-builder-role-${this.timestamp}`;
        this.instanceProfileName = `ec2-builder-profile-${this.timestamp}`;
        this.privateKeyPath = path.join(__dirname, `${this.keyPairName}.pem`);
        
        // Resource tracking for cleanup
        this.createdResources = {
            instanceId: null,
            keyPairName: null,
            securityGroupId: null,
            iamRoleName: null,
            instanceProfileName: null
        };
        
        this.sshConnection = null;
        this.publicIp = null;
    }

    async getLatestAmazonLinuxAMI() {
        console.log('🔍 Finding latest Amazon Linux AMI...');
        
        const command = new DescribeImagesCommand({
            Filters: [
                {
                    Name: 'name',
                    Values: ['al2023-ami-*-x86_64']
                },
                {
                    Name: 'owner-alias',
                    Values: ['amazon']
                },
                {
                    Name: 'state',
                    Values: ['available']
                }
            ],
            Owners: ['amazon']
        });

        const result = await this.ec2Client.send(command);
        
        const latestAMI = result.Images
            .sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate))[0];
        // console.log('latestAMI:', latestAMI);
        console.log(`✅ Found latest AMI: ${latestAMI.ImageId} ${latestAMI.Description} (${latestAMI.Name})`);
        return latestAMI.ImageId;
    }

    async createKeyPair() {
        console.log('🔑 Creating temporary key pair...');
        
        const command = new CreateKeyPairCommand({
            KeyName: this.keyPairName,
            KeyType: 'rsa',
            KeyFormat: 'pem'
        });
        
        const result = await this.ec2Client.send(command);
        this.createdResources.keyPairName = this.keyPairName;
        
        // Save private key to file
        fs.writeFileSync(this.privateKeyPath, result.KeyMaterial, { mode: 0o600 });
        
        console.log(`✅ Key pair created: ${this.keyPairName}`);
        return this.keyPairName;
    }

    async createSecurityGroup() {
        console.log('🛡️  Creating security group...');
        
        // Get default VPC
        const vpcCommand = new DescribeVpcsCommand({
            Filters: [{ Name: 'isDefault', Values: ['true'] }]
        });
        
        const vpcs = await this.ec2Client.send(vpcCommand);
        const defaultVpcId = vpcs.Vpcs[0]?.VpcId;
        
        if (!defaultVpcId) {
            throw new Error('No default VPC found. Please ensure you have a default VPC in your region.');
        }
        
        // Create security group
        const sgCommand = new CreateSecurityGroupCommand({
            GroupName: this.securityGroupName,
            Description: 'Temporary security group for EC2 AMI builder',
            VpcId: defaultVpcId
        });
        
        const sgResult = await this.ec2Client.send(sgCommand);
        const securityGroupId = sgResult.GroupId;
        this.createdResources.securityGroupId = securityGroupId;
        
        // Add inbound rules (SSH)
        const ingressCommand = new AuthorizeSecurityGroupIngressCommand({
            GroupId: securityGroupId,
            IpPermissions: [
                {
                    IpProtocol: 'tcp',
                    FromPort: 22,
                    ToPort: 22,
                    IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH access' }]
                }
            ]
        });
        
        await this.ec2Client.send(ingressCommand);
        
        // Remove default egress rule
        const revokeEgressCommand = new RevokeSecurityGroupEgressCommand({
            GroupId: securityGroupId,
            IpPermissions: [
                {
                    IpProtocol: '-1',
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }
            ]
        });
        
        await this.ec2Client.send(revokeEgressCommand);
        
        // Add specific outbound rules
        const egressCommand = new AuthorizeSecurityGroupEgressCommand({
            GroupId: securityGroupId,
            IpPermissions: [
                {
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' }]
                },
                {
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTP outbound' }]
                },
                {
                    IpProtocol: 'udp',
                    FromPort: 53,
                    ToPort: 53,
                    IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'DNS outbound' }]
                },
                {
                    IpProtocol: 'udp',
                    FromPort: 123,
                    ToPort: 123,
                    IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'NTP outbound' }]
                }
            ]
        });
        
        await this.ec2Client.send(egressCommand);
        
        console.log(`✅ Security group created: ${securityGroupId}`);
        return securityGroupId;
    }

    async createIAMRole() {
        console.log('👤 Creating IAM role for S3 access...');
        
        // Trust policy for EC2
        const trustPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Service: 'ec2.amazonaws.com' },
                    Action: 'sts:AssumeRole'
                }
            ]
        };
        
        // Create IAM role
        const createRoleCommand = new CreateRoleCommand({
            RoleName: this.iamRoleName,
            AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
            Description: 'Temporary role for EC2 AMI builder to access S3'
        });
        
        await this.iamClient.send(createRoleCommand);
        this.createdResources.iamRoleName = this.iamRoleName;
        
        // S3 access policy
        const s3Policy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:GetObjectVersion'
                    ],
                    Resource: '*'
                }
            ]
        };
        
        // Attach inline policy
        const putPolicyCommand = new PutRolePolicyCommand({
            RoleName: this.iamRoleName,
            PolicyName: 'S3AccessPolicy',
            PolicyDocument: JSON.stringify(s3Policy)
        });
        
        await this.iamClient.send(putPolicyCommand);
        
        // Create instance profile
        const createProfileCommand = new CreateInstanceProfileCommand({
            InstanceProfileName: this.instanceProfileName
        });
        
        await this.iamClient.send(createProfileCommand);
        this.createdResources.instanceProfileName = this.instanceProfileName;
        
        // Add role to instance profile
        const addRoleCommand = new AddRoleToInstanceProfileCommand({
            InstanceProfileName: this.instanceProfileName,
            RoleName: this.iamRoleName
        });
        
        await this.iamClient.send(addRoleCommand);
        
        // Wait for IAM propagation
        console.log('⏳ Waiting for IAM role propagation...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log(`✅ IAM role created: ${this.iamRoleName}`);
        return this.instanceProfileName;
    }

    async launchInstance() {
        console.log('🚀 Launching EC2 instance...');
        
        const amiId = await this.getLatestAmazonLinuxAMI();
        const keyPairName = await this.createKeyPair();
        const securityGroupId = await this.createSecurityGroup();
        const instanceProfileName = await this.createIAMRole();
        
        const command = new RunInstancesCommand({
            ImageId: amiId,
            InstanceType: this.instanceType,
            KeyName: keyPairName,
            SecurityGroupIds: [securityGroupId],
            IamInstanceProfile: {
                Name: instanceProfileName
            },
            MinCount: 1,
            MaxCount: 1,
            BlockDeviceMappings: [
                {
                    DeviceName: '/dev/xvda', // Root device for Amazon Linux
                    Ebs: {
                        VolumeSize: 20, // Increase from default 8GB to 20GB
                        VolumeType: 'gp3',
                        DeleteOnTermination: true
                    }
                }
            ],
            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        { Key: 'Name', Value: `AMI-Builder-${this.timestamp}` },
                        { Key: 'Purpose', Value: 'Temporary AMI Builder' }
                    ]
                }
            ]
        });

        const result = await this.ec2Client.send(command);
        this.createdResources.instanceId = result.Instances[0].InstanceId;
        
        console.log(`✅ Instance launched: ${this.createdResources.instanceId}`);
        
        await this.waitForInstanceRunning();
        await this.getInstancePublicIP();
        
        console.log(`🌐 Instance public IP: ${this.publicIp}`);
    }

    async waitForInstanceRunning() {
        console.log('⏳ Waiting for instance to be running...');
        
        await waitUntilInstanceRunning(
            { client: this.ec2Client, maxWaitTime: 300 },
            { InstanceIds: [this.createdResources.instanceId] }
        );
        
        console.log('✅ Instance is running');
        
        // Wait for SSH service to be ready
        console.log('⏳ Waiting for SSH service to be ready...');
        await new Promise(resolve => setTimeout(resolve, 60000));
    }

    async getInstancePublicIP() {
        const command = new DescribeInstancesCommand({
            InstanceIds: [this.createdResources.instanceId]
        });
        
        const result = await this.ec2Client.send(command);
        this.publicIp = result.Reservations[0].Instances[0].PublicIpAddress;
    }

    async connectSSH() {
        return new Promise((resolve, reject) => {
            console.log('🔑 Connecting to instance via SSH...');
            
            this.sshConnection = new Client();
            
            this.sshConnection.on('ready', () => {
                console.log('✅ SSH connection established');
                resolve();
            });
            
            this.sshConnection.on('error', (err) => {
                console.error('❌ SSH connection error:', err.message);
                reject(err);
            });
            
            this.sshConnection.connect({
                host: this.publicIp,
                username: 'ec2-user',
                privateKey: fs.readFileSync(this.privateKeyPath),
                readyTimeout: 60000
            });
        });
    }

    async executeCommand(command, description) {
        return new Promise((resolve, reject) => {
            console.log(`\n🔧 ${description}...`);
            console.log(`📝 Command: ${command}`);
            console.log('📤 Output:');
            console.log('─'.repeat(50));
            
            this.sshConnection.exec(command, (err, stream) => {
                if (err) {
                    console.error(`❌ Error executing command: ${err.message}`);
                    reject(err);
                    return;
                }
                
                let output = '';
                let errorOutput = '';
                
                stream.on('close', (code) => {
                    console.log('─'.repeat(50));
                    if (code === 0) {
                        console.log(`✅ ${description} completed successfully (exit code: ${code})\n`);
                        resolve(output);
                    } else {
                        console.log(`❌ ${description} failed with exit code ${code}\n`);
                        if (errorOutput.trim()) {
                            console.error('🚨 Error details:');
                            console.error(errorOutput);
                        }
                        reject(new Error(`Command failed with exit code ${code}`));
                    }
                });
                
                stream.on('data', (data) => {
                    const text = data.toString();
                    output += text;
                    process.stdout.write(text);
                });
                
                stream.stderr.on('data', (data) => {
                    const text = data.toString();
                    errorOutput += text;
                    // Print stderr in red color if possible
                    process.stderr.write(`\x1b[31m${text}\x1b[0m`);
                });
            });
        });
    }

    async setupSystem() {
        console.log('🔧 Setting up system packages...');
        
        // Execute all setup commands from the array
        for (const [description, command] of SETUP_COMMANDS) {
            await this.executeCommand(command, description);
        }
        
        console.log('✅ System setup completed');
    }

    async downloadAndSetupApp() {
        console.log('📦 Setting up Node.js application...');
        
        // Application setup commands (dynamic based on S3 URL)
        const appCommands = [
            ['Downloading Node.js app package from S3', `aws s3 cp "${this.s3PackageUrl}" ./app-package.zip`],
            ['Extracting application package', 'sudo unzip -o app-package.zip -d /app >/dev/null'],
            ['Cleaning up package archive', 'sudo rm -f app-package.zip'],
            ['Directory files', 'ls -A /app'],
            ['Showing application structure', 'find /app -maxdepth 2 -name "node_modules" -prune -o -print']
        ];
        
        // Execute all app setup commands
        for (const [description, command] of appCommands) {
            await this.executeCommand(command, description);
        }
        
        console.log('✅ Application setup completed');
    }

    async createAMI() {
        console.log('📸 Creating AMI from instance...');
        
        // Cleanup commands before AMI creation
        const cleanupCommands = [
            ['Cleaning up instance before AMI creation', 'sudo dnf clean all && sudo rm -rf /tmp/* /var/tmp/* /var/log/messages* /var/log/secure* ~/.bash_history'],
            ['Checking disk usage', 'df -h && du -sh .']
        ];
        
        // Execute cleanup commands
        for (const [description, command] of cleanupCommands) {
            await this.executeCommand(command, description);
        }
        
        // Close SSH connection
        if (this.sshConnection) {
            this.sshConnection.end();
            this.sshConnection = null;
        }
        
        // Stop the instance
        console.log('🛑 Stopping instance before AMI creation...');
        const stopCommand = new StopInstancesCommand({
            InstanceIds: [this.createdResources.instanceId]
        });
        
        await this.ec2Client.send(stopCommand);
        
        await waitUntilInstanceStopped(
            { client: this.ec2Client, maxWaitTime: 300 },
            { InstanceIds: [this.createdResources.instanceId] }
        );
        
        console.log('✅ Instance stopped');
        
        // Create AMI
        const createImageCommand = new CreateImageCommand({
            InstanceId: this.createdResources.instanceId,
            Name: this.amiName,
            Description: `AMI with Node.js application - Created ${new Date().toISOString()}`,
            NoReboot: true
        });
        
        const result = await this.ec2Client.send(createImageCommand);
        const amiId = result.ImageId;
        
        console.log(`✅ AMI creation started: ${amiId}`);
        console.log('⏳ Waiting for AMI to be available (this may take several minutes)...');
        
        await waitUntilImageAvailable(
            { client: this.ec2Client, maxWaitTime: 1800 },
            { ImageIds: [amiId] }
        );
        
        console.log(`🎉 AMI created successfully: ${amiId}`);
        return amiId;
    }

    async cleanup() {
        console.log('🧹 Cleaning up temporary resources...');
        
        // Close SSH connection
        if (this.sshConnection) {
            this.sshConnection.end();
        }
        
        // Delete private key file
        if (fs.existsSync(this.privateKeyPath)) {
            fs.unlinkSync(this.privateKeyPath);
        }
        
        try {
            // Terminate instance
            if (this.createdResources.instanceId) {
                console.log('🗑️  Terminating instance...');
                const terminateCommand = new TerminateInstancesCommand({
                    InstanceIds: [this.createdResources.instanceId]
                });
                
                await this.ec2Client.send(terminateCommand);
                
                await waitUntilInstanceTerminated(
                    { client: this.ec2Client, maxWaitTime: 300 },
                    { InstanceIds: [this.createdResources.instanceId] }
                );
            }
            
            // Delete security group
            if (this.createdResources.securityGroupId) {
                console.log('🗑️  Deleting security group...');
                const deleteSecurityGroupCommand = new DeleteSecurityGroupCommand({
                    GroupId: this.createdResources.securityGroupId
                });
                
                await this.ec2Client.send(deleteSecurityGroupCommand);
            }
            
            // Delete key pair
            if (this.createdResources.keyPairName) {
                console.log('🗑️  Deleting key pair...');
                const deleteKeyPairCommand = new DeleteKeyPairCommand({
                    KeyName: this.createdResources.keyPairName
                });
                
                await this.ec2Client.send(deleteKeyPairCommand);
            }
            
            // Clean up IAM resources
            if (this.createdResources.instanceProfileName && this.createdResources.iamRoleName) {
                console.log('🗑️  Cleaning up IAM resources...');
                
                // Remove role from instance profile
                const removeRoleCommand = new RemoveRoleFromInstanceProfileCommand({
                    InstanceProfileName: this.createdResources.instanceProfileName,
                    RoleName: this.createdResources.iamRoleName
                });
                
                await this.iamClient.send(removeRoleCommand);
                
                // Delete instance profile
                const deleteProfileCommand = new DeleteInstanceProfileCommand({
                    InstanceProfileName: this.createdResources.instanceProfileName
                });
                
                await this.iamClient.send(deleteProfileCommand);
                
                // Delete role policy
                const deletePolicyCommand = new DeleteRolePolicyCommand({
                    RoleName: this.createdResources.iamRoleName,
                    PolicyName: 'S3AccessPolicy'
                });
                
                await this.iamClient.send(deletePolicyCommand);
                
                // Delete role
                const deleteRoleCommand = new DeleteRoleCommand({
                    RoleName: this.createdResources.iamRoleName
                });
                
                await this.iamClient.send(deleteRoleCommand);
            }
            
            console.log('✅ Cleanup completed');
            
        } catch (error) {
            console.warn('⚠️  Some cleanup operations failed:', error.message);
        }
    }

    async build() {
        console.log('Starting SSH AMI Build Process...');
        const start = Date.now();
        try {
            await this.launchInstance();
            await this.connectSSH();
            await this.setupSystem();
            await this.downloadAndSetupApp();
            console.log('Build complete after', Math.ceil((Date.now() - start)/1000/60));
            const amiId = await this.createAMI();
            console.log('AMI Created after', Math.ceil((Date.now() - start)/1000/60));
            console.log(`📋 Summary:`);
            console.log(`   - AMI ID: ${amiId}`);
            console.log(`   - AMI Name: ${this.amiName}`);
            console.log(`   - Instance Type Used: ${this.instanceType}`);
            console.log(`   - S3 Package: ${this.s3PackageUrl}`);

            return amiId;
            
        } catch (error) {
            console.error('❌ AMI Build failed:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

async function sshAMI(amiName,s3PackageUrl,instanceType){
    const builder = new EC2AMIBuilder(amiName, instanceType, s3PackageUrl);
    const result = await builder.build();
    console.log('AMI ID:', result);
    return result;
}


// Convenience function for direct usage
module.exports.buildAMI = sshAMI;

sshAMI('test-ami-2', 's3://coreinfra-infrabucket-qtfrahre6vbl/apps/theorim/3.6/app.zip')

// // CLI usage if called directly
// if (require.main === module) {
//     const [,, amiName, instanceType, s3PackageUrl] = process.argv;
    
//     if (!amiName || !s3PackageUrl) {
//         console.error('Usage: node ec2-ami-builder.js <amiName> [instanceType] <s3PackageUrl>');
//         console.error('Example: node ec2-ami-builder.js "my-app-ami" "t3.micro" "s3://mybucket/myapp.zip"');
//         process.exit(1);
//     }
    
//     module.exports.buildAMI(amiName, instanceType || 't3.micro', s3PackageUrl)
//         .then(amiId => {
//             console.log(`\n🚀 Your new AMI is ready: ${amiId}`);
//             process.exit(0);
//         })
//         .catch(error => {
//             console.error('\n💥 Build failed:', error.message);
//             process.exit(1);
//         });
// }