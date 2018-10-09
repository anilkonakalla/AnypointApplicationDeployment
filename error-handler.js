var exports = module.exports = {};
var task = require('vsts-task-lib/task');

exports.getAppError = function(error) {
    var errorMessage = error;
    task._writeError("Could not retrieve the application. Ensure the Username, Password, and Environment are correct. These are all case-sensitive.");
    if (error.statusCode) {
        errorMessage = error.statusCode + " - " + error.statusMessage; 
    }
    logError(errorMessage);
}

exports.createAppError = function(error) {
    var errorMessage = error;
    task._writeError("Could not create the application. Ensure the domain is unique.");
    if (error.statusCode) {
        errorMessage = error.statusCode + " - " + error.statusMessage; 
    }
    logError(errorMessage);
}

exports.deployAppError = function(error) {
    var errorMessage = error;
    if (error.statusCode) {
        if (error.statusCode == 400) {
            task._writeError("Could not deploy the application. Ensure you have not exceeded your deployment limit.");
        }
        errorMessage = error.statusCode + " - " + error.statusMessage; 
    }
    logError(errorMessage)
}

function logError(errorMessage) {
    task.setResult(task.TaskResult.Failed, errorMessage);
}