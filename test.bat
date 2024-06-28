@REM node main.js init-org -name Theorim -region us-east-1 -repo "Theorim-ai/theorim"
node main.js update-org -name Theorim -region us-east-1 -repo "Theorim-ai/theorim"
@REM node main.js list-apps
@REM node main.js new-app -name theorim -type asg
@REM node main.js new-instance -app theorim -domain dev.elmnts.xyz -region us-east-1 -admin admin@theorim.ai -env local
@REM node main.js update-app -app theorim -v 1.0 -path ../../../../desktop/theorim/repos/theorim/src
@REM node main.js get-stack -app theorim -v 1.0 -out ../../../../desktop/theorim/repos/theorim
@REM node main.js update-stack -app theorim -v 1.0 -stack ../../../../desktop/theorim/repos/theorim/stack.yaml
@REM node main.js launch -app theorim -v 1.0 -domain dev.elmnts.xyz
@REM node main.js inspect -app ot -domain local.elmnts.xyz -run
@REM node main.js isvalid -p ./commands/helpers/stacks/asg.yaml

@REM node main.js reset-stack -app meantto
@REM node main.js delete-instance -app ot -domain ot.elmnts.xyz
@REM node main.js delete-app -app inc
@REM aws ec2 get-console-output --instance-id i-0fba7c360fc2de96f --region us-west-2 --latest

@REM node main.js starter -type asg -l node -p ../../myfirstapp
