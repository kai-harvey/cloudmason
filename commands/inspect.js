// Import necessary AWS SDK clients and commands
const { CloudFormationClient, DescribeStacksCommand, ListStackResourcesCommand } = require("@aws-sdk/client-cloudformation");
const { AutoScalingClient, DescribeAutoScalingGroupsCommand } = require("@aws-sdk/client-auto-scaling");
const { EC2Client, GetConsoleOutputCommand } = require("@aws-sdk/client-ec2");

const Params = require('./helpers/params');

exports.main = async function(args){
    console.log(`Inspecting ${args.app} instance ${args.domain}`);
    // Get App
    const app = await Params.getApp(args.app);
    if (!app){ console.log('Err: No app named ' + args.app); return false;}
    const instance = app.instances.find(ins=>{ return ins.domain.toLowerCase() == args.domain.toLowerCase() });
    if (!instance){ console.log(`No instance of ${args.app} named ${args.domain}`); throw new Error('Invalid Instance')}
    
    // Check Stack
    const stackStatus = await cfStatus(instance.stackName, instance.region);
    console.log("STACK STATUS:", stackStatus.status);
    if (stackStatus.ok === null){
        return
    } else if (stackStatus.ok === false){
        console.log("\tSTACK FAILURE REASON:", stackStatus.failureReason);
        return
    }

    const asgId = await getAutoScalingGroupId(instance.stackName,instance.region);
    console.log("Auto Scaling Group ID:", asgId);

    const consoleOutputs = await getEc2ConsoleOutput(asgId,instance.region);
    console.log("================= EC2 Console Outputs =================");
    consoleOutputs.forEach(output => {
        console.log("---- EC2 ID:", output.instanceId, "----");
        console.log( output.output );
        console.log('------------------------------------')
    });
    return
}

// Stack Status
async function cfStatus(stackName, region) {
    const client = new CloudFormationClient({ region }); // Replace with your region

    try {
        const command = new DescribeStacksCommand({ StackName: stackName });
        const response = await client.send(command);

        if (response.Stacks && response.Stacks.length > 0) {
            const stack = response.Stacks[0];
            const status = stack.StackStatus;
            
            // Check if status indicates failure
            if (status.includes("FAIL") || status === "ROLLBACK_COMPLETE" || status === "DELETE_FAILED") {
                return {
                    status: status,
                    ok: false,
                    failureReason: stack.StackStatusReason
                };
            } else if (status.includes("CREATE_IN_PROGRESS")){
                return {
                    status: status,
                    ok: null
                };
            } else {
                return {
                    status: status,
                    ok: true
                };
            }
        } else {
            throw new Error("No stack found with the specified name.");
        }
    } catch (error) {
        console.error("Error fetching CloudFormation stack status:", error);
        throw error;
    }
}

// ASG ID
async function getAutoScalingGroupId(stackName,region) {
    const client = new CloudFormationClient({ region }); // specify your region

    try {
        const command = new ListStackResourcesCommand({ StackName: stackName });
        const response = await client.send(command);

        // Filter the results to find the Auto Scaling group
        const asgResource = response.StackResourceSummaries.find(resource => resource.ResourceType === "AWS::AutoScaling::AutoScalingGroup");
        
        if (asgResource) {
            return asgResource.PhysicalResourceId;
        } else {
            throw new Error("Auto Scaling Group not found in the specified stack.");
        }
    } catch (error) {
        console.error("Error fetching Auto Scaling Group ID:", error);
        throw error;
    }
}

// EC2 Console Output
async function getEc2ConsoleOutput(autoScalingGroupName, region) {
    const autoScalingClient = new AutoScalingClient({ region }); // specify your region
    const ec2Client = new EC2Client({ region });

    try {
        // Get instance IDs from Auto Scaling group
        const describeGroupsCommand = new DescribeAutoScalingGroupsCommand({
            AutoScalingGroupNames: [autoScalingGroupName]
        });
        const groupResponse = await autoScalingClient.send(describeGroupsCommand);
        const instances = groupResponse.AutoScalingGroups[0].Instances;
        const instanceIds = instances.map(instance => instance.InstanceId);

        // Get console output for each instance
        const consoleOutput = [];
        
        for (let i=0;i<instanceIds.length;i++){
            const consoleOutputCommand = new GetConsoleOutputCommand({ InstanceId: instanceIds[i] });
            const outputResponse = await ec2Client.send(consoleOutputCommand);
            consoleOutput.push({
                instanceId: instanceIds[i],
                output: Buffer.from(outputResponse.Output, "base64").toString("ascii")
            });
        }
        return consoleOutput;
    } catch (error) {
        console.error("Error fetching EC2 console outputs:", error);
        throw error;
    }
}
