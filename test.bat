@REM node main.js init-org -name orgTheorem -region us-west-2
@REM node main.js list-apps
@REM node main.js new-app -name inc -type asg
@REM node main.js new-instance -app inc -domain local.elmnts.xyz -region us-west-2 -admin kaikh611@gmail.com -env local
@REM node main.js update-app -app inc -v 1.0 -path ./commands/starters/asg_node
node main.js launch -app inc -v 1.0 -domain local.elmnts.xyz
@REM node main.js inspect -app meantto -domain test.elmnts.xyz -boot
@REM node main.js isvalid -p ./commands/helpers/stacks/asg.yaml
@REM node main.js update-stack -app inc -v 1.0 -stack ./commands/helpers/stacks/asg.yaml
@REM node main.js reset-stack -app meantto
@REM node main.js delete-instance -app inc -domain local.elmnts.xyz
@REM node main.js delete-app -app meantto
@REM aws ec2 get-console-output --instance-id i-0fba7c360fc2de96f --region us-west-2 --latest

@REM node main.js starter -type asg -l node -p ../../myfirstapp
