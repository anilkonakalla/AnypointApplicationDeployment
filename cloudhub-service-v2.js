var exports = module.exports = {};
var http = require('https'),
    FormData = require('form-data'),
    fs = require('fs'),
    task = require('vsts-task-lib/task');

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

// * * * APPLICATIONS * * * //
exports.deployApp = function(domainName, filePath) {
    var path = '/cloudhub/api/v2/applications/'+ domainName + '/files';
    console.log(filePath);
    var form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    return createRequest('POST', path, form, form.getHeaders(), 'basic', true);
}

exports.createNewApp = function(domainName, filePath, workerOptions, autoStart) {
    var path = '/cloudhub/api/v2/applications';
    console.log(filePath);
    var form = new FormData();
    form.append('appInfoJson', JSON.stringify(workerOptions));
    form.append('autoStart', autoStart || 'true');
    form.append('file', fs.createReadStream(filePath));
    return createRequest('POST', path, form, form.getHeaders(), 'basic');
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
    var path = '/cloudhub/api/v2/applications/' + domainName;
    return createRequest('GET', path, undefined, undefined, 'basic')
}



function createRequest(method, path, body, headers, authType, noResponse) {
    var options = {
        method: method,
        host: 'anypoint.mulesoft.com',
        path: path,
        headers: headers || {}
    };
    console.log(path);
    setStaticHeaders(options, authType);
    var isJsonBody = body && body.constructor == {}.constructor;
    var isFormBody = body && !isJsonBody;
    if (isJsonBody) {
        options.headers['Content-Type'] = 'application/json';
    }
    
    return new Promise(function(success, failure) {
        var req = http.request(options);
        if (isJsonBody)
                req.write(JSON.stringify(body));
        else if (isFormBody)
            body.pipe(req);
        
        req.on('response', function(response) {
            var responseMessage = response.statusCode + ' ' + response.statusMessage;
            if (response.statusCode == 200 || response.statusCode == 201) {
                
                if (!noResponse) {
                    var responseBody = '';
                    response.on('data', function(chunk){
                        responseBody += chunk;
                    });
                    response.on('end', function(){
                        var parsedBody = JSON.parse(responseBody);
                        success(parsedBody);
                    });
                }
                else {
                    success(responseMessage);
                }
            }
            else if (response.statusCode == 404) {
                success(undefined);
            }
            else {
                failure(response);
            }
        });
    
        req.on('error', function(error) {
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
}