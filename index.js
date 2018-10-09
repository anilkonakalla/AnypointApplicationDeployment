// tfx extension create --manifest-globs vss-extension.json
var cloudhubService = require('./cloudhub-service-v2.js'),
    errorHandler = require('./error-handler.js'),
    FormData = require('form-data'),
    fs = require('fs'),
    path = require('path'),
    task = require('vsts-task-lib/task');

task._writeLine('Getting configuration...');
var config = getConfiguration();
var orgIdFlag = false;
var orgID = '';
task._writeLine('Authenticating credentials with AnyPoint Platform...');
cloudhubService.getBearerTokenAndSetBasicAuth(config.username, config.password).then(tokenResponse => {
    task._writeLine('Authentcation Successful!');
    var bearerToken = tokenResponse.access_token;
    cloudhubService.setBearerToken(bearerToken);
    task._writeLine('Getting organization info...');
    return cloudhubService.getAccounts();

})
.then(function(accountResponse) {
    task._writeLine('Organization found!');
    orgID = accountResponse.user.organization.id;
    var userOrg = accountResponse.user.organization;
    task._writeLine('Setting organization to ' + userOrg.name + ' with ID of ' + userOrg.id);
    task._writeLine('Getting list of environments...');
    return cloudhubService.getEnvironments(userOrg.id);
})
.then(function(environmentsResponse) {
    task._writeLine('Finding specified environment...');
    var environmentId = getSpecifiedEnvironmentId(environmentsResponse.data, config.environmentname);
    cloudhubService.setEnvironmentId(environmentId);

    task._writeLine('Getting application status for ' + config.domainname);
    orgIdFlag = true;
    return cloudhubService.getOnPremApplications(orgID,orgIdFlag);
})

.then(function(appStatus) {
var applications = appStatus.data;
var appExist = false;
for(var i = 0; i < applications.length; i++){
    if(config.domainname == applications[i].name){
        appExist = true;
        var appId = applications[i].id;
    }  
}

    if(appExist){
        task._writeLine('Application found!');
        task._writeLine('Redeploying...');
        console.log("App ID: " + appId);
        return cloudhubService.deployOnpremApp(config.domainname, config.zipfilepath, appId);
    }else{
                task._writeLine('Application not found!');
        task._writeLine('Creating new application...'); 
task._writeLine('Getting Target Id for ' + config.target);
    return cloudhubService.getTargetId(config.targettype).then(function(localTargetID){
        var targets = localTargetID.data;
        for(var i = 0; i < targets.length; i++){
            if(config.target == targets[i].name){
                appExist = true;
                var targetId = targets[i].id;
            }  
        }
        
        return cloudhubService.createNewOnpremApp(config.domainname, config.zipfilepath, targetId);
    });
}

    

})
.then(function(deployResponse) {    
        getStatus(deployResponse.data.id);
})
.catch(function(error){
    console.log('GLOBAL ERROR HANDLER');
    var errorMessage = '';
    if (error.statusCode) {
        errorMessage = error.statusCode + ' - ' + error.statusMessage;
    }
    else
        errorMessage = error;
    task.setResult(task.TaskResult.Failed, errorMessage);
})

function getSpecifiedEnvironmentId(environments, environmentNameToFind) {
    var specifiedEnvName = environmentNameToFind.toLowerCase();
    for (var i = 0; i < environments.length; i++) {
        var environment = environments[i];
        task._writeLine('Environment found: ' + environment.name);
        if (environment.name.toLowerCase() == specifiedEnvName) {
            return environment.id;
        }
    }
    task.setResult(task.TaskResult.Failed, 'Could not find any environment matching ' + environmentNameToFind);
    // TODO: Throw error here - no matching environment found
}

// * * * APPLICATION STATUS * * * //

function getStatus(domainName) {
    // "STARTED", "DEPLOYING", "UNDEPLOYED", "DEPLOYED_FAILED"
    // Make request every 5 seconds
    var start = Date.now();
    var timeoutLength = parseFloat(config.timeout) * 60;
    
    var statusInterval = setInterval(function() {
        orgIdFlag = true;
        cloudhubService.getApplication(domainName,orgIdFlag).then(function(statusResponse) {
            if (!statusResponse) {
                clearInterval(statusInterval);
                task.setResult(task.TaskResult.Failed, 'Could no longer find application');
            }
            var deployStatus = statusResponse.data.lastReportedStatus;
            if (deployStatus == "DEPLOYING") {
                // App is still deploying, object does not exist after deployment
                task._writeLine('CURRENT STATUS: ' + deployStatus);
            }
            else {
                var status = statusResponse.data.lastReportedStatus.toString();
                task._writeLine('CURRENT STATUS: ' + status);
                if (status == 'UNDEPLOYED') {}
                else if (status == 'STARTED') {
                    clearInterval(statusInterval);
                    task.setResult(task.TaskResult.Succeeded, 'Application deployed successfully!');
                }
                else if (status == 'DEPLOYMENT_FAILED') {
                    task._writeLine('Application deployment FAILED');
                    clearInterval(statusInterval);
                    task.setResult(task.TaskResult.Failed, 'Application deployment failed. Please ensure file is formatted correctly');
                }
            }
            
            var elapsedTime = (Date.now() - start) / 1000;
            task._writeLine('Elapsed: ' + elapsedTime + '/' + timeoutLength + ' seconds');
            if (elapsedTime > timeoutLength) {
                clearInterval(statusInterval);
                task.setResult(task.TaskResult.Failed, 'Application deployment timed out. Try increasing the timeout.');

            }
        }).catch(errorHandler.getAppError);
      

    }, 10000);
}

