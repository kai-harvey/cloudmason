Set up an AWS organization from scratch and deploy a static site or AMI-based EC2 application in just 4 commands.

The tool will handle everything from obtaining ACM certificates to building AMIs and deploying cloudformation stacks.

Can be used as a command line tool, or in a CI/CD pipeline.


# Quick Start

Get an Ec2 nodejs app up and running in 4 commands.

#### Step 1: Prereqs:

1. Open an AWS account
2. Download and set up the AWS CLI (or just set your AWS credentials with enviroment variables)
3. Buy a domain to deploy apps to
4. Run the following command to set up your org:
   1. `init-org -name MyOrg -region us-east-1`

#### Step 2: Set up an App

Run the command below to get a starter nodejs template

```
mason starter -p ./myDesktop/HelloWorld -type asg
```

#### Step 3: Add an App

```
mason new-app -name MyFirstApp -type asg
new-instance -app MyFirstApp -domain myfirstapp.com -region us-east-2 -admin me@gmail.com
update-app -app MyFirstApp -v 1.0 -path ./myDesktop/HelloWorld
list-apps
```
You now have an AMI and Cloudformation stack primed and ready to go. 

#### Step 4: Launch it

```
launch -app MyFirstApp -v 1.0 -domain myfirstapp.com
inspect -app MyFirstApp -domain myfirstapp.com -boot
```

The `launch` command deploy the specified version of your application to the specified domain (instance). 

It takes time to launch the app, so the `inspect` command will return the status of the cloudformation deployment. It will also return the console output from the boot script (aka User Data) when the first instance starts up.


# IMPORTANT!!!

- THIS APP DEPLOYS EC2 INSTANCES THAT ARE NOT FREE! IT WILL RESULT IN AWS CHARGES!
- Make sure to run `delete-instance` when you're done to avoid major surprises
- Your web application must serve on localhost:8080
- Use `inspect` ! It will return all console output of your application - very useful for debugging


# Architectures

### AMI-Based Autoscaling Group Web App

To do

### Cloudfront and S3 Static Site

To do




# Commands

Run `mason [command] -<options>`

