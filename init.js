var fs = require('fs')
var path = require('path')
var net = require('net')
var child = require('child_process')

var Projects = {}
var Condidats = {}
var NumTCP = 0
var Logging = {}
var TCPServer = false
var TCPPort = false
var LogHistory = []

function log() {
  var args = Array.prototype.slice.call(arguments)
  var lines = args.join(' ').split("\n")
  for(var i in lines) {
    var str = lines[i]
    LogHistory.push(str)
    if (LogHistory.length > 40) {
      LogHistory.shift()
    }
    for(var i in Logging) {
      Logging[i].write(str+"\n")
    }
    console.log(str);
  }
}

function dataToLines(obj, callback) {
  var d = '';
  obj.on('data', function(data) {
    var part = data.toString().split("\n")
    while(part.length) {
      d += part.shift()
      if (part.length) {
        callback(d);
        d = ''
      }
    }
  })
}

function run(name, params) {
  Projects[name] = params
  var projectPath = path.resolve(__dirname, params.path)
  var process = child.fork(projectPath, [], {silent: true})
  Projects[name].log = []
  Projects[name].watching = {}
  dataToLines(process.stdout, function(line) {
    Projects[name].log.push(line)
    if (Projects[name].log.length > 40) {
      Projects[name].log.shift()
    }

    for(var i in Projects[name].watching) {
      var c = Projects[name].watching[i]
      c.write(line+"\n")
    }
  })
  Projects[name].process = process
}

function stop(name) {
  Projects[name].process.kill()
  delete Projects[name]
}

function updateConfig(configPath) {
  log('starting')
  fs.readFile(configPath, function (err, data) {
    if (err) {
      log('[error] config read error', err.message)
    }
    try {
      var confData = eval('({'+data.toString()+'})')
    } catch(e) {
      log('[error] config syntax:', e.message)
    }
    Condidats = confData.projects
    for (var i in Condidats) {
      if (!Projects[i]) {
        log('run '+i)
        run(i, Condidats[i])
      } else if (Projects[i].path != Condidats[i].path) {
        log('restart '+i)
        stop(i)
        run(i, Condidats[i])
      }
    }
    if (!TCPPort) {
      startTCP(confData.port)
    } else if (TCPPort != confData.port) {
      log('port changed. new port = '+confData.port)
      stopTCP();
      startTCP(confData.port)
    }
  });

  var watchTimeout = false
  fs.watch(configPath, {persistent: true}, function (curr, prev) {
    if (!watchTimeout) {
      watchTimeout = setTimeout(function() {
        log('config changed')
        updateConfig(configPath)
      }, 100)
    }
  });
}

function command(cmd, args, c, connectNum) {
  switch(cmd) {
    case 'list':
      for(var i in Projects) {
        c.write(i+"\n")
      }
      c.end()
      break
    case 'exit':
      c.end()
      break
    case 'log':
      for(var i in LogHistory) {
        c.write(LogHistory[i]+"\n")
      }
      Logging[connectNum] = c
      break
    case 'restart':
      var name = args.shift()
      if (Projects[name]) {
        log(name+' restarted')
        stop(name)
        run(name, Condidats[name])
        c.write(name+" restarted\n")
      } else {
        c.write("no such project\n")
      }
      c.end()
      break
    default:
      if (Projects[cmd]) {
        var projectLog = Projects[cmd].log
        for(var i in projectLog) {
          c.write(projectLog[i]+"\n")
        }
        Projects[cmd].watching[connectNum] = c
      } else {
        c.write('unknown command `'+cmd+'`')
        c.end()
      }
      break
  }
}

function startTCP(port) {
  TCPPort = port;
  TCPServer = net.createServer(function(c) { //'connection' listener
    var connectNum = ++NumTCP
    c.on('end', function() {
      delete Logging[connectNum]
      for(var i in Projects) {
        delete Projects[i].watching[connectNum]
      }
    });
    dataToLines(c, function(line) {
      var args = line.trim().split(' ');
      var cmd = args.shift();
      command(cmd, args, c, connectNum)
    })
  });
  TCPServer.listen(port)
}

function stopTCP() {
  if (TCPServer) {
    TCPServer.close()
    TCPServer = false
  }
}

function onExit() {
  stopTCP()
  for(var i in Projects) {
    var process = Projects[i].process
    if (process) {
      process.kill()
    }
    delete Projects[i]
  }
}

process.on('exit', onExit);
process.on('SIGINT', function() {
  onExit()
  process.exit()
});
process.on('uncaughtException', function(opts, err) {
  if (err) {
    console.err(err)
  }
});

updateConfig(path.resolve(__dirname, 'config.json'))
