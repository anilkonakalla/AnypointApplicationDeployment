// tfx extension create --manifest-globs vss-extension.json
var cloudhubService = require('./cloudhub-service-v2.js'),
    errorHandler = require('./error-handler.js'),
    FormData = require('form-data'),
    fs = require('fs'),
    path = require('path'),
    task = require('vsts-task-lib/task');

task._writeLine('Getting configuration...');
var config = getConfiguration();
var env_id;
var org_id;
var env_props = {};
var targetEnvId;
var sourceEnvId;


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
    var userOrg = accountResponse.user.organization;
    task._writeLine('Setting organization to ' + userOrg.name + ' with ID of ' + userOrg.id);
    task._writeLine('Getting list of environments...');
    org_id = userOrg.id;
    return cloudhubService.getEnvironments(userOrg.id);
})
.then(function(environmentsResponse) {
    task._writeLine('Finding specified environment...');
    var environmentId = getSpecifiedEnvironmentId(environmentsResponse.data, config.environmentname);
    env_id = environmentId;
    cloudhubService.setEnvironmentId(environmentId);
    
    task._writeLine('Getting application status for ' + config.domainname);
    return cloudhubService.getApplications(env_id,org_id);
      
})
.then(function(applicationRespose) {
   var appStatus =  getAppDetails(applicationRespose);
    if (appStatus) {
        task._writeLine('Application found!');
        task._writeLine('Redeploying...');
        return cloudhubService.deployApp(config.domainname, config.zipfilepath);
    }
    else {
        task._writeLine('Application not found!');
        task._writeLine('Creating new application...');
        //var newAppInfo = getNewAppInfo();
        return cloudhubService.createNewApp(config.domainname, config.zipfilepath, config.appInfo, config.autostart);
    }
})
.then(function(deployResponse) {
    if (config.autostart.toLowerCase() == 'true') {
        getStatus(config.domainname);
    }
    else {
        task.setResult(task.TaskResult.Succeeded, 'Application has been created successfully, but must be manually started.');
    }
}).then(function(){
    if(config.apiAutoDiscoveryID != null || config.apiAutoDiscoveryID != ""){
        console.log("init API promotion started for the API:" + config.apiAutoDiscoveryID);
        //getAppDetails(cloudhubService.getApplications(env_id,org_id));
        return cloudhubService.getApplications(sourceEnvId,org_id);
        //promtApi();
    }else{
        task.setResult(task.TaskResult.Failed, "No Api Id found for the API Auto Discovery");    
    }
    //return getAppDetails(cloudhubService.getApplications(env_id,org_id));
}).then(function(applicationResponse){
    getAppDetails(applicationResponse);
    //promtApi();
    return cloudhubService.promtApi(config.apiAutoDiscoveryID,org_id,env_id);
}).then(function(){
    console.log("END!!");
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
        env_props[environments[i].name.toLowerCase()] = environments[i].id;
    }
    if(specifiedEnvName == "uat"){
        sourceEnvId = env_props.development;
    }
    
    for (var i = 0; i < environments.length; i++) {
        
        var environment = environments[i];
        console.log(environment.name.toLowerCase());
        
        task._writeLine('Environment found: ' + environment.name);
        if (environment.name.toLowerCase() == specifiedEnvName) {
            return environment.id;
        }
    }
    task.setResult(task.TaskResult.Failed, 'Could not find any environment matching ' + environmentNameToFind);
    // TODO: Throw error here - no matching environment found
}

function getAppDetails(applications){
    console.log("in the get app details methos with the application response as: " + JSON.stringify(applications));

    for(var i = 0; i < applications.assets.length; i++){
        for(var j = 0; j < applications.assets[i].apis.length; j++){
            console.log(applications.assets[i].apis[j].id);
            console.log(config.apiAutoDiscoveryID);
            if(applications.assets[i].apis[j].id == config.apiAutoDiscoveryID){
                if(config.environmentname == "Development"){
                    targetEnvId = env_props.uat
                }
                else if(config.environmentname == "UAT"){
                    sourceEnvId = env_props.development;
                    targetEnvId = env_props.staging;
                }else if(config.environmentname == "Staging"){
                    targetEnvId = env_props.production
                }
                return true;
            }else {
                return false;
            }
        }
    }
    console.log("design_env" + ' ' + env_props.design);
    console.log("uat_env" + ' ' + env_props.uat);
    console.log("staging_env" + ' ' + env_props.staging);
    console.log("dev_env" + ' ' + env_props.development);
    console.log("production_env" + ' ' + env_props.production);
    console.log("target_env_id" + ' ' + targetEnvId);
}

