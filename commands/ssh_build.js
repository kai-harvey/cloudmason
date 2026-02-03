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


const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

// All SSH setup commands - array of [description, command]
const SETUP_COMMANDS = [
    ['Upgrading to latest AL2023 release', 'sudo dnf upgrade --releasever=latest -y'],
    ['Setting up NodeSource for Node.js 24 LTS', 'curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -'],
    ['Installing nodejs', 'sudo dnf install -y nodejs'],
    ['Node version', 'node --version'],
    ['Installing cloudwatch agent', 'sudo dnf install -y amazon-cloudwatch-agent'],
    ['Installing python', 'sudo dnf -y install python3'],
    ['Installing unzip', 'sudo dnf -y install unzip'],
    ['Installing pm2', 'sudo npm install -g pm2'],
    ['Creating app directory', 'sudo mkdir -p /home/ec2-user/app'],
];


class EC2AMIBuilder {
    constructor(amiName, instanceType = 'm6a.large', localZipPath) {
        if (!amiName || !localZipPath) {
            throw new Error('amiName and localZipPath are required parameters');
        }

        this.amiName = amiName;
        this.instanceType = instanceType;
        this.localZipPath = localZipPath;

        // AWS clients
        const region = process.env.orgRegion || process.env.AWS_REGION || 'us-east-1';
        this.ec2Client = new EC2Client({ region });

        // Generate unique names for temporary resources
        this.timestamp = Date.now();
        this.keyPairName = `ec2-builder-keypair-${this.timestamp}`;
        this.securityGroupName = `ec2-builder-sg-${this.timestamp}`;
        this.privateKeyPath = path.join(__dirname, `${this.keyPairName}.pem`);

        // Resource tracking for cleanup
        this.createdResources = {
            instanceId: null,
            keyPairName: null,
            securityGroupId: null
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

    async launchInstance() {
        console.log('🚀 Launching EC2 instance...');

        const amiId = await this.getLatestAmazonLinuxAMI();
        const keyPairName = await this.createKeyPair();
        const securityGroupId = await this.createSecurityGroup();

        const command = new RunInstancesCommand({
            ImageId: amiId,
            InstanceType: this.instanceType,
            KeyName: keyPairName,
            SecurityGroupIds: [securityGroupId],
            MinCount: 1,
            MaxCount: 1,
            BlockDeviceMappings: [
                {
                    DeviceName: '/dev/xvda', // Root device for Amazon Linux
                    Ebs: {
                        VolumeSize: 40, // Increase from default 8GB to 20GB
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

    async uploadAppViaSFTP() {
        return new Promise((resolve, reject) => {
            console.log('📤 Uploading application via SFTP...');
            console.log(`   Local file: ${this.localZipPath}`);

            this.sshConnection.sftp((err, sftp) => {
                if (err) {
                    console.error('❌ SFTP session error:', err.message);
                    return reject(err);
                }

                const readStream = fs.createReadStream(this.localZipPath);
                const writeStream = sftp.createWriteStream('/tmp/app.zip');

                const fileSize = fs.statSync(this.localZipPath).size;
                let uploaded = 0;

                readStream.on('data', (chunk) => {
                    uploaded += chunk.length;
                    const percent = Math.round((uploaded / fileSize) * 100);
                    process.stdout.write(`\r   Progress: ${percent}% (${Math.round(uploaded / 1024)}KB / ${Math.round(fileSize / 1024)}KB)`);
                });

                writeStream.on('close', () => {
                    console.log('\n✅ SFTP upload completed');
                    resolve();
                });

                writeStream.on('error', (err) => {
                    console.error('\n❌ SFTP write error:', err.message);
                    reject(err);
                });

                readStream.on('error', (err) => {
                    console.error('\n❌ File read error:', err.message);
                    reject(err);
                });

                readStream.pipe(writeStream);
            });
        });
    }

    async uploadAndSetupApp() {
        console.log('📦 Setting up application...');

        // Upload via SFTP
        await this.uploadAppViaSFTP();

        // Application setup commands
        const appCommands = [
            ['Extracting application package', 'sudo unzip -o /tmp/app.zip -d /home/ec2-user/app'],
            ['Setting ownership to ec2-user', 'sudo chown -R ec2-user:ec2-user /home/ec2-user/app'],
            ['Cleaning up package archive', 'rm -f /tmp/app.zip'],
            ['Directory files', 'ls -la /home/ec2-user/app'],
            ['Showing application structure', 'find /home/ec2-user/app -maxdepth 2 -name "node_modules" -prune -o -print']
        ];

        // Execute all app setup commands
        for (const [description, command] of appCommands) {
            await this.executeCommand(command, description);
        }

        console.log('✅ Application setup completed');
    }

    async createAMI() {
        console.log('📸 Creating AMI from instance...');

        // Cleanup commands before AMI creation - remove all sensitive data
        const cleanupCommands = [
            // Remove SSH authorized keys (contains the temporary build key)
            ['Removing SSH authorized keys', 'rm -f ~/.ssh/authorized_keys && sudo rm -f /root/.ssh/authorized_keys'],
            // Remove SSH host keys (new instances will regenerate their own)
            ['Removing SSH host keys', 'sudo rm -f /etc/ssh/ssh_host_*'],
            // Clean cloud-init so it runs fresh on new instances
            ['Cleaning cloud-init data', 'sudo rm -rf /var/lib/cloud/*'],
            // Reset machine-id for unique instance identification
            ['Resetting machine-id', 'sudo truncate -s 0 /etc/machine-id'],
            // Clean bash history for all users
            ['Cleaning bash history', 'rm -f ~/.bash_history && sudo rm -f /root/.bash_history'],
            // Clean logs and temp files
            ['Cleaning logs and temp files', 'sudo rm -rf /tmp/* /var/tmp/* /var/log/messages* /var/log/secure* /var/log/cloud-init*.log'],
            // Clean DNF cache
            ['Cleaning DNF cache', 'sudo dnf clean all'],
            // Verify cleanup and check disk usage
            ['Checking disk usage', 'df -h && du -sh /home/ec2-user/app']
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
            { client: this.ec2Client, maxWaitTime: 3800 },
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
            await this.uploadAndSetupApp();
            console.log('Build complete after', Math.ceil((Date.now() - start)/1000/60), 'minutes');
            const amiId = await this.createAMI();
            console.log('AMI Created after', Math.ceil((Date.now() - start)/1000/60), 'minutes');
            console.log(`📋 Summary:`);
            console.log(`   - AMI ID: ${amiId}`);
            console.log(`   - AMI Name: ${this.amiName}`);
            console.log(`   - Instance Type Used: ${this.instanceType}`);
            console.log(`   - Local Package: ${this.localZipPath}`);

            return amiId;

        } catch (error) {
            console.error('❌ AMI Build failed:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

async function sshAMI(amiName, localZipPath, instanceType){
    const builder = new EC2AMIBuilder(amiName, instanceType, localZipPath);
    const result = await builder.build();
    console.log('AMI ID:', result);
    return result;
}


// Convenience function for direct usage
module.exports.buildAMI = sshAMI;

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