var exports = module.exports = {};
var http = require('https'),
    FormData = require('form-data'),
    fs = require('fs'),
    task = require('vsts-task-lib/task');
var ORG_ID_FLAG = false;
var ORGANIZATION_ID = '';
// * * * LOGIN * * * //
var BEARER_TOKEN = undefined;
var BASIC_AUTH = undefined;
exports.getBearerTokenAndSetBasicAuth = function(username, password) {
    var path = '/accounts/login';
    var credentialsBody = {
        "username": username,
        "password": password
    };
    BASIC_AUTH = new Buffer(username + ':' + password).toString('base64');
    return createRequest('POST', path, credentialsBody);
}
exports.setBearerToken = function(token) {
    BEARER_TOKEN = token;
}

// * * * ACCOUNTS * * * //
exports.getAccounts = function() {
    var path = '/accounts/api/me';
    return createRequest('GET', path, undefined, undefined, 'bearer');
}

// * * * ENVIRONMENTS * * * //
var ENVIRONMENT_ID = undefined;
exports.getEnvironments = function(organizationId) {
    var path = '/accounts/api/organizations/' + organizationId + '/environments';
    return createRequest('GET', path, undefined, undefined, 'bearer');
}
exports.setEnvironmentId = function(environmentId) {
    ENVIRONMENT_ID = environmentId;
    
}

// * * * Get Target ID (Servers, Server Groups) * * * //

exports.getTargetId = function(targettype) {
    var path = '/hybrid/api/v1/'+ targettype;
    //console.log("Target Type :" + targettype);
    ORG_ID_FLAG = true;
    return createRequest('GET', path, undefined, undefined, 'bearer');
}

// * * * APPLICATIONS * * * //

exports.deployOnpremApp = function(domainName, filePath,appId) {
    var path = '/hybrid/api/v1/applications/'+ appId;
    console.log(path);
    console.log(filePath);
    var form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    ORG_ID_FLAG = true;
    return createRequest('PATCH', path, form, form.getHeaders(), 'bearer');
}

exports.createNewOnpremApp = function(domainName, filePath, targetId, workerOptions, autoStart) {
    var path = '/hybrid/api/v1/applications';
    console.log(typeof filePath);
    //console.log(fs.statSync(filePath).isFile());
    var form = new FormData();
    form.append('artifactName', domainName);
    form.append('targetId', targetId);
    form.append('file', fs.createReadStream(filePath));
    return createRequest('POST', path, form, form.getHeaders(), 'bearer');
}

exports.setProperties = function() {
    var path = '/cloudhub/api/v2/applications';
    var form = new FormData();
    form.append('appInfoJson', JSON.stringify(workerOptions));
    form.append('autoStart', 'true');
    form.append('file', fs.createReadStream(filePath));
    return createRequest('PUT', path, form, form.getHeaders(), 'basic');
}

exports.getApplication = function(domainName) {
    var path = '/hybrid/api/v1/applications/' + domainName;
    ORG_ID_FLAG = true;
    return createRequest('GET', path, undefined, undefined, 'bearer')
}

exports.getOnPremApplications = function(orgID,orgIdFlag) {

    var path = '/hybrid/api/v1/applications/';
    ORG_ID_FLAG = orgIdFlag;
ORGANIZATION_ID = orgID;
    return createRequest('GET', path, undefined, undefined, 'bearer')
}



function createRequest(method, path, body, headers, authType, noResponse) {
    var options = {
        method: method,
        host: 'anypoint.mulesoft.com',
        path: path,
        headers: headers || {}
    };
    console.log(path);
    //console.log(body);
    setStaticHeaders(options, authType);
    console.log("method : " + options.method);
    console.log("host : " + options.host);
    console.log("path : " + options.path);

    
    var isJsonBody = body && body.constructor == {}.constructor;
    var isFormBody = body && !isJsonBody;
    if (isJsonBody || isJsonBody == undefined) {
        //console.log("is Json Body");
        options.headers['Content-Type'] = 'application/json';
    }
       if(method == 'PATCH'){
    console.log("Authorization : " + headers['Authorization']);
    console.log("X-ANYPNT-ENV-ID : " + headers['X-ANYPNT-ENV-ID']);
    console.log("X-ANYPNT-ORG-ID : " + headers['X-ANYPNT-ORG-ID']);
    }
    return new Promise(function(success, failure) {
        var req = http.request(options);
        if (isJsonBody)
                req.write(JSON.stringify(body));
        else if (isFormBody)
            body.pipe(req);
        
        req.on('response', function(response) {
            var responseMessage = response.statusCode + ' ' + response.statusMessage;
            if (response.statusCode == 200 || response.statusCode == 201 || response.statusCode == 202) {
                
                if (!noResponse) {
                    var responseBody = '';
                    response.on('data', function(chunk){
                        responseBody += chunk;
                    });
                    response.on('end', function(){
                        var parsedBody = JSON.parse(responseBody);
                        //console.log(responseBody)
                        success(parsedBody);
                    });
                }
                else {
                    console.log(responseMessage);
                    success(responseMessage);
                }
            }
            else if (response.statusCode == 404) {
                success(undefined);
            }
            else {
                console.log("in failure block");
                //console.log(response);
                failure(response);
            }
        });
    
        req.on('error', function(error) {
            console.log("in error block");
            console.log("error :" + error);
            var responseMessage = error.name + ' ERROR: ' + error.message;
            failure(responseMessage);
        });
        if (!isFormBody)
            req.end();
    });
}

function setStaticHeaders(options, authType) {
    if (authType == 'bearer') {
        options.headers['Authorization'] = 'bearer ' + BEARER_TOKEN;
    }
    else if (authType == 'basic') {
        options.headers['Authorization'] = 'Basic ' + BASIC_AUTH;
    }
    if (ENVIRONMENT_ID) {
        options.headers['X-ANYPNT-ENV-ID'] = ENVIRONMENT_ID;
    }
    if(ORG_ID_FLAG){
        options.headers['X-ANYPNT-ORG-ID'] = ORGANIZATION_ID;
    }
}