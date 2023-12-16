@REM node main.js init-org -name orgTheorem -region us-west-2
@REM node main.js list-apps
@REM node main.js new-app -name meantto -type asg
@REM node main.js new-instance -app meantto -domain meantto.elmnts.xyz -region us-east-1
@REM node main.js update-app -app meantto -v 1.0 -path ./commands/starters/asg_node
@REM node main.js isvalid -p ./commands/helpers/stacks/asg.yaml
node main.js update-stack -app meantto -v 1.0 -stack ./commands/helpers/stacks/asg.yaml
node main.js launch -app meantto -v 1.0 -domain meantto.elmnts.xyz
@REM node main.js inspect -app meantto -domain meantto.elmnts.xyz
@REM node main.js reset-stack -app meantto
@REM node main.js delete-instance -app aaa -domain aaa.elmnts.xyz
@REM node main.js delete-app -app aaa

@REM node main.js starter -type asg -l node -p ../../myfirstapp
