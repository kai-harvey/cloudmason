const { CloudFormationClient,ListStackResourcesCommand, CreateStackCommand,UpdateStackCommand, DeleteStackCommand, ValidateTemplateCommand,DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');

const fs = require('fs');
const path = require('path')


exports.deployOrgStack = async function(region,params){
    // Read Stack
    const stackPath = path.resolve(__dirname,'stacks',`infra.yaml`);
    if (!fs.existsSync(stackPath)){
        console.log('Invalid stack type:' + stackType);
        throw { message: 'Invalid stack type', at: 'deployStack'}
    }
    const stackYML = fs.readFileSync(stackPath,'utf-8');

    // Build Params
    const cfParams = Object.keys(params).map(k=>{ return { ParameterKey: k, ParameterValue: params[k] } })
    
    // Deploy Stack
    const client = new CloudFormationClient({ region });
    const input = {
        StackName: `CoreInfra`,
        TemplateBody: stackYML,
        Capabilities: [
            "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND",
        ],
        Parameters: cfParams,
        Tags: [{ Key: 'purpose', Value: 'infra' }]
    };
    try{
        const result = await client.send(new CreateStackCommand(input));
        return result.StackId;
    } catch (e){
        if (/AlreadyExistsException/.test(e)){
            return false;
        } else {
            throw new Error(e.message)
        }
    }
}

exports.deployS3Stack = async function(stackName,s3Url,params,tag,region){
    // Build Params
    const cfParams = Object.keys(params).map(k=>{ return { ParameterKey: k, ParameterValue: params[k] } })
    const cfTags = Object.keys(tag).map(k=>{ return { Key: k, Value: tag[k] } })

    // Deploy Stack
    const client = new CloudFormationClient({ region });
    const input = {
        StackName: stackName,
        TemplateURL: s3Url,
        OnFailure: 'DELETE',
        Capabilities: [
            "CAPABILITY_IAM" || "CAPABILITY_NAMED_IAM" || "CAPABILITY_AUTO_EXPAND",
        ],
        Parameters: cfParams,
        Tags: cfTags
    };

    const result = await client.send(new CreateStackCommand(input));
    return result.StackId;
}

exports.updateOrgStack = async function(region,params){
    const client = new CloudFormationClient({ region });
    const cfParams = Object.keys(params).map(k=>{ return { ParameterKey: k, ParameterValue: params[k] } })
    
    const stackPath = path.resolve(__dirname,'stacks',`infra.yaml`);
    if (!fs.existsSync(stackPath)){
        console.log('Infra Stack not found');
        throw { message: 'Infra stack not found', at: 'deployStack'}
    }
    const stackYML = fs.readFileSync(stackPath,'utf-8');
    
    const cmd = {
        StackName: 'CoreInfra',
        TemplateBody: stackYML,
        Parameters: cfParams,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"]
    };
    const command = new UpdateStackCommand(cmd);
    const response = await client.send(command);
    return response.StackId;
}

exports.updateStack = async function(stackName,s3Url,params,region){
    const client = new CloudFormationClient({ region });
    const cfParams = Object.keys(params).map(k=>{ return { ParameterKey: k, ParameterValue: params[k] } })
    const cmd = {
        StackName: stackName,
        TemplateURL: s3Url,
        Parameters: cfParams,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"]
    };
    const command = new UpdateStackCommand(cmd);
    const response = await client.send(command);
    return response.StackId;
}

exports.validateStack = async function(stack){
    const client = new CloudFormationClient({ region: process.env.orgRegion });

    const command = new ValidateTemplateCommand({
        TemplateBody: stack,
    });

    try{
        const data = await client.send(command);
        return { ok: true, data: data }
    } catch (e){
        return {ok: false, data: e}
    }
}

exports.stackExists = async function(stackName,region){
    const client = new CloudFormationClient({ region });
    const command = new DescribeStacksCommand({ StackName: stackName });
    try {
        
        const response = await client.send(command);
        return true;
    } catch (error) {
        if (error.name === 'ValidationError') {
            return false;
        }
        throw error;
    }
}

exports.stackStatus = async function(stackName, region) {
    const client = new CloudFormationClient({ region }); // Replace with your region
    try {
        const command = new DescribeStacksCommand({ StackName: stackName });
        const response = await client.send(command);

        if (response.Stacks && response.Stacks.length > 0) {
            const stack = response.Stacks[0];
            const status = stack.StackStatus;
            
            // Check if status indicates failure
            if (status.includes("FAIL") || status === "DELETE_FAILED") {
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

exports.getStackResource = async function(resourceType,stackName,region){
    const res = {
        's3': "AWS::S3::Bucket",
        'asg': "AWS::AutoScaling::AutoScalingGroup",
        'ec2': "AWS::EC2::Instance"
    }[resourceType];
    const client = new CloudFormationClient({ region }); // specify your region

    try {
        const command = new ListStackResourcesCommand({ StackName: stackName });
        const response = await client.send(command);

        // Filter the results to find the Auto Scaling group
        const asgResource = response.StackResourceSummaries.find(resource => resource.ResourceType === res);
        
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

exports.delete = async function(stackName,region){
    const client = new CloudFormationClient({ region });
    try {
        const command = new DeleteStackCommand({ StackName: stackName });
        const response = await client.send(command);
        return true;
    } catch (error) {
        console.error("Error deleting the stack:", error);
        return false;
    }
}