// * * * CONFIGURATION * * * //

function getConfiguration() {
    //var passwordVariableName = task.getInput('passwordvariable', true);
    var domainName = task.getInput('domainname', true) || 'bhim-test-1';
    var toReturn = {
        'username': task.getInput('username', true) || 'govardhan_bhimireddy',
        'password': task.getInput('password', true) || 'Straight11',
        'domainname': domainName,
        'environmentname': task.getInput('environmentname', true) || 'VSTSExercises',
        'targettype' : task.getInput('targettype', true) || 'servers',
        'target' : task.getInput('target', true) || 'AZUSE2MULDEV42',
        'zipfilepath': getZipFilePath(),
        'timeout': task.getInput('timeout') || '10',
      
        'workersize': task.getInput('workersize', false),
        'muleversion': task.getInput('muleversion') || '4.1.2',
        'autostart': task.getInput('autostart') || 'true'
    };
    toReturn['appInfo'] = getNewAppInfo(domainName);
    return toReturn;
}

// Micro, Small, Medium, Large, xLarge
function getNewAppInfo(domainName) {
    var newAppInfo = {
        'domain': domainName, 
        'muleVersion': { 'version': task.getInput('workermuleversion') || '3.7.0' },
        'region': task.getInput('workerregion') || 'us-east-1',
        'workers': {
            'amount': task.getInput('workercount') || '1',
            'type': {
                'name': task.getInput('workersize') || 'Medium',
            }
        },
        'properties': getApplicationProperties()
    };
    return newAppInfo;
}

function getApplicationProperties() {
    var toReturn = {};
    // e.g. "prop1:my value, prop2: value 2"
    var properties = task.getInput('properties');
    if (properties) {
        var splitProps = properties.split(',');
        for(var i=0; i<splitProps.length; i++) {
            var prop = splitProps[i];
            var keyValue = prop.split(':');
            if (keyValue.length < 2) {
                task.setResult(task.TaskResult.Failed, 'Property found without any value. Make sure each property has a value and each property is separated by a comma.');
            }
            else {
                toReturn[keyValue[0].trim()] = keyValue[1].trim();
            }
        }
    }
    return toReturn;
}

// * * * DYNAMIC FILE PATH * * * //
function getZipFilePath() {
    var fileName = task.getInput('zipfilename', true);
    var folder = task.getPathInput('zipfiledirectory', true).replace(/\"/g, "");
    task._writeLine('Looking for files in: ' + folder);
    task._writeLine("* * * START Files in File Directory * * *");
    var matchingFilePath = getMatchingZipFileInDirectory(folder, fileName);
    task._writeLine("* * * END Files in File Directory * * *");
    task._writeLine('matchingFile:' + matchingFilePath);
    return matchingFilePath;
}

var isMatchFound = false;
function getMatchingZipFileInDirectory(directoryPath, fileName) {
    var toReturn = "";
    
    if (directoryPath) {
        var files = fs.readdirSync(directoryPath);
        for (var i in files) {
            var currFileName = files[i];
            var currFile =  path.join(directoryPath, currFileName);
            var stat = fs.statSync(currFile);
            if (stat.isFile()) {
                task._writeLine('File Path:' + currFile);
                if (!isMatchFound && isFileMatch(currFileName, fileName)) {
                    task._writeLine('Match Found! Setting file to: ' + currFile);
                    toReturn = currFile;
                    isMatchFound = true;
                }
            }
            if (stat.isDirectory()) {
                task._writeLine('Directory: ' + currFile);
                iterateDirectories(currFile);
            }
        }
    }
    return toReturn;
}

function isFileMatch(fileDetected, filePattern) {
    // ^allegro-1.1*.zip
    var pattern = new RegExp(filePattern.replace("*", "\\S+"));
    if (pattern.test(fileDetected))
        return true;
    return false;
}