function promtApi(apiId,org_id,targetEnvId){
    console.log("in the promtApi method");
    promotObj["promote"] = {
        "originApiId" : config.apiAutoDiscoveryID,
        "policies" : {
            "allEntities" : true
        },
        "tiers" : {
            "allEntities" : true
        },
        "alerts" : {
            "allEntities": true
        }
    }
    console.log("promote Object" + promotObj);
    var path = '/apimanager/api/v1/organizations/'+ org_id +'/environments/' + targetEnvId +'/apis'
    console.log("path" + path);
    cloudhubService.createRequest('POST', path, promotObj, undefined, 'bearer');
}

// * * * APPLICATION STATUS * * * //

function getStatus(domainName) {
    // "STARTED", "DEPLOYING", "UNDEPLOYED", "DEPLOYED_FAILED"
    // Make request every 5 seconds
    var start = Date.now();
    var timeoutLength = parseFloat(config.timeout) * 60;
    
    var statusInterval = setInterval(function() {
        cloudhubService.getApplication(domainName).then(function(statusResponse) {
            if (!statusResponse) {
                clearInterval(statusInterval);
                task.setResult(task.TaskResult.Failed, 'Could no longer find application');
            }
            var deployStatus = statusResponse.deploymentUpdateStatus;
            if (deployStatus == "DEPLOYING") {
                // App is still deploying, object does not exist after deployment
                task._writeLine('CURRENT STATUS: ' + deployStatus);
            }
            else {
                var status = statusResponse.status.toString();
                task._writeLine('CURRENT STATUS: ' + status);
                if (status == 'UNDEPLOYED') {}
                else if (status == 'STARTED') {
                    clearInterval(statusInterval);
                    //task.setResult(task.TaskResult.Succeeded, 'Application deployed successfully!');
                }
                else if (status == 'DEPLOYED_FAILED') {
                    task._writeLine('Application deployment FAILED');
                    clearInterval(statusInterval);
                    task.setResult(task.TaskResult.Failed, 'Application deployment failed. Please ensure zip file is formatted correctly');
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
    var domainName = task.getInput('domainname', true) || 'credera-test-1';
    var toReturn = {
        'username': task.getInput('username', true) || 'Mocdepdev',
        'password': task.getInput('password', true) || 'f2Au6\\c6',
        'domainname': domainName,
        'environmentname': task.getInput('environmentname', true) || 'VSTSExercises',
        'zipfilepath': getZipFilePath(), // './mstest-2.0.0-SNAPSHOT.zip',
        'timeout': task.getInput('timeout') || '10',
      
        'workersize': task.getInput('workersize', false),
        'muleversion': task.getInput('muleversion'),
        'autostart': task.getInput('autostart') || 'true',
        'apiAutoDiscoveryID' : task.getInput('apiAutoDiscoveryID')
    };
    toReturn['appInfo'] = getNewAppInfo(domainName);
    return toReturn;
}

// Micro, Small, Medium, Large, xLarge
function getNewAppInfo(domainName) {
    var newAppInfo = {
        'domain': domainName, //|| 'credera-test-1',
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

// * * * DYNAMIC ZIP FILE PATH * * * //
function getZipFilePath() {
    var fileName = task.getInput('zipfilename', true);
    var folder = task.getPathInput('zipfiledirectory', true).replace(/\"/g, "");
    task._writeLine('Looking for zip files in: ' + folder);
    task._writeLine("* * * START Files in Zip File Directory * * *");
    var matchingFilePath = getMatchingZipFileInDirectory(folder, fileName);
    task._writeLine("* * * END Files in Zip File Directory * * *");
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