| Command      | Description                     |
| ---------------------------- | ------------------------------ |
| [init-org](###init-org)                 | Set up a new organization                           |
| [set-org](###set-org)                   | Set default org to an existing org                  |
| [new-app](###new-app)                   | Create a new application                            |
| [new-instance](###new-instance)         | Create a new instance of an application             |
| [update-app](###update-app)             | Update the code and/or stack of an app version      |
| [launch](###launch)                     | Deploy an app version to an instance                |
| [inspect](###inspect)                   | Get cloudformation stack status and boot logs for an instance |
| [starter](###starter)                   | Get a starter template for a specified architecture type      |
| [delete-instance](###delete-instance)   | Delete an instance                                  |
| [delete-app](###delete-app)             | Delete an app                                       |
| [update-stack](###update-stack)         | Update cloudformation stac                          |
| [list-apps](###list-apps)               | List all apps                                       |
| [isvalid](###isvalid)                   | Check if a cloudformation template is valid         |
| [zip](###zip)                           | Zip a folder                                        |



### init-org


`mason init-org -name -domain -region `

Sets up base infrastructure in a new AWS organization. This command should only be run once. To set up the tool with an existing org, use set-org.

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **name**           |   Y          |  String               |  Unique org Name. Letters only, no spaces   |
| **domain**      | Y | Valid domain | A base domain to use for core resources (e.g., cmason.io) |
| **region** | Y | AWS Region | Default AWS region for core resources (e.g., us-east-1) |


#### What it does

1. Retrieves the default VPC ID
2. Deploys a basic org infra stack
      1. S3 Bucket + policies for infra resources at `infra.[domain]`
      2. IAM Role, Instance Profile, and Security Group for Ec2 build agent
      3. SSM Parameters for oprg name, domain, instance profile, and security group




### new-app

`mason new-app -name -type -node -py`

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **name** | Y | String | Application name. Letters only |
| **type** | Y | Application Type | (Application architecture)[##Architectures]. See below for options. |
| node | n | Number | Version of nodejs to install on the base AMI. If set, app will run using nodejs |
| py | n | Number | Version of python to install on the base AMI. If set, app will run using python |


**Architecture Options**

- asg: autoscaling group 
- static: static site

#### Examples

```
mason new-app -name MyFirstApp -type asg -node
```

#### What it does

1. Builds a cloudformation stack with the appropriate boot script for nodejs or python
2. Uploads the cloudformation template to the S3 infrastructure bucket
3. Records the app name, type, and other key detail in SSM params




### new-instance

`mason new-instance -app -name -domain -region -admin`

Creates a new instance in a specified region. An instance is a deployment of an application. For example, MyFirstApp could have a test, UAT, and prod instance in us-east-1,us-east-2,and us-west-1.

Use -admin to specify the first admin user who will have access to set up other users.

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **app** | Y | string | Name of existing application |
| **name** | Y | string | Instance name (ex., test, uat, etc). Letters only |
| **domain** | Y | string | Name of a subdomain or domain to deploy behind |
| **region** | Y | AWS region | region to deploy the instance in |
| **admin** | Y | email | email adress of first admin user |

#### Examples

```
mason new-app -name MyFirstApp -type asg -node
mason new-instance -app MyFirstApp -name uat -domain test.cmason.io -region us-east-2
mason new-instance -app MyFirstApp -name beta -domain beta.cmason.io -region us-west-1
```


#### What it does

1. Requests an ACM certificate for the domain if none exists (for HTTPS)
2. Gets the default VPC ID and Subnets for the target region
3. Saves deployment params to SSM for use when deploying the cloud formation template:
      1. ACM Certificate ID
      2. VPC Id
      3. Subnets and hosted zone ID



### update-app

`mason update -app -v -path`

Updates the code for the specified application. This command will build a new AMI and update cloudformation stacks to point to the new AMI.
Path must lead to the root folder of your application. The bootscript will run with that directory as the root.

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **app** | Y | string | Name of the existing app to update |
| **v** | Y | number | Version number to update |
| **path** | Y | Path to a folder or zip file containing the updated app code |


#### Examples

```
mason update -app MyFirstApp -v 1.1 -path ./myfirstapp/src -stack ./myfirstapp/stack.json
```

#### What it does

1. Zips the folder (if not already zipped)
2. Updates the cloudformation stack.yml file and uploads to S3
3. Identifies the appropriate AWS Linux AMI ID for the base region
4. Launches an EC2 instance, waits until it's ready, and then builds an AMI with the updated code package
5. Terminates the EC2 instance
6. Updates SSM with the updated AMI ID and build number




### launch

`mason launch -app -v -i`

Launches a specific version of an application to an instance. For example, launch (deploy) MyFirstApp version 1.2 to test.cmason.io.


#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **app** | Y | string | Name of existing application to launch |
| **v** | Y | number | Version of the app to launch |
| **i** | Y | string | Name of the instance to deploy to | 


#### Examples

```
mason new-instance -app MyFirstApp -name uat -domain test.cmason.io -region us-east-2
mason update -app MyFirstApp -v 1.1 -path ./myfirstapp/src -stack ./myfirstapp/stack.jso
mason launch -app MyFirstApp -v 1.1 -i uat
```


#### What it does

1. Copies the AMI version created in the `update` command to the instance region
2. Deploys the updated cloudformation stack



### update-stack

`mason update-stack -app -v -default -stack`

Updates the default cloudformation template, or updates the template for a specific version.

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **app** | Y | string | Name of the app to update  |
| **stack**  | Y | path | File path to updated cloudformation template | 
| -v | N | number | Version number to update. Leave blank to update the default template |
| -default | flag | Include this flag to update the default cloudformation template for the app |


#### Examples

Update version 5 with a new stack

```
mason update-stack -app MyFirstApp -v 1.0 -stack ../myfirstapp/stack.json
```

Update the default cloduformation template for all future versions

```
mason update-stack -app MyFirstApp -default -stack ../myfirstapp/stack.json
```

#### What it does

1. Uploads the specified stack file to S3



### inspect

`mason inspect -app -domain [-run or -boot]`

Get stack status and EC2 console logs for an instance.
Useful for debugging issues with application boot up. Console output will 

To get run logs, the application must write logs to S3 in the logs/run folder. See the starter nodejs app for an example. 

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **-app** | Y | string | App name |
| **-domain** | Y | string | Domain to inspect | 
| -boot | N | null | If included, returns logs from the instance start up | 
| -run | N | null | If included, returns run logs stored by the application in the s3 bucket at logs/run/* | 

#### Examples

```
mason inspect -app MyFirstApp -domain myfirstapp.com
```


### starter

`mason starter -type -l -path`

Sets up a starter application template for the specified architecture and language

#### Params

|   Parameter    | Required     |  Type                 | Description                   |
| -------------- | ------------ | ----------------      | ----------------------------  |
| **-type** | Y | string | Architecture of the application (asg, static, etc) |
| **-p** | Y | string | Path to output the project to |
| -l | Y | string | Language. py or node | 

#### Examples

```
mason starter -type asg -l node -path ../myfirstapp
```





## TODO

- [x] Run logs 
- [x] Read token
- [x] Verify token
- [] Get user groups
- [] Deregistering in home region
- [] DDB connect
- [] Add arguments for max ec2 instance and instance type
- [] Figure out why cf-templates s3 bucket is being created
- [] Customize boot script
- [] Pass node/py versions
- [] Pass version info to instance
- [] Add dev
- [] Cloudtrails
- [] Prebuild AMI
- [] Static site


