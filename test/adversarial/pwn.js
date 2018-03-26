const exec = require('child_process').exec;

var execCommand = function(cmd, callback){
  exec(cmd, (error, stdout, stderr) => {
    if(error) return console.error(error);
    callback(stdout);
  });
};

execCommand('whoami', function(returnvalue){
  alert(returnvalue.slice(0, -1) + ' has been pwned.');